/**
 * Index service: build, refresh, report (FR-I5..I8).
 *
 * Three entry points, deliberately different in cost:
 *   `indexProject`  full scan — the slow one, run on request or on a first search
 *   `refreshFiles`  only the named files — what `file:changed` drives (FR-I6)
 *   `indexOneFile`  one file, used by both
 *
 * Progress is tracked in memory per project so the status endpoint can report it
 * while a build runs (FR-I7) without the build having to push events.
 */
import fs from "node:fs";
import path from "node:path";
import { chunkFile } from "./chunk";
import { extractSymbols } from "./symbols";
import { SCAN_LIMITS, readForIndex, scanProject, type ScannedFile } from "./scan";
import * as store from "./store";

export interface IndexProgress {
  status: "idle" | "running" | "error";
  /** How many files of the current pass have been processed. */
  done: number;
  total: number;
  startedAt: number | null;
  finishedAt: number | null;
  lastError: string | null;
  /** What triggered the last pass — the acceptance criterion for incremental
   *  reindex is that a one-file change reports `incremental` with `changed: 1`. */
  lastRun: { mode: "full" | "incremental"; changed: number; removed: number } | null;
}

const progress = new Map<string, IndexProgress>();

function stateOf(projectId: string): IndexProgress {
  let p = progress.get(projectId);
  if (!p) {
    p = { status: "idle", done: 0, total: 0, startedAt: null, finishedAt: null, lastError: null, lastRun: null };
    progress.set(projectId, p);
  }
  return p;
}

export function getIndexStatus(projectId: string): IndexProgress & { stats: ReturnType<typeof store.stats> } {
  return { ...stateOf(projectId), stats: store.stats(projectId) };
}

/** Indexes one file from disk. Returns false when the file is gone (in which case
 *  its rows are removed, which is what makes deletions disappear from search). */
export function indexOneFile(projectId: string, file: ScannedFile): boolean {
  const read = readForIndex(file);
  if (!read) {
    store.deleteFile(projectId, file.rel);
    return false;
  }
  const chunks = chunkFile({ path: read.rel, ext: read.ext, text: read.text });
  const symbols = extractSymbols({ path: read.rel, ext: read.ext, text: read.text });
  store.replaceFile({ projectId, path: file.rel, ext: read.ext, size: file.size, mtimeMs: file.mtimeMs, chunks, symbols });
  return true;
}

/** Full rebuild. Clears the project first: a file that disappeared while the app
 *  was closed would otherwise linger in the index forever. */
export function indexProject(projectId: string, root: string): { files: number; skippedLarge: number; durationMs: number } {
  const state = stateOf(projectId);
  const startedAt = Date.now();
  state.status = "running";
  state.done = 0;
  state.total = 0;
  state.startedAt = startedAt;
  state.finishedAt = null;
  state.lastError = null;

  try {
    store.clearProject(projectId);
    const { files, skippedLarge } = scanProject(root);
    state.total = files.length;
    for (const file of files) {
      indexOneFile(projectId, file);
      state.done++;
    }
    state.status = "idle";
    state.finishedAt = Date.now();
    state.lastRun = { mode: "full", changed: files.length, removed: 0 };
    return { files: files.length, skippedLarge, durationMs: state.finishedAt - startedAt };
  } catch (err: any) {
    state.status = "error";
    state.lastError = String(err?.message ?? err);
    state.finishedAt = Date.now();
    throw err;
  }
}

/**
 * Incremental refresh for the files a `file:changed` event named (FR-I6).
 *
 * The whole cost argument for the index rests on this path: a full rebuild per
 * keystroke would make the feature unusable, so a change re-indexes exactly the
 * files given and, when a file is gone, removes it.
 */
export function refreshFiles(projectId: string, root: string, relPaths: string[]): { changed: number; removed: number } {
  const state = stateOf(projectId);
  state.status = "running";
  state.startedAt = Date.now();
  state.finishedAt = null;
  state.lastError = null;
  state.done = 0;
  state.total = relPaths.length;

  let changed = 0;
  let removed = 0;
  try {
    for (const rel of relPaths) {
      const abs = path.join(root, rel);
      let stat: fs.Stats | null = null;
      try {
        stat = fs.statSync(abs);
      } catch {
        stat = null;
      }
      if (!stat || !stat.isFile() || stat.size > SCAN_LIMITS.maxFileBytes) {
        store.deleteFile(projectId, rel);
        removed++;
      } else {
        const file: ScannedFile = { rel, abs, ext: path.extname(rel).toLowerCase(), size: stat.size, mtimeMs: stat.mtimeMs };
        if (indexOneFile(projectId, file)) changed++;
        else removed++;
      }
      state.done++;
    }
    state.status = "idle";
    state.finishedAt = Date.now();
    state.lastRun = { mode: "incremental", changed, removed };
    return { changed, removed };
  } catch (err: any) {
    state.status = "error";
    state.lastError = String(err?.message ?? err);
    state.finishedAt = Date.now();
    return { changed, removed };
  }
}

/**
 * Builds the index on first use (acceptance criterion 7: a new project needs no
 * configuration). Called by the search tool, so the first search on a fresh
 * project answers instead of returning "nothing indexed yet".
 */
export function ensureIndexed(projectId: string, root: string): { built: boolean } {
  const s = store.stats(projectId);
  if (s.files > 0) return { built: false };
  indexProject(projectId, root);
  return { built: true };
}

/** One file per project whose root matches, for the `file:changed` watcher. */
export function projectForRoot(projects: { id: string; rootPath: string }[], changedRoot: string | undefined, changedRelPath: string): string | null {
  if (!changedRoot) return null;
  const norm = (p: string) => p.replace(/[/\\]+$/, "");
  const target = norm(changedRoot);
  const match = projects.find((p) => norm(p.rootPath) === target || norm(changedRoot).startsWith(`${norm(p.rootPath)}${path.sep}`));
  return match?.id ?? null;
}
