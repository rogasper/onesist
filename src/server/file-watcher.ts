import fs from "node:fs";
import path from "node:path";
import { eventBus } from "~/server/events";
import { detectRoute } from "~/lib/file-router";

let watcherActive = false;
let watcherTimer: ReturnType<typeof setInterval> | null = null;
let currentRoot = "";

const knownFiles = new Map<string, number>();

export function startFileWatcher(rootPath: string = "", intervalMs = 2000) {
  if (watcherActive) return;
  watcherActive = true;
  currentRoot = rootPath || path.resolve(process.cwd(), "..");

  const watchDirs = [
    "input/fsd", "output/spec", "output/erd", "output/task",
    "output/td", "output/timeline", "output/reports",
  ];

  watcherTimer = setInterval(() => {
    for (const dir of watchDirs) {
      const fullDir = path.join(currentRoot, dir);
      try {
        if (!fs.existsSync(fullDir)) continue;
        const entries = fs.readdirSync(fullDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isFile() || entry.name.startsWith(".")) continue;
          const fullPath = path.join(fullDir, entry.name);
          const relPath = path.join(dir, entry.name);
          const stat = fs.statSync(fullPath);
          const mtime = stat.mtimeMs;
          const prev = knownFiles.get(relPath);
          if (prev !== undefined && Math.abs(mtime - prev) > 50) {
            const route = detectRoute(relPath);
            eventBus.emitFileChanged(route, relPath);
          }
          knownFiles.set(relPath, mtime);
        }
        // Detect deletions
          for (const [key, val] of knownFiles) {
            const parentDir = path.join(currentRoot, key.split("/").slice(0, -1).join("/"));
            try {
              if (!fs.existsSync(path.join(currentRoot, key))) {
              const route = detectRoute(key);
              eventBus.emitFileChanged(route, key);
              knownFiles.delete(key);
            }
          } catch {}
        }
      } catch {}
    }
  }, intervalMs);
}

export function stopFileWatcher() {
  if (watcherTimer) clearInterval(watcherTimer);
  watcherActive = false;
  watcherTimer = null;
}
