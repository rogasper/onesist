/**
 * What changed between two scans of a project root (P1.2).
 *
 * The first scan of a root is the baseline: it announces nothing. Without that, opening a
 * project (or the app starting) would announce every existing file as "created", which woke
 * the index and every open list at once.
 */
export interface SnapshotDiff {
  created: string[];
  changed: string[];
  deleted: string[];
}

/** Modification times closer than this are the same write, not a change (filesystem jitter). */
export const MTIME_TOLERANCE_MS = 50;

/** Paths are whatever keys the scan used (absolute paths in the watcher). */
export function diffSnapshot(prev: Map<string, number> | null, next: Map<string, number>): SnapshotDiff {
  const diff: SnapshotDiff = { created: [], changed: [], deleted: [] };
  if (prev === null) return diff;
  for (const [file, mtime] of next) {
    const before = prev.get(file);
    if (before === undefined) diff.created.push(file);
    else if (Math.abs(mtime - before) > MTIME_TOLERANCE_MS) diff.changed.push(file);
  }
  for (const file of prev.keys()) {
    if (!next.has(file)) diff.deleted.push(file);
  }
  return diff;
}
