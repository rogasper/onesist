import { json } from "../../http/response";
import { Router } from "../../http/router";
import { resolveRoot } from "../../http/route-utils";
import { ASSETS_DIR, saveProjectImage } from "~/server/services/project-image";

export const router = new Router();

/**
 * POST /api/projects/:id/assets/upload — image bytes coming from the markdown
 * editor (toolbar, clipboard paste, or drag & drop). Body: raw bytes, query:
 * `?filename=<base64>` (the same convention as the chat attachment route).
 *
 * Answers with the ROOT-RELATIVE path, which is exactly what the document
 * stores: `![UI](input/assets/foo.png)`. The agent and any other markdown tool
 * can read that path; only the app rewrites it to `/api/files/image` for display.
 */
router.post("projects/:id/assets/upload", async (ctx) => {
  try {
    const filenameRaw = new URL(ctx.request.url).searchParams.get("filename") ?? "";
    let originalName = "";
    try {
      originalName = Buffer.from(filenameRaw, "base64").toString("utf-8");
    } catch {
      /* an unreadable name is reported as a missing name below */
    }
    const buf = Buffer.from(await ctx.request.arrayBuffer());
    const result = saveProjectImage(resolveRoot(ctx.params.id), ASSETS_DIR, originalName, buf);
    if (result.error) return json({ error: result.error }, result.status ?? 400);
    return json({ uploaded: true, path: result.relPath }, 201);
  } catch (e: any) {
    return json({ error: `Unggah gambar gagal: ${e?.message ?? e}` }, 500);
  }
});
