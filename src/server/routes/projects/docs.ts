import fs from "node:fs";
import { eq } from "drizzle-orm";
import type { DocMeta } from "~/shared/types";
import { json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { defaultRoot, getProject } from "../../http/route-utils";
import { readFile, writeFile, scanDirectory } from "~/lib/file-router";
import { DOC_TEMPLATE_PATH, DEFAULT_TEMPLATE } from "~/lib/doc-template";
import { db } from "~/server/db/client";
import { projects } from "~/server/db/schema";

export const router = new Router();

const getCtx = (projectId: string) => {
  const proj = getProject(projectId) || {};
  return {
    rootPath: (proj.rootPath as string) || defaultRoot(),
    proj,
  };
};

// GET /api/projects/:id/docs/meta
router.get("projects/:id/docs/meta", ({ params }) => {
  const { proj } = getCtx(params.id);
  return json(defaultMeta(params.id, proj));
});

// PUT /api/projects/:id/docs/meta
router.put("projects/:id/docs/meta", async ({ params, body }) => {
  const data = await body();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (data.customerName !== undefined) updates.customerName = String(data.customerName);
  if (data.version !== undefined) updates.docVersion = String(data.version);
  if (data.author !== undefined) updates.docAuthor = String(data.author);
  db.update(projects).set(updates).where(eq(projects.id, params.id)).run();
  return json({ saved: true, ...defaultMeta(params.id, getProject(params.id)), ...updates });
});

// POST /api/projects/:id/docs/template/reset
router.post("projects/:id/docs/template/reset", ({ params }) => {
  const { rootPath } = getCtx(params.id);
  const ok = writeFile(rootPath, DOC_TEMPLATE_PATH, DEFAULT_TEMPLATE);
  return json({ saved: ok, path: DOC_TEMPLATE_PATH });
});

// GET /api/projects/:id/docs/template
router.get("projects/:id/docs/template", ({ params }) => {
  const { rootPath } = getCtx(params.id);
  let content = readFile(rootPath, DOC_TEMPLATE_PATH);
  if (content === null) {
    content = DEFAULT_TEMPLATE;
    writeFile(rootPath, DOC_TEMPLATE_PATH, content);
  }
  return json({ content, path: DOC_TEMPLATE_PATH, exists: readFile(rootPath, DOC_TEMPLATE_PATH) !== null });
});

// PUT /api/projects/:id/docs/template
router.put("projects/:id/docs/template", async ({ params, body }) => {
  const data = await body();
  const { rootPath } = getCtx(params.id);
  const ok = writeFile(rootPath, DOC_TEMPLATE_PATH, String(data.content ?? ""));
  return json({ saved: ok, path: DOC_TEMPLATE_PATH });
});

// POST /api/projects/:id/docs/export
router.post("projects/:id/docs/export", async ({ params, body }) => {
  const data = await body();
  const { proj } = getCtx(params.id);
  const contentMd = String(data.contentMd ?? "");
  const diagramPngs: string[] = Array.isArray(data.diagramPngs) ? data.diagramPngs.map((d: unknown) => String(d)) : [];
  const meta: Record<string, string> = {
    customerName: String((data.meta as any)?.customerName ?? proj?.customerName ?? ""),
    projectName: String((data.meta as any)?.projectName ?? proj?.name ?? ""),
    projectId: String((data.meta as any)?.projectId ?? params.id),
    version: String((data.meta as any)?.version ?? proj?.docVersion ?? "1.0.0"),
    author: String((data.meta as any)?.author ?? proj?.docAuthor ?? ""),
  };
  if (!contentMd) return json({ error: "Missing contentMd" }, 400);
  const { buildDocx } = await import("~/lib/docx-export");
  const buf = await buildDocx({ contentMd, diagramPngs, meta: meta as unknown as DocMeta });
  const safeName = (meta.projectName || "project").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40) || "project";
  const filename = `Technical-Documentation-${safeName}-${meta.version || "1.0.0"}.docx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});

// GET /api/projects/:id/docs/files — flat list of project files for @mentions
router.get("projects/:id/docs/files", ({ params }) => {
  const { rootPath } = getCtx(params.id);
  const ALLOWED = /\.(md|dbml|ya?ml|json)$/i;
  const seen = new Set<string>();
  const files: { name: string; path: string }[] = [];
  for (const dir of ["input", "output"]) {
    for (const f of scanDirectory(rootPath, dir)) {
      if (ALLOWED.test(f.name) && !seen.has(f.path)) {
        seen.add(f.path);
        files.push({ name: f.name, path: f.path });
      }
    }
  }
  try {
    for (const entry of fs.readdirSync(rootPath, { withFileTypes: true })) {
      if (entry.isFile() && ALLOWED.test(entry.name) && !seen.has(entry.name)) {
        files.push({ name: entry.name, path: entry.name });
      }
    }
  } catch {}
  files.sort((a, b) => a.path.localeCompare(b.path));
  return json({ files });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function defaultMeta(projectId: string, proj: any) {
  return {
    customerName: proj?.customerName ?? "",
    projectName: proj?.name ?? "",
    projectId,
    version: proj?.docVersion ?? "1.0.0",
    author: proj?.docAuthor ?? "",
  };
}
