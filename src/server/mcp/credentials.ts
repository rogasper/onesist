/**
 * Short-lived credential hand-off between "connect" and "save".
 *
 * Acquiring a credential (the gh token, an OAuth token bundle) and persisting it
 * are now separate steps: the user may press Batal, or switch preset, and
 * nothing must have been written. The acquired value therefore waits here under
 * an opaque reference, and only `Simpan` resolves it into the row.
 *
 * The value never reaches the browser: the UI passes the reference back, so a
 * token acquired but not saved is not exposed to the page.
 *
 * In memory on purpose — an unsaved credential should not outlive the process.
 */
import crypto from "node:crypto";

export interface PendingCredential {
  authKind: "header" | "oauth";
  authHeader: string | null;
  authValue: string;
  createdAt: number;
}

const pending = new Map<string, PendingCredential>();
const TTL_MS = 30 * 60_000;

function sweep(): void {
  const now = Date.now();
  for (const [ref, entry] of pending.entries()) {
    if (now - entry.createdAt > TTL_MS) pending.delete(ref);
  }
}

/** Stores an acquired credential and returns the reference the UI holds. */
export function putCredential(credential: Omit<PendingCredential, "createdAt">): string {
  sweep();
  const ref = crypto.randomBytes(16).toString("hex");
  pending.set(ref, { ...credential, createdAt: Date.now() });
  return ref;
}

/** Reads without consuming — a test may resolve the same reference repeatedly. */
export function peekCredential(ref: string | null | undefined): PendingCredential | null {
  if (!ref) return null;
  sweep();
  return pending.get(ref) ?? null;
}

/** Consumes the credential once it has been written to a row. */
export function takeCredential(ref: string | null | undefined): PendingCredential | null {
  const found = peekCredential(ref);
  if (found && ref) pending.delete(ref);
  return found;
}
