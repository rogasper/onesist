/**
 * Incremental reindex driven by the existing `file:changed` event (FR-I6).
 *
 * Debounced because a single agent turn writes many files in a burst, and each of
 * those writes emits its own event: re-indexing on every event would run the same
 * work twenty times for one turn. The wait is short enough that a search issued
 * right after a write already sees it.
 */
import path from "node:path";
import { eventBus } from "~/server/realtime/events";
import { db } from "~/server/db/client";
import { projects } from "~/server/db/schema";
import { refreshFiles } from "./service";

const DEBOUNCE_MS = 900;

const pending = new Map<string, { root: string; paths: Set<string>; timer: ReturnType<typeof setTimeout> }>();

/** Projects are few and cheap to read; the root that emitted the event decides
 *  which one to refresh. */
function projectByRoot(root: string): { id: string; rootPath: string } | null {
  const rows = db.select().from(projects).all() as { id: string; rootPath: string | null }[];
  const norm = (p: string) => p.replace(/[/\\]+$/, "");
  const target = norm(root);
  const hit = rows.find((r) => r.rootPath && (norm(r.rootPath) === target || target.startsWith(`${norm(r.rootPath)}${path.sep}`)));
  return hit?.rootPath ? { id: hit.id, rootPath: norm(hit.rootPath) } : null;
}

/**
 * Subscribes once per process. Returns an unsubscribe function so a test can
 * detach cleanly.
 */
export function startIndexWatcher(): () => void {
  // The bus emits the whole envelope `{ type, data, timestamp }`, not `data` —
  // reading `payload.path` here made the watcher silently do nothing, which is
  // exactly the kind of bug only a live event can reveal. Accept both shapes so a
  // future change to either side cannot break it quietly again.
  const handler = (payload: any) => {
    const event = payload?.data ?? payload;
    const relPath = event?.path;
    const root = event?.root;
    if (!relPath || !root) return;
    // Only indexable text files matter; an image upload should not wake the index.
    const ext = path.extname(relPath).toLowerCase();
    if (!ext) return;

    const project = projectByRoot(root);
    if (!project) return;

    const key = project.id;
    let entry = pending.get(key);
    if (!entry) {
      entry = { root: project.rootPath, paths: new Set(), timer: setTimeout(() => flush(key), DEBOUNCE_MS) };
      pending.set(key, entry);
    }
    entry.paths.add(relPath);
  };

  const flush = (projectId: string) => {
    const entry = pending.get(projectId);
    pending.delete(projectId);
    if (!entry || !entry.paths.size) return;
    try {
      refreshFiles(projectId, entry.root, [...entry.paths]);
    } catch {
      /* a failed incremental refresh must not break the event loop of the server */
    }
  };

  eventBus.on("file:changed", handler as any);
  return () => {
    eventBus.off("file:changed", handler as any);
    for (const [key, entry] of pending) {
      clearTimeout(entry.timer);
      pending.delete(key);
    }
  };
}

/** Exposed for tests: how many paths are waiting to be flushed. */
export function pendingIndexPaths(): number {
  let n = 0;
  for (const entry of pending.values()) n += entry.paths.size;
  return n;
}
