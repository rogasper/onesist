/**
 * JSON-RPC messages shaped after the v2 schema (codex-rs/app-server-protocol, generated
 * 2026-10-16). Used by the fake app-server in tests; the real shapes are re-checked against a
 * recorded transcript in Task 6.
 */
export const INIT_RESULT = { userAgent: "codex-app-server/fake", platformFamily: "unix" };

export const threadStartedResult = (id: string) => ({ thread: { id, status: "idle" } });

/** Newline-delimited JSON, as the server writes it. */
export function ndjson(lines: unknown[]): string {
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}
