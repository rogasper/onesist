import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { getProject } from "../../http/route-utils";
import { readFile } from "~/lib/file-router";
import { parseMarkdownToModules } from "~/lib/spec-parser";
import { db } from "~/server/db/client";
import { apiEndpoints, apiSpecs } from "~/server/db/schema";

export const router = new Router();

// GET /api/projects/:id/specs
router.get("projects/:id/specs", ({ params }) => {
  const result = db.select().from(apiSpecs).where(eq(apiSpecs.projectId, params.id)).all();
  return json(result);
});

// GET /api/projects/:id/specs/:specId/endpoints
router.get("projects/:id/specs/:specId/endpoints", ({ params }) => {
  const result = db.select().from(apiEndpoints)
    .where(eq(apiEndpoints.specId, params.specId))
    .orderBy(apiEndpoints.sortOrder)
    .all();
  return json(result);
});

// DELETE /api/projects/:id/specs/:specId
router.delete("projects/:id/specs/:specId", ({ params }) => {
  db.delete(apiEndpoints).where(eq(apiEndpoints.specId, params.specId)).run();
  db.delete(apiSpecs).where(eq(apiSpecs.id, params.specId)).run();
  return json({ deleted: true });
});

// POST /api/projects/:id/specs/import — parse all spec files and persist to SQLite
router.post("projects/:id/specs/import", async ({ params }) => {
  const id = params.id;
  const proj = getProject(id);
  if (!proj) return notFound();
  const rootPath = proj.rootPath || (process.env.SA_ROOT ? path.resolve(process.env.SA_ROOT) : path.resolve(process.cwd(), ".."));
  const now = new Date().toISOString();

  // Delete existing spec data for this project
  const existingSpecs = db.select().from(apiSpecs).where(eq(apiSpecs.projectId, id)).all();
  for (const spec of existingSpecs) {
    db.delete(apiEndpoints).where(eq(apiEndpoints.specId, spec.id)).run();
  }
  db.delete(apiSpecs).where(eq(apiSpecs.projectId, id)).run();

  let totalSpecs = 0;
  let totalEndpoints = 0;

  const persistSpec = (sourceName: string, moduleName: string, endpoints: any[]) => {
    const specId = crypto.randomUUID();
    db.insert(apiSpecs).values({
      id: specId, projectId: id,
      name: `${sourceName}: ${moduleName}`,
      markdownContent: null,
      createdAt: now, updatedAt: now,
    }).run();
    endpoints.forEach((ep, idx) => {
      db.insert(apiEndpoints).values({
        id: crypto.randomUUID(), specId,
        method: ep.method || "NO_METHOD",
        path: ep.path || ep.no || "/",
        module: moduleName,
        purpose: ep.purpose || null,
        bodySchema: ep.body || null,
        responseSchema: ep.response || null,
        sortOrder: idx,
      }).run();
    });
    totalSpecs++;
    totalEndpoints += endpoints.length;
  };

  // Parse MASTER_SPEC_API.md
  const masterContent = readFile(rootPath, "MASTER_SPEC_API.md");
  if (masterContent) {
    const modules = parseMarkdownToModules(masterContent);
    for (const mod of modules) {
      if (mod.endpoints.length === 0) continue;
      persistSpec("MASTER", mod.fullName, mod.endpoints);
    }
  }

  // Parse output/**/*.md spec files recursively
  const outputDir = path.join(rootPath, "output");
  try {
    if (fs.existsSync(outputDir)) {
      const walkForSpecs = (dir: string, relPrefix: string) => {
        try {
          const items = fs.readdirSync(dir, { withFileTypes: true });
          for (const item of items) {
            const full = path.join(dir, item.name);
            const rel = relPrefix ? path.join(relPrefix, item.name) : item.name;
            if (item.isFile() && item.name.endsWith(".md") && /(spec_api|existing_cms_tsl)/.test(item.name)) {
              const content = readFile(rootPath, rel);
              if (!content) continue;
              const modules = parseMarkdownToModules(content);
              for (const mod of modules) {
                if (mod.endpoints.length === 0) continue;
                persistSpec(item.name.replace(/\.md$/, ""), mod.fullName, mod.endpoints);
              }
            } else if (item.isDirectory() && !item.name.startsWith(".")) {
              walkForSpecs(full, rel);
            }
          }
        } catch {}
      };
      walkForSpecs(outputDir, "output");
    }
  } catch {}

  return json({ imported: { specs: totalSpecs, endpoints: totalEndpoints } });
});
