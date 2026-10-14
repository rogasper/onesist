/**
 * Who may write a document when the same one is open in several split panes.
 *
 * Two editors writing one file overwrite each other's edits, so the first pane to
 * open a document owns it and the others render it read-only. When the owner
 * releases it (pane closed, another document picked) listeners are told, and the
 * next pane that re-claims becomes the writer. Keys are opaque strings chosen by
 * the caller, e.g. `fsd:<sessionId>`. Module state: one registry per window.
 */

const owners = new Map<string, string>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of [...listeners]) fn();
}

export function claimFile(key: string, owner: string): boolean {
  const current = owners.get(key);
  if (current === owner) return true;
  if (current !== undefined) return false;
  owners.set(key, owner);
  emit();
  return true;
}

export function releaseFile(key: string, owner: string): void {
  if (owners.get(key) !== owner) return;
  owners.delete(key);
  emit();
}

export function fileOwner(key: string): string | undefined {
  return owners.get(key);
}

export function subscribeFileLocks(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function resetFileLocksForTest(): void {
  owners.clear();
  listeners.clear();
}
