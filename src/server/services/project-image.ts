import fs from "node:fs";
import path from "node:path";

/** Where images inserted into markdown documents live, relative to the project root. */
export const ASSETS_DIR = "input/assets";

export interface ImageUploadResult {
  uploaded?: boolean;
  fileName?: string;
  /** Root-relative path with `/` separators — this is what the markdown stores. */
  relPath?: string;
  error?: string;
  status?: number;
}

const MAX_BYTES = 20 * 1024 * 1024;

/** Extension allowlist — the same set `/api/files/image` knows how to serve. */
const ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);

/**
 * Magic-byte check for the raster formats.
 *
 * The extension alone is not evidence: a renamed file would otherwise be stored
 * and later served back with `Content-Type: image/png`. SVG is XML text, so it
 * gets a marker scan instead (the `<svg` root may sit after an XML prolog or a
 * comment).
 */
function looksLikeImage(ext: string, buf: Buffer): boolean {
  switch (ext) {
    case ".png":
      return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    case ".jpg":
    case ".jpeg":
      return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case ".gif":
      return buf.length > 6 && buf.subarray(0, 3).toString("latin1") === "GIF";
    case ".webp":
      return (
        buf.length > 12 &&
        buf.subarray(0, 4).toString("latin1") === "RIFF" &&
        buf.subarray(8, 12).toString("latin1") === "WEBP"
      );
    case ".avif":
      return buf.length > 12 && buf.subarray(4, 8).toString("latin1") === "ftyp";
    case ".svg":
      return /<svg[\s>]/i.test(buf.subarray(0, 4096).toString("utf-8"));
    default:
      return false;
  }
}

/**
 * Saves an image into `<root>/<relDir>`, sanitized and de-duplicated.
 *
 * The caller stores the returned `relPath` in the document, NOT an app URL:
 * `![UI](input/assets/foo.png)` stays readable for the agent, for the task card
 * a developer picks up, and for any other markdown tool. Turning it into
 * `/api/files/image?...` is a display concern (see the frontend renderer and the
 * editor's `imagePreviewHandler`).
 *
 * Two independent guards keep the write inside the workspace: the destination
 * directory is resolved and required to stay under the project root (the
 * directory name comes from the caller), and the file name is rebuilt from a
 * character whitelist so it can never contain a separator. `resolveInRoot` in
 * `agent/paths.ts` is the same rule for agent tool calls; this service is the
 * HTTP-side equivalent so an upload cannot escape either way.
 */
export function saveProjectImage(root: string, relDir: string, originalName: string, buf: Buffer): ImageUploadResult {
  if (!originalName) return { error: "Nama berkas gambar tidak ada." };
  if (!buf.length) return { error: "Berkas gambar kosong." };
  if (buf.length > MAX_BYTES) return { error: "Gambar terlalu besar (maks 20MB).", status: 413 };

  const ext = (originalName.match(/\.[a-z0-9]+$/i)?.[0] ?? "").toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return { error: `Format gambar tidak didukung: ${originalName}`, status: 415 };
  }
  if (!looksLikeImage(ext, buf)) {
    return { error: `Isi berkas bukan ${ext.slice(1).toUpperCase()} yang sah.`, status: 415 };
  }

  const rootAbs = path.resolve(root);
  const dirAbs = path.resolve(rootAbs, relDir);
  if (dirAbs !== rootAbs && !dirAbs.startsWith(rootAbs + path.sep)) {
    return { error: "Folder aset berada di luar workspace project.", status: 400 };
  }

  try {
    fs.mkdirSync(dirAbs, { recursive: true });
  } catch {
    /* the write below reports the real failure */
  }

  // Strip any directory part first: a pasted file may carry a path, and on
  // Windows that path uses backslashes, which `path.basename` does NOT treat as
  // separators on POSIX — the whole `C:\…\shot.png` would otherwise survive as
  // one (sanitized, but ugly) name.
  const baseName = originalName.split(/[/\\]/).pop() ?? originalName;
  const stem = path.basename(baseName, ext).replace(/[^\w.\- ]+/g, "_").trim().slice(0, 80) || "image";
  let fileName = `${stem}${ext}`;
  let n = 2;
  while (fs.existsSync(path.join(dirAbs, fileName))) {
    fileName = `${stem}_${n}${ext}`;
    n += 1;
  }

  const target = path.join(dirAbs, fileName);
  if (path.dirname(target) !== dirAbs) return { error: "Nama berkas gambar tidak sah.", status: 400 };

  try {
    fs.writeFileSync(target, buf);
  } catch (e: any) {
    return { error: `Gagal menulis gambar: ${e?.message ?? e}`, status: 500 };
  }

  return { uploaded: true, fileName, relPath: `${relDir}/${fileName}` };
}
