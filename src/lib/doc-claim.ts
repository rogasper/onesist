/**
 * A pane may write a document when it holds the claim in this window (pane-file-lock) and the
 * server says no other window holds it (Fase 5E). "pending" — the window's stream is not open
 * yet — is read-only until the claim is retried; "unavailable" — the server cannot be asked —
 * falls back to the local claim alone, as before windows existed.
 */
export type ServerClaim = "pending" | "ok" | "held" | "unavailable";

export function serverClaimFrom(status: number, body: unknown): ServerClaim {
  const b = (body ?? {}) as { ok?: unknown; reason?: unknown };
  if (status !== 200) return "unavailable";
  if (b.ok === true) return "ok";
  if (b.reason === "held") return "held";
  if (b.reason === "not_connected") return "pending";
  return "unavailable";
}

export function canWriteWith(local: boolean, server: ServerClaim): boolean {
  if (!local) return false;
  return server === "ok" || server === "unavailable";
}
