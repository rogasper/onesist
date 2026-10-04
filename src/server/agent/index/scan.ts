/**
 * Project scan for the index (FR-I2).
 *
 * Reuses `IGNORED_DIRS` and `TEXT_EXTS` from file-router rather than keeping a
 * second list: an index that disagrees with the file browser about what exists is
 * a bug generator ("the tree shows it, search can't find it").
 *
 * Note on `output/`: it is NOT ignored. The artifacts this app exists to produce
 * (ERD, spec, task, RTM, SIT) live there, and searching them is the point of the
 * feature. `IGNORED_DIRS` already names the directories that must stay out
 * (node_modules, .git, dist, target, build caches).
 */
import fs from "node:fs";
import path from "node:path";
import { IGNORED_DIRS, TEXT_EXTS } from "~/lib/file-router";

export interface ScannedFile {
  rel: string;
  abs: string;
  ext: string;
  size: number;
  mtimeMs: number;
}

export const SCAN_LIMITS = {
  /** Files larger than this are skipped: they are data dumps, not artifacts, and
   *  one 20 MB CSV would dominate both the index and the search results. */
  maxFileBytes: 512 * 1024,
  /** Ceiling on files per project, so a runaway tree cannot hang a reindex. */
  maxFiles: 5000,
  /** Directory depth, relative to the project root. */
  maxDepth: 12,
} as const;

/** Walks the project and returns indexable text files. Symlinked directories are
 *  not followed: a link pointing at `/` would otherwise index the whole machine. */
export function scanProject(root: string): { files: ScannedFile[]; skippedLarge: number } {
  const files: ScannedFile[] = [];
  let skippedLarge = 0;
  const stack: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];

  while (stack.length && files.length < SCAN_LIMITS.maxFiles) {
    const { dir, depth } = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (files.length >= SCAN_LIMITS.maxFiles) break;
      if (entry.name.startsWith(".")) continue; // .git, .agents, .cache, …
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        if (depth + 1 > SCAN_LIMITS.maxDepth) continue;
        stack.push({ dir: abs, depth: depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue; // symlinks and specials are not indexed
      const ext = path.extname(entry.name).toLowerCase();
      if (!TEXT_EXTS.has(ext)) continue;
      let stat: fs.Stats;
      try {
        stat = fs.statSync(abs);
      } catch {
        continue;
      }
      if (stat.size > SCAN_LIMITS.maxFileBytes) {
        skippedLarge++;
        continue;
      }
      files.push({ rel: path.relative(root, abs).split(path.sep).join("/"), abs, ext, size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  return { files, skippedLarge };
}

/** Reads one file for indexing. Returns null when it is gone or unreadable, which
 *  the caller treats as "remove it from the index". */
export function readForIndex(file: ScannedFile): { text: string; ext: string; rel: string } | null {
  try {
    return { text: fs.readFileSync(file.abs, "utf-8"), ext: file.ext, rel: file.rel };
  } catch {
    return null;
  }
}
