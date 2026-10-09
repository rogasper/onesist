import fs from "node:fs";
import path from "node:path";
import { eventBus } from "./events";
import { detectRoute } from "~/lib/file-router";
import { diffSnapshot } from "./snapshot";

/**
 * Announces changes to the project folders as `file:changed` events.
 *
 * The old watcher scanned every watched folder synchronously every two seconds, and forced a
 * full GC every ten. On Windows, where each file access is slow, that blocked the only server
 * process. Now:
 *   - a native watch (`fs.watch`, recursive) on each watched folder announces changes as they
 *     happen, and triggers an asynchronous rescan of the root;
 *   - a slow reconciliation (default every 30 s) rescans every root, so a missed native event
 *     is caught; it never overlaps with a scan already running;
 *   - the first scan of a root only records a baseline, so opening a project announces nothing.
 * Memory is measured without forcing a GC; a GC only happens when the raw number is already
 * over the limit.
 */

const watchRoots = new Set<string>();

/** Depth limit for the per-artifact-dir scan. Artifacts are written per module
 *  (`output/erd/<modul>/erd.dbml`) and FSD sources can sit one level down
 *  (`input/fsd/sources/x.md`), so a flat scan missed exactly the files the chat
 *  works with. */
const WATCH_DEPTH = 3;

const watchDirs = [
  "input/fsd", "input/fsds",
  // Images inserted through the markdown editor land here; without this entry a
  // fresh screenshot never reaches the file tree or the `@` mentions.
  "input/assets",
  "output/spec", "output/specs",
  "output/erd", "output/erds",
  "output/task", "output/tasks",
  "output/td", "output/tds",
  "output/timeline", "output/timelines",
  "output/report", "output/reports",
  "output/sketch", "output/sketches",
  "output/rtm", "output/rtms",
  "output/sit", "output/sits",
  "output/doc", "output/docs",
];

const RECONCILE_MS = parseInt(process.env.SA_WATCH_RECONCILE_MS || "30000", 10) || 30_000;
const NATIVE_DEBOUNCE_MS = 300;
const MEMORY_CHECK_MS = 10_000;
const HEARTBEAT_MS = 60_000;
const WAL_CHECKPOINT_MS = 60_000;
/** Testing switch: run on the timer alone, as if native watching were unavailable. */
const FORCE_POLL = process.env.SA_WATCH_FORCE_POLL === "1";
const DEBUG = process.env.SA_WATCH_DEBUG === "1";

/** Per root: absolute file path → mtime, from the last completed scan. */
const snapshots = new Map<string, Map<string, number>>();
/** Native watchers, keyed by `root::dir`. */
const nativeWatchers = new Map<string, fs.FSWatcher>();
const scanning = new Set<string>();
/** Roots that changed while a scan of them was running: scan again when it finishes. */
const rescanPending = new Set<string>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

let watcherActive = false;
let reconcileTimer: ReturnType<typeof setInterval> | null = null;
let memoryTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let walTimer: ReturnType<typeof setInterval> | null = null;

// Safety net: if the process RSS balloons (a leak would otherwise run the
// machine out of memory — observed at 100+ GB), kill ourselves so the Tauri
// sidecar's crash recovery respawns a fresh process.
// The default is generous because `bun run dev` shares one process with the
// Vite bundler (dep optimizer, dev transforms, hot reload) — normal dev RSS
// easily exceeds 1.2GB. A bare compiled sidecar sits far below this (200-400MB),
// so a genuine leak still gets caught quickly. Override with SA_MAX_RSS_MB.
const MAX_RSS_MB = parseInt(process.env.SA_MAX_RSS_MB || "3000", 10) || 3000;

// In dev the server shares its process with the Vite bundler (optimizer, dev
// transforms, SSR) — high RSS is normal bloat, not a leak, so never kill the
// developer's session. Production keeps the hard restart.
const IS_DEV = process.env.NODE_ENV === "development";

// Even in dev a runaway is a runaway: far above normal dev bloat (~2GB), hard
// exit so a leak can never reach the 100+GB runaway we saw before the
// watchdog existed.
const DEV_HARD_CAP_MB = 12000;

let lastRss: number | null = null;

function rssMB(): number {
  try {
    return Math.round((process.memoryUsage?.().rss ?? 0) / (1024 * 1024));
  } catch {
    return 0;
  }
}

/** RSS after a forced GC pass. Bun/JSC holds onto freed memory lazily, so the
 *  raw RSS drifts up under dev workloads and would falsely trigger the watchdog.
 *  Only called when the raw number is already over the limit. */
function liveRssMB(): number {
  try {
    (globalThis as any).Bun?.gc?.(true);
  } catch {}
  return rssMB();
}

// ─────────────────────────────────────────────────────────────────────────────
// Roots
// ─────────────────────────────────────────────────────────────────────────────

export function registerWatchRoot(rootPath: string) {
  if (!rootPath) return;
  const root = path.resolve(rootPath);
  if (watchRoots.has(root)) return;
  watchRoots.add(root);
  if (watcherActive) void syncRoot(root);
}

export function unregisterWatchRoot(rootPath: string) {
  const root = path.resolve(rootPath);
  watchRoots.delete(root);
  dropNativeWatchers(root);
  snapshots.delete(root);
  const timer = debounceTimers.get(root);
  if (timer) clearTimeout(timer);
  debounceTimers.delete(root);
}

export function getWatchRoots(): string[] {
  return Array.from(watchRoots);
}

/** The roots to scan: the registered projects, or one fallback root when none is known yet
 *  (web dev without opening a project). The fallback is scanned, never watched natively: it
 *  can be a whole home directory. */
function activeRoots(): string[] {
  if (watchRoots.size > 0) return Array.from(watchRoots);
  return [process.env.SA_ROOT ? path.resolve(process.env.SA_ROOT) : path.resolve(process.cwd(), "..")];
}

/** Project roots straight from the DB. A project merely opened after a restart must still be
 *  watched, so the table is read on each reconciliation. Never awaited by the callers. */
async function refreshProjectRoots(): Promise<void> {
  try {
    const { db } = await import("~/server/db/client");
    const { projects } = await import("~/server/db/schema");
    const rows = db.select({ rootPath: projects.rootPath }).from(projects).all() as { rootPath: string | null }[];
    for (const row of rows) {
      const root = row.rootPath?.trim();
      if (root) registerWatchRoot(root);
    }
  } catch {
    /* DB unavailable: keep whatever was registered explicitly */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scanning
// ─────────────────────────────────────────────────────────────────────────────

async function walk(dirAbs: string, depth: number, out: Map<string, number>): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dirAbs, { withFileTypes: true });
  } catch {
    return; // the folder does not exist (yet)
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs = path.join(dirAbs, entry.name);
    if (entry.isDirectory()) {
      if (depth < WATCH_DEPTH) await walk(abs, depth + 1, out);
      continue;
    }
    if (!entry.isFile()) continue;
    try {
      const stat = await fs.promises.stat(abs);
      out.set(abs, stat.mtimeMs);
    } catch {
      /* removed between readdir and stat */
    }
  }
}

/** Scans one root and announces what changed since the last scan of it. */
async function scanRoot(root: string): Promise<void> {
  if (scanning.has(root)) {
    rescanPending.add(root);
    return;
  }
  scanning.add(root);
  try {
    do {
      rescanPending.delete(root);
      const next = new Map<string, number>();
      for (const dir of watchDirs) await walk(path.join(root, dir), 1, next);
      // A root unregistered during the scan keeps no snapshot and announces nothing.
      if (!watchRoots.has(root) && watchRoots.size > 0) return;
      const prev = snapshots.get(root) ?? null;
      snapshots.set(root, next);
      const diff = diffSnapshot(prev, next);
      const changed = [...diff.created, ...diff.changed, ...diff.deleted];
      for (const abs of changed) {
        const relPath = path.relative(root, abs);
        eventBus.emitFileChanged(detectRoute(relPath), relPath, root);
      }
      if (DEBUG && changed.length) console.log(`[watcher] ${root}: ${changed.length} change(s)`);
    } while (rescanPending.has(root));
  } catch (err) {
    console.error(`[watcher] scan failed for ${root}:`, err);
  } finally {
    scanning.delete(root);
    rescanPending.delete(root);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Native watching
// ─────────────────────────────────────────────────────────────────────────────

function scheduleScan(root: string): void {
  const pending = debounceTimers.get(root);
  if (pending) clearTimeout(pending);
  debounceTimers.set(
    root,
    setTimeout(() => {
      debounceTimers.delete(root);
      void scanRoot(root);
    }, NATIVE_DEBOUNCE_MS),
  );
}

/** A native event for a file under a watched folder. Hidden files and other folders are ignored. */
function onNativeEvent(root: string, dir: string, filename: string | Buffer | null): void {
  if (filename) {
    const rel = path.join(dir, String(filename)).split(path.sep).join("/");
    if (rel.split("/").some((part) => part.startsWith("."))) return;
  }
  scheduleScan(root);
}

/** Watches each existing watched folder of a root; folders missing now are picked up by the
 *  next reconciliation. A platform without recursive watching simply keeps the timer only. */
function ensureNativeWatchers(root: string): void {
  if (FORCE_POLL) return;
  for (const dir of watchDirs) {
    const key = `${root}::${dir}`;
    if (nativeWatchers.has(key)) continue;
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    try {
      const watcher = fs.watch(abs, { recursive: true }, (_event, filename) => onNativeEvent(root, dir, filename));
      watcher.on("error", () => {
        try {
          watcher.close();
        } catch {}
        nativeWatchers.delete(key);
      });
      nativeWatchers.set(key, watcher);
    } catch {
      /* no recursive native watch here: the reconciliation covers this folder */
    }
  }
}

function dropNativeWatchers(root: string): void {
  for (const [key, watcher] of nativeWatchers) {
    if (!key.startsWith(`${root}::`)) continue;
    try {
      watcher.close();
    } catch {}
    nativeWatchers.delete(key);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reconciliation and lifecycle
// ─────────────────────────────────────────────────────────────────────────────

/** A root that appeared (or was registered while running): watch it and record its baseline. */
async function syncRoot(root: string): Promise<void> {
  ensureNativeWatchers(root);
  if (!snapshots.has(root)) await scanRoot(root);
}

async function reconcileAll(): Promise<void> {
  await refreshProjectRoots();
  for (const root of activeRoots()) {
    await syncRoot(root);
    await scanRoot(root);
  }
}

/** Resident memory, measured cheaply. A GC is forced only when the raw number is already
 *  over the limit, because the forced GC itself is a synchronous stall. */
function checkMemory(): void {
  if (rssMB() <= MAX_RSS_MB) return;
  const rss = liveRssMB();
  if (rss <= MAX_RSS_MB) return;
  if (IS_DEV) {
    if (rss > DEV_HARD_CAP_MB) {
      console.error(`[watcher] RSS ${rss}MB exceeds dev hard cap ${DEV_HARD_CAP_MB}MB — exiting to force a clean restart`);
      process.exit(1);
    }
    console.error(`[watcher] RSS ${rss}MB exceeds ${MAX_RSS_MB}MB — dev: warning only (production would restart)`);
    return;
  }
  console.error(`[watcher] RSS ${rss}MB exceeds ${MAX_RSS_MB}MB — exiting to force a clean restart`);
  process.exit(1);
}

function heartbeat(): void {
  const rss = rssMB();
  const delta = lastRss === null ? 0 : rss - lastRss;
  lastRss = rss;
  console.log(`[watcher] RSS ${rss}MB (max ${MAX_RSS_MB}MB, ${delta >= 0 ? "+" : ""}${delta}MB/min)`);
}

export function startFileWatcher(intervalMs = RECONCILE_MS) {
  if (watcherActive) return;
  watcherActive = true;

  // Log the baseline so the watchdog's measurement is verifiable in the log
  // (a broken process.memoryUsage() in the compiled sidecar would otherwise
  // silently disable the kill).
  console.log(
    `[watcher] started: reconcile every ${intervalMs}ms, native ${FORCE_POLL ? "off" : "on"}, ` +
      `RSS watchdog max=${MAX_RSS_MB}MB devHardCap=${DEV_HARD_CAP_MB}MB baseline=${rssMB()}MB`,
  );

  void reconcileAll();
  reconcileTimer = setInterval(() => void reconcileAll(), intervalMs);
  memoryTimer = setInterval(checkMemory, MEMORY_CHECK_MS);
  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);
  // Periodic WAL checkpoint so the SQLite journal doesn't grow unbounded.
  walTimer = setInterval(() => {
    void import("~/server/db/client").then((m) => m.checkpointWal()).catch(() => {});
  }, WAL_CHECKPOINT_MS);
}

export function stopFileWatcher() {
  for (const timer of [reconcileTimer, memoryTimer, heartbeatTimer, walTimer]) {
    if (timer) clearInterval(timer);
  }
  reconcileTimer = memoryTimer = heartbeatTimer = walTimer = null;
  for (const root of [...new Set([...watchRoots, ...snapshots.keys()])]) dropNativeWatchers(root);
  for (const timer of debounceTimers.values()) clearTimeout(timer);
  debounceTimers.clear();
  watcherActive = false;
}
