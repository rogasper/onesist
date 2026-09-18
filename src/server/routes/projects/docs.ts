import fs from "node:fs";
import path from "node:path";
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
  const diagramSvgPngs: string[] = Array.isArray((data as any).diagramSvgPngs) ? (data as any).diagramSvgPngs.map((d: unknown) => String(d)) : [];
  const rawSvgPngs: string[] = Array.isArray((data as any).rawSvgPngs) ? (data as any).rawSvgPngs.map((d: unknown) => String(d)) : [];
  const meta: Record<string, string> = {
    customerName: String((data.meta as any)?.customerName ?? proj?.customerName ?? ""),
    projectName: String((data.meta as any)?.projectName ?? proj?.name ?? ""),
    projectId: String((data.meta as any)?.projectId ?? params.id),
    version: String((data.meta as any)?.version ?? proj?.docVersion ?? "1.0.0"),
    author: String((data.meta as any)?.author ?? proj?.docAuthor ?? ""),
  };
  if (!contentMd) return json({ error: "Missing contentMd" }, 400);
  const { buildDocx } = await import("~/lib/docx-export");
  const buf = await buildDocx({ contentMd, diagramPngs, diagramSvgPngs, rawSvgPngs, meta: meta as unknown as DocMeta });
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

// GET /api/projects/:id/project-files — EVERY file worth mentioning in the chat
// composer's `@` popup.
//
// Deliberately wider than `docs/files` above, which answers a different question
// (which DOCUMENTS may be attached to a doc note). The chat agent works on the
// whole workspace: FSD sources can sit in a folder the user made themselves
// (`fsd/sources/…`), artifacts live under `output/`, and a file may be worth
// pointing at before it exists in either. Restricting this popup to
// `input/` + `output/` meant the one file the user wanted to mention was the one
// file the popup refused to show.
router.get("projects/:id/project-files", ({ params }) => {
  const { rootPath } = getCtx(params.id);
  const files: { name: string; path: string }[] = [];
  const CAP = 800;
  // Skipped because they are either machine output (node_modules, dist, target)
  // or listed by another trigger: `.agents/skills` and `.agents/agents` belong to
  // `$` and to the subagent picker, and listing every SKILL.md here would bury
  // the actual workspace files under them.
  const SKIP = new Set(["node_modules", ".git", "dist", "binaries", "target", ".cache", ".next", ".turbo", "coverage", ".mastra"]);

  const walk = (dir: string, prefix: string, depth: number) => {
    if (files.length >= CAP) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= CAP) return;
      if (entry.name.startsWith(".") && entry.name !== ".agents") continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP.has(entry.name)) continue;
        if (rel === ".agents/skills" || rel === ".agents/agents") continue;
        if (depth >= 6) continue;
        walk(path.join(dir, entry.name), rel, depth + 1);
      } else if (entry.isFile()) {
        files.push({ name: entry.name, path: rel });
      }
    }
  };
  walk(rootPath, "", 0);

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
