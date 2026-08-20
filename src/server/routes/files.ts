import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { json } from "../http/response";
import { Router } from "../http/router";
import { resolveRoot } from "../http/route-utils";
import { db } from "~/server/db/client";
import { fsdSessions } from "~/server/db/schema";
import {
  deleteFile,
  copyFile,
  moveFile,
  readFile,
  renameFile,
  scanDirectory,
  writeFile,
  getProjectSummary,
  searchProjectFiles,
} from "~/lib/file-router";

export const router = new Router();

// GET /api/files/search
router.get("files/search", ({ query }) => {
  const q = query.get("q") || "";
  const projectId = query.get("projectId");
  const mode = (query.get("mode") as "all" | "filename" | "content") || "all";
  const limit = Math.min(parseInt(query.get("limit") || "40", 10) || 40, 100);
  const root = resolveRoot(projectId);
  return json(searchProjectFiles(root, q, mode, limit));
});

// GET /api/files/list
router.get("files/list", ({ query }) => {
  const subDir = query.get("dir") || "output";
  const projectId = query.get("projectId");
  return json(scanDirectory(resolveRoot(projectId), subDir));
});

// GET /api/files/read
router.get("files/read", ({ query }) => {
  const filePath = query.get("path");
  const projectId = query.get("projectId");
  if (!filePath) return json({ error: "Missing path" }, 400);
  const content = readFile(resolveRoot(projectId), filePath);
  return content !== null ? json({ content }) : json({ error: "Not found" }, 404);
});

// GET /api/files/image — raw binary image serving so <img src> can render project files.
router.get("files/image", ({ query }) => {
  const filePath = query.get("path");
  const projectId = query.get("projectId");
  if (!filePath || filePath.includes("..")) return json({ error: "Missing or invalid path" }, 400);
  const fullPath = path.join(resolveRoot(projectId), filePath);
  try {
    const buf = fs.readFileSync(fullPath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const types: Record<string, string> = {
      png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
      webp: "image/webp", svg: "image/svg+xml", avif: "image/avif",
    };
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": types[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return json({ error: "Not found" }, 404);
  }
});

// POST /api/files/write
router.post("files/write", async ({ body }) => {
  const data = await body();
  const filePath = data.path as string;
  const projectId = data.projectId as string;
  const content = data.content as string;
  if (!filePath || content === undefined) return json({ error: "Missing path or content" }, 400);
  const ok = writeFile(resolveRoot(projectId), filePath, content);
  return json({ saved: ok, path: filePath });
});

// DELETE /api/files/delete
router.delete("files/delete", ({ query }) => {
  const filePath = query.get("path");
  const projectId = query.get("projectId");
  if (!filePath) return json({ error: "Missing path" }, 400);
  return json({ deleted: deleteFile(resolveRoot(projectId), filePath) });
});

// POST /api/files/rename — also keeps FSD sessions pointing at renamed markdown files.
router.post("files/rename", async ({ body }) => {
  const data = await body();
  const filePath = data.path as string;
  const newName = data.newName as string;
  const projectId = data.projectId as string;
  if (!filePath || !newName) return json({ error: "Missing path or newName" }, 400);
  const renamed = renameFile(resolveRoot(projectId), filePath, newName);
  if (renamed && projectId) {
    // Normalize separators so this works identically on Windows.
    const normFile = filePath.replace(/\\/g, "/");
    const newPath = normFile.slice(0, normFile.lastIndexOf("/") + 1) + newName;
    if (normFile.startsWith("input/fsd/")) {
      try {
        db.update(fsdSessions)
          .set({ markdownPath: newPath, fsdInputPath: newName, updatedAt: new Date().toISOString() })
          .where(eq(fsdSessions.projectId, projectId))
          .where(eq(fsdSessions.markdownPath, normFile))
          .run();
      } catch {}
    }
  }
  return json({ renamed });
});

// POST /api/files/copy
router.post("files/copy", async ({ body }) => {
  const data = await body();
  const source = data.source as string;
  const destination = data.destination as string;
  const projectId = data.projectId as string;
  if (!source || !destination) return json({ error: "Missing source or destination" }, 400);
  const result = copyFile(resolveRoot(projectId), source, destination);
  return result ? json({ copied: true, path: result }) : json({ error: "Copy failed" }, 404);
});

// POST /api/files/move
router.post("files/move", async ({ body }) => {
  const data = await body();
  const source = data.source as string;
  const destination = data.destination as string;
  const projectId = data.projectId as string;
  if (!source || !destination) return json({ error: "Missing source or destination" }, 400);
  const result = moveFile(resolveRoot(projectId), source, destination);
  return result ? json({ moved: true, path: result }) : json({ error: "Move failed" }, 404);
});

// GET /api/files/summary
router.get("files/summary", ({ query }) => {
  const projectId = query.get("projectId");
  return json(getProjectSummary(resolveRoot(projectId)));
});
