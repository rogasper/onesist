import fs from "node:fs";
import path from "node:path";
import { eventBus } from "./events";
import { detectRoute } from "~/lib/file-router";

let watcherActive = false;
let watcherTimer: ReturnType<typeof setInterval> | null = null;

// Project roots are registered dynamically (see registerWatchRoot) so the
// watcher scans the actual project folders — NOT SA_ROOT (home dir), which
// caused SSE file:changed events to never fire for project files.
//
// Registration alone was not enough: it only happened when a project was
// CREATED, so a project made in an earlier session was never watched after a
// restart (the set is in-memory). The tick therefore also picks up every project
// root from the DB — that is what makes "the tab updates by itself / a new file
// is mentionable" true for projects the user simply opened.
const watchRoots = new Set<string>();

/** Depth limit for the per-artifact-dir scan. Artifacts are written per module
 *  (`output/erd/<modul>/erd.dbml`) and FSD sources can sit one level down
 *  (`input/fsd/sources/x.md`), so a flat scan missed exactly the files the chat
 *  works with. */
const WATCH_DEPTH = 3;

const watchDirs = [
  "input/fsd", "input/fsds",
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

// fullPath -> mtime. Keyed by absolute path to avoid collisions between roots.
const knownFiles = new Map<string, number>();

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
 *  raw RSS drifts up under dev workloads (Vite transforms, SSR renders) and
 *  would falsely trigger the watchdog. Measure *live* memory instead. */
function liveRssMB(): number {
  try {
    (globalThis as any).Bun?.gc?.(true);
  } catch {}
  return rssMB();
}

export function registerWatchRoot(rootPath: string) {
  if (!rootPath) return;
  watchRoots.add(path.resolve(rootPath));
}

export function unregisterWatchRoot(rootPath: string) {
  watchRoots.delete(path.resolve(rootPath));
}

export function getWatchRoots(): string[] {
  return Array.from(watchRoots);
}

/** Project roots straight from the DB (async, never awaited by the tick).
 *
 *  Registration alone was not enough: `registerWatchRoot` only ran when a project
 *  was CREATED, so after an app restart a project the user merely opened was not
 *  watched at all — which is why a newly written file could be invisible to the
 *  `@` popup and to the artifact tabs. Reading the table every couple of seconds
 *  is one cheap local query, and it cannot go stale.
 */
async function refreshProjectRoots(): Promise<void> {
  try {
    const { db } = await import("~/server/db/client");
    const { projects } = await import("~/server/db/schema");
    const rows = db.select({ rootPath: projects.rootPath }).from(projects).all() as { rootPath: string | null }[];
    for (const row of rows) {
      const root = row.rootPath?.trim();
      if (root) watchRoots.add(path.resolve(root));
    }
  } catch {
    /* DB unavailable: keep whatever was registered explicitly */
  }
}

export function startFileWatcher(intervalMs = 2000) {
  if (watcherActive) return;
  watcherActive = true;

  // Log the baseline so the watchdog's measurement is verifiable in the log
  // (a broken process.memoryUsage() in the compiled sidecar would otherwise
  // silently disable the kill).
  console.log(`[watcher] RSS watchdog active: max=${MAX_RSS_MB}MB devHardCap=${DEV_HARD_CAP_MB}MB baseline=${rssMB()}MB`);

  // Fallback root when no project has been registered yet (web dev without
  // opening a project).
  const fallbackRoot = process.env.SA_ROOT
    ? path.resolve(process.env.SA_ROOT)
    : path.resolve(process.cwd(), "..");

  let tick = 0;
  watcherTimer = setInterval(() => {
    tick += 1;
    // The callback stays synchronous; the DB read for project roots is fired
    // without awaiting so a slow read can never stall the watch loop.
    void refreshProjectRoots();

    // Memory watchdog: restart before we OOM the machine.
    if (tick % 5 === 0) {
      const rss = liveRssMB();
      // Periodic RSS heartbeat + growth rate (leak = steady climb, dev bloat
      // = plateau) so the trend is visible in the console.
      if (tick % 30 === 0) {
        const delta = lastRss === null ? 0 : rss - lastRss;
        lastRss = rss;
        console.log(`[watcher] RSS ${rss}MB (max ${MAX_RSS_MB}MB, ${delta >= 0 ? "+" : ""}${delta}MB/min)`);
      }
      if (rss > MAX_RSS_MB) {
        if (IS_DEV) {
          if (rss > DEV_HARD_CAP_MB) {
            console.error(`[watcher] RSS ${rss}MB exceeds dev hard cap ${DEV_HARD_CAP_MB}MB — exiting to force a clean restart`);
            process.exit(1);
          }
          console.error(`[watcher] RSS ${rss}MB exceeds ${MAX_RSS_MB}MB — dev: warning only (production would restart)`);
        } else {
          console.error(`[watcher] RSS ${rss}MB exceeds ${MAX_RSS_MB}MB — exiting to force a clean restart`);
          process.exit(1);
        }
      }
    }

    // Periodic WAL checkpoint so the SQLite journal doesn't grow unbounded.
    if (tick % 30 === 0) {
      void import("~/server/db/client").then((m) => m.checkpointWal()).catch(() => {});
    }

    let roots = Array.from(watchRoots);
    if (roots.length === 0) roots.push(fallbackRoot);
    const rootsSet = new Set(roots);

    for (const root of roots) {
      for (const dir of watchDirs) {
        const fullDir = path.join(root, dir);
        try {
          if (!fs.existsSync(fullDir)) continue;
          // Recursive, bounded: see WATCH_DEPTH.
          const scan = (current: string, relPrefix: string, depth: number) => {
            const entries = fs.readdirSync(current, { withFileTypes: true });
            for (const entry of entries) {
              if (entry.name.startsWith(".")) continue;
              const relPath = relPrefix ? path.join(relPrefix, entry.name) : path.join(dir, entry.name);
              if (entry.isDirectory()) {
                if (depth < WATCH_DEPTH) scan(path.join(current, entry.name), relPath, depth + 1);
                continue;
              }
              if (!entry.isFile()) continue;
              const fullPath = path.join(current, entry.name);
              const stat = fs.statSync(fullPath);
              const mtime = stat.mtimeMs;
              const prev = knownFiles.get(fullPath);
              // Emit on creation (prev undefined) and on mtime change.
              if (prev === undefined || Math.abs(mtime - prev) > 50) {
                eventBus.emitFileChanged(detectRoute(relPath), relPath, root);
              }
              knownFiles.set(fullPath, mtime);
            }
          };
          scan(fullDir, dir, 1);
        } catch {}
      }
      // Detect deletions
      for (const [key, val] of knownFiles) {
        try {
          if (!key.startsWith(root + path.sep)) continue;
          if (!fs.existsSync(key)) {
            const relPath = key.slice(root.length + 1);
            const route = detectRoute(relPath);
            eventBus.emitFileChanged(route, relPath, root);
            knownFiles.delete(key);
          }
        } catch {}
      }
    }

    // Prune knownFiles entries that belong to projects no longer registered —
    // otherwise the Map grows forever across open/close of many projects.
    for (const key of knownFiles.keys()) {
      const parentRoot = Array.from(rootsSet).find((r) => key.startsWith(r + path.sep));
      if (!parentRoot) knownFiles.delete(key);
    }
  }, intervalMs);
}

export function stopFileWatcher() {
  if (watcherTimer) clearInterval(watcherTimer);
  watcherActive = false;
  watcherTimer = null;
}
