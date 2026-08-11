import fs from "node:fs";
import path from "node:path";
import { eq, desc } from "drizzle-orm";
import { json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { resolveRoot, hashContent } from "../../http/route-utils";
import { convertToMarkdown, fsdPaths, saveFsdImage, saveFsdUpload, scanFsdDir } from "../../services/fsd-service";
import { db } from "~/server/db/client";
import { fsdSessions } from "~/server/db/schema";

export const router = new Router();

// GET /api/projects/:id/fsd
router.get("projects/:id/fsd", ({ params }) => {
  const result = db.select().from(fsdSessions).where(eq(fsdSessions.projectId, params.id)).orderBy(desc(fsdSessions.updatedAt)).all();
  return json(result);
});

// POST /api/projects/:id/fsd — create a new FSD document
router.post("projects/:id/fsd", async ({ params, body }) => {
  const data = await body();
  const root = resolveRoot(params.id);
  const title = (data.title as string)?.trim() || "Untitled FSD";
  const filename = (data.filename as string)?.trim() || `${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "fsd"}.md`;
  const safeName = filename.replace(/[^\w.\- ]+/g, "_").replace(/\.{2,}/g, ".");
  const now = new Date().toISOString();
  const content = (data.content as string) ?? `# ${title}\n\n## Context\n\n## Discussion Notes\n\n## Problem Statement\n\n## Goals\n\n## Scope\n\n### In Scope\n\n### Out of Scope\n\n## Actors\n\n## Functional Requirements\n\n## Non-functional Requirements\n\n## User Flow\n\n## Data Requirements\n\n## API Requirements\n\n## Acceptance Criteria\n\n## Open Questions\n\n## Notes\n`;
  const relPath = `input/fsd/${safeName}`;
  const fullPath = path.join(fsdPaths(root).fsdDir, safeName);
  if (fs.existsSync(fullPath)) return json({ error: `File already exists: ${safeName}` }, 409);
  try { fs.mkdirSync(fsdPaths(root).fsdDir, { recursive: true }); } catch {}
  fs.writeFileSync(fullPath, content, "utf-8");
  const hash = hashContent(content);
  const session = {
    id: crypto.randomUUID(),
    projectId: params.id,
    fsdInputPath: safeName,
    fsdContent: content,
    mode: "generate",
    status: "draft",
    title,
    sourceType: "manual",
    markdownPath: relPath,
    contentHash: hash,
    artifactsJson: JSON.stringify({ spec: [], erd: [], task: [] }),
    createdAt: now,
    updatedAt: now,
  };
  db.insert(fsdSessions).values(session).run();
  return json(session, 201);
});

// POST /api/projects/:id/fsd/scan — recursive scan + upsert
router.post("projects/:id/fsd/scan", ({ params }) => {
  const result = scanFsdDir(params.id, resolveRoot(params.id));
  return json({ scanned: result.scanned, total: result.total });
});

// POST /api/projects/:id/fsd/upload — save the file only; conversion is manual.
// Body: raw file bytes. Query: ?filename=<base64>
router.post("projects/:id/fsd/upload", async (ctx) => {
  try {
    const filenameRaw = new URL(ctx.request.url).searchParams.get("filename") ?? "";
    let originalName = "";
    try { originalName = Buffer.from(filenameRaw, "base64").toString("utf-8"); } catch {}
    const buf = Buffer.from(await ctx.request.arrayBuffer());
    const result = saveFsdUpload(resolveRoot(ctx.params.id), originalName, buf);
    if (result.error) return json({ error: result.error }, result.status ?? 400);
    return json({
      uploaded: result.uploaded,
      fileName: result.fileName,
      sourcePath: result.sourcePath,
      needsConversion: result.needsConversion,
      message: result.message,
    }, 201);
  } catch (e: any) {
    return json({ error: `Upload failed: ${e?.message ?? e}` }, 500);
  }
});

// POST /api/projects/:id/fsd/upload-image — save an image pasted/dropped into the
// editor into input/fsd/images/. Body: raw file bytes. Query: ?filename=<base64>
router.post("projects/:id/fsd/upload-image", async (ctx) => {
  try {
    const filenameRaw = new URL(ctx.request.url).searchParams.get("filename") ?? "";
    let originalName = "";
    try { originalName = Buffer.from(filenameRaw, "base64").toString("utf-8"); } catch {}
    const buf = Buffer.from(await ctx.request.arrayBuffer());
    const result = saveFsdImage(resolveRoot(ctx.params.id), originalName, buf);
    if (result.error) return json({ error: result.error }, result.status ?? 400);
    return json({ uploaded: result.uploaded, path: result.sourcePath }, 201);
  } catch (e: any) {
    return json({ error: `Image upload failed: ${e?.message ?? e}` }, 500);
  }
});

// POST /api/projects/:id/fsd/convert-file — manually convert an uploaded file
// in the background with OpenCode + the project's markitdown skill.
router.post("projects/:id/fsd/convert-file", async ({ params, body }) => {
  const data = await body();
  const sourcePath = typeof data.sourcePath === "string" ? data.sourcePath : "";
  if (!sourcePath || !sourcePath.startsWith("input/fsd/sources/") || sourcePath.includes("..")) {
    return json({ error: "Invalid source path" }, 400);
  }
  const root = resolveRoot(params.id);
  const sourceFullPath = path.join(root, sourcePath);
  if (!fs.existsSync(sourceFullPath)) return json({ error: "Source file missing on disk" }, 404);

  const sourceName = path.basename(sourcePath);
  const stem = sourceName.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.\- ]+/g, "_");
  const outputPath = path.join(fsdPaths(root).fsdDir, `${stem}.md`);
  const markdownPath = `input/fsd/${stem}.md`;
  const { eventBus } = await import("../../realtime/events");
  eventBus.emitFsdConversion(sourcePath, "converting");

  void (async () => {
    try {
      const result = await convertToMarkdown(sourceFullPath);
      if (!result.ok || !result.markdown) {
        eventBus.emitFsdConversion(sourcePath, "failed", result.error);
        return;
      }
      const output = `---\nsource_file: ${sourceName}\nsource_type: ${path.extname(sourceName).slice(1)}\nconverted_by: ${result.tool}\nconverted_at: ${new Date().toISOString()}\n---\n\n${result.markdown}`;
      fs.writeFileSync(outputPath, output, "utf-8");
      eventBus.emitFsdConversion(sourcePath, "converted", null, output.length);
    } catch (e: any) {
      eventBus.emitFsdConversion(sourcePath, "failed", e?.message ?? String(e));
    }
  })();

  return json({ accepted: true, status: "converting", sourcePath, markdownPath }, 202);
});

// GET /api/projects/:id/fsd/:sessionId
router.get("projects/:id/fsd/:sessionId", ({ params }) => {
  const result = db.select().from(fsdSessions).where(eq(fsdSessions.id, params.sessionId)).get();
  return result ? json(result) : notFound();
});

// DELETE /api/projects/:id/fsd/:sessionId
router.delete("projects/:id/fsd/:sessionId", ({ params }) => {
  const sessionId = params.sessionId;
  const session = db.select().from(fsdSessions).where(eq(fsdSessions.id, sessionId)).get() as any;
  if (session) {
    // Remove the editable markdown + original source from disk
    const root = resolveRoot(params.id);
    const paths = [session.markdownPath, session.sourceFilePath]
      .filter(Boolean)
      .map((p: string) => path.join(root, p));
    for (const p of paths) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch {}
    }
  }
  db.delete(fsdSessions).where(eq(fsdSessions.id, sessionId)).run();
  return json({ deleted: true });
});

// PUT /api/projects/:id/fsd/:sessionId
router.put("projects/:id/fsd/:sessionId", async ({ params, body }) => {
  const sessionId = params.sessionId;
  const data = await body();
  const now = new Date().toISOString();
  const session = db.select().from(fsdSessions).where(eq(fsdSessions.id, sessionId)).get() as any;
  if (!session) return notFound();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (typeof data.content === "string") {
    // Persist to the source Markdown file (source of truth)
    const root = resolveRoot(params.id);
    const rel = (session.markdownPath as string) ?? (session.fsdInputPath ? `input/fsd/${session.fsdInputPath}` : null);
    if (rel) {
      try {
        const full = path.join(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, data.content, "utf-8");
      } catch {}
    }
    updates.fsdContent = data.content;
    updates.contentHash = hashContent(data.content);
  }
  if (data.status !== undefined) updates.status = data.status;
  if (data.title !== undefined) updates.title = data.title;
  if (data.completenessJson !== undefined) updates.completenessJson = data.completenessJson;
  db.update(fsdSessions).set(updates).where(eq(fsdSessions.id, sessionId)).run();
  const updated = db.select().from(fsdSessions).where(eq(fsdSessions.id, sessionId)).get();
  return json(updated);
});

// POST /api/projects/:id/fsd/:sessionId/check — completeness check
router.post("projects/:id/fsd/:sessionId/check", async ({ params }) => {
  const session = db.select().from(fsdSessions).where(eq(fsdSessions.id, params.sessionId)).get() as any;
  if (!session) return notFound();
  const { checkCompleteness } = await import("~/lib/fsd-completeness");
  const result = checkCompleteness(session.fsdContent ?? "");
  db.update(fsdSessions).set({ completenessJson: JSON.stringify(result), updatedAt: new Date().toISOString() }).where(eq(fsdSessions.id, params.sessionId)).run();
  return json(result);
});

// POST /api/projects/:id/fsd/:sessionId/convert — convert uploaded file to Markdown
// via headless opencode + markitdown skill, runs in the background
router.post("projects/:id/fsd/:sessionId/convert", async ({ params }) => {
  const sessionId = params.sessionId;
  const session = db.select().from(fsdSessions).where(eq(fsdSessions.id, sessionId)).get() as any;
  if (!session) return notFound();
  if (session.conversionStatus === "converting") return json({ error: "Already converting" }, 409);
  if (!session.sourceFilePath) return json({ error: "No source file to convert" }, 400);
  const root = resolveRoot(params.id);
  const sourceFullPath = path.join(root, session.sourceFilePath);
  if (!fs.existsSync(sourceFullPath)) return json({ error: "Source file missing on disk" }, 404);

  const sourceName = path.basename(session.sourceFilePath);
  const outputStem = sourceName.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.\- ]+/g, "_");
  const outputFileName = `${outputStem}.md`;
  const outputMarkdownPath = `input/fsd/${outputFileName}`;
  const mdFullPath = path.join(root, session.markdownPath ?? outputMarkdownPath);
  const title = session.title ?? session.fsdInputPath ?? "Document";
  const now = new Date().toISOString();

  db.update(fsdSessions).set({
    conversionStatus: "converting",
    conversionError: null,
    updatedAt: now,
  }).where(eq(fsdSessions.id, sessionId)).run();
  const { eventBus } = await import("../../realtime/events");
  eventBus.emitFsdConversion(sessionId, "converting");

  void (async () => {
    try {
      const result = await convertToMarkdown(sourceFullPath);
      const sourceType = (session.sourceType ?? "file").replace("manual", "file");
      const tool = result.tool ?? "opencode-markitdown-skill";
      if (result.ok && result.markdown) {
        const finalMd = `---\nsource_file: ${path.basename(session.sourceFilePath)}\nsource_type: ${sourceType}\nconverted_by: ${tool}\nconverted_at: ${new Date().toISOString()}\n---\n\n# ${title}\n\n${result.markdown}`;
        fs.writeFileSync(mdFullPath, finalMd, "utf-8");
        const hash = hashContent(finalMd);
        db.update(fsdSessions).set({
          fsdContent: finalMd,
          fsdInputPath: outputFileName,
          markdownPath: outputMarkdownPath,
          contentHash: hash,
          conversionStatus: "converted",
          conversionError: null,
          updatedAt: new Date().toISOString(),
        }).where(eq(fsdSessions.id, sessionId)).run();
        eventBus.emitFsdConversion(sessionId, "converted", null, finalMd.length);
      } else {
        const error = result.error;
        const failedMd = `---\nsource_file: ${path.basename(session.sourceFilePath)}\nsource_type: ${sourceType}\nconverted_by: ${tool}\nconverted_at: ${new Date().toISOString()}\n---\n\n# ${title}\n\n> **Conversion failed.** The original file is preserved at \`${session.sourceFilePath}\`.\n> Error: ${error}\n\nYou can paste the content manually below.\n`;
        fs.writeFileSync(mdFullPath, failedMd, "utf-8");
        db.update(fsdSessions).set({
          fsdContent: failedMd,
          conversionStatus: "failed",
          conversionError: error,
          updatedAt: new Date().toISOString(),
        }).where(eq(fsdSessions.id, sessionId)).run();
        eventBus.emitFsdConversion(sessionId, "failed", error);
      }
    } catch (e: any) {
      const err = e?.message ?? String(e);
      db.update(fsdSessions).set({
        conversionStatus: "failed",
        conversionError: err,
        updatedAt: new Date().toISOString(),
      }).where(eq(fsdSessions.id, sessionId)).run();
      eventBus.emitFsdConversion(sessionId, "failed", err);
    }
  })();

  return json({ ok: true, conversionStatus: "converting" }, 202);
});

// POST /api/projects/:id/fsd/:sessionId/ready — mark ready
router.post("projects/:id/fsd/:sessionId/ready", async ({ params }) => {
  const session = db.select().from(fsdSessions).where(eq(fsdSessions.id, params.sessionId)).get() as any;
  if (!session) return notFound();
  const { checkCompleteness } = await import("~/lib/fsd-completeness");
  const result = checkCompleteness(session.fsdContent ?? "");
  db.update(fsdSessions).set({
    completenessJson: JSON.stringify(result),
    status: result.missing.length === 0 ? "ready" : "draft",
    updatedAt: new Date().toISOString(),
  }).where(eq(fsdSessions.id, params.sessionId)).run();
  return json({ ...db.select().from(fsdSessions).where(eq(fsdSessions.id, params.sessionId)).get(), completeness: result });
});
