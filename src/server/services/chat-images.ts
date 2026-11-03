/**
 * Chat images on disk (issue #47).
 *
 * An image attached to a chat message used to live ONLY as a `data:` URL inside
 * `chat_messages.parts`. Nothing in the workspace pointed at it, so the agent could not
 * `read_file` it, a generated document could not reference it, and the DOCX export had no
 * file to embed — the picture was visible in the transcript and nowhere else.
 *
 * These helpers write the bytes to `input/uploads/<thread>/` (the same folder the text
 * attachments already use) and hand back the root-relative path, which is what a markdown
 * document stores: `![Mockup](input/uploads/thr_x/mockup.png)`.
 */
import path from "node:path";
import fs from "node:fs";
import { saveProjectImage } from "./project-image";

/** Where chat attachments (text and images) live, relative to the project root. */
export const UPLOADS_DIR = "input/uploads";

/** The exact folder a thread's attachments go in — mirrors the attachments route. */
export function threadUploadDir(threadId: string): string {
  return `input/uploads/${threadId}`;
}

/** A part as stored in `chat_messages.parts`: only the fields this module reads. */
export interface StoredPartLike {
  type?: string;
  mediaType?: string;
  url?: string;
  filename?: string;
  /** Set once the bytes were written to disk; a later turn must not write them again. */
  path?: string;
}

/** `data:image/png;base64,AAAA` → `{ mediaType, bytes }`, or null when it is not a data URL. */
export function parseImageDataUrl(url: string): { mediaType: string; bytes: Buffer } | null {
  const m = /^data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(url ?? "");
  if (!m) return null;
  const mediaType = m[1].toLowerCase();
  if (!mediaType.startsWith("image/")) return null;
  try {
    return { mediaType, bytes: Buffer.from(m[2], "base64") };
  } catch {
    return null;
  }
}

/** A file name for an image part: its own `filename`, else a name from the media type. */
function nameFor(part: StoredPartLike, mediaType: string): string {
  const given = typeof part.filename === "string" ? part.filename.trim() : "";
  if (given) return given;
  const ext = mediaType.split("/")[1]?.replace("jpeg", "jpg") || "png";
  return `gambar.${ext}`;
}

export interface PersistedImage {
  /** Root-relative path with `/` separators, as markdown stores it. */
  path: string;
  mediaType: string;
}

/**
 * Writes every image part of a user message to the workspace, so the turn's history (and
 * anything generated from it) can point at a real file.
 *
 * Idempotent per message: a part that already carries `path` is left alone, so replaying a
 * turn, retrying it, or re-reading stored history never duplicates the file. A part that
 * cannot be decoded is skipped rather than failing the turn — the transcript still shows
 * the picture, it just stays unreferenceable.
 *
 * Returns the parts with `path` filled in for the ones that were written.
 */
export function persistMessageImages(
  root: string,
  threadId: string,
  parts: StoredPartLike[],
): { parts: StoredPartLike[]; saved: PersistedImage[] } {
  const dir = threadUploadDir(threadId);
  const saved: PersistedImage[] = [];
  const next = parts.map((part) => {
    if (part?.type !== "file" || typeof part.url !== "string") return part;
    if (typeof part.path === "string" && part.path) {
      saved.push({ path: part.path, mediaType: String(part.mediaType ?? "image/png") });
      return part;
    }
    const decoded = parseImageDataUrl(part.url);
    if (!decoded) return part;
    const result = saveProjectImage(root, dir, nameFor(part, decoded.mediaType), decoded.bytes);
    if (!result.relPath) return part;
    saved.push({ path: result.relPath, mediaType: decoded.mediaType });
    return { ...part, path: result.relPath };
  });
  return { parts: next, saved };
}

/**
 * Every image the project holds under `input/uploads` and `input/assets`, as root-relative
 * paths. Used by the TD prompt so a document can reference what the user attached — in this
 * thread or an earlier one — instead of the agent guessing that pictures exist.
 *
 * Bounded (`MAX_PROMPT_IMAGES`) and shallow on purpose: a project with hundreds of uploads
 * must not turn a prompt into a file listing.
 */
export const MAX_PROMPT_IMAGES = 24;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

export function listProjectImages(root: string, limit = MAX_PROMPT_IMAGES): string[] {
  const found: string[] = [];
  const walk = (rel: string, depth: number) => {
    if (found.length >= limit || depth > 2) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= limit) return;
      const childRel = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(childRel, depth + 1);
      else if (IMAGE_EXT.test(entry.name)) found.push(childRel);
    }
  };
  for (const dir of [UPLOADS_DIR, "input/assets"]) walk(dir, 0);
  return found;
}
