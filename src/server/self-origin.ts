/**
 * The origin this Onesist server is reached at, learned from incoming /api requests.
 * OpenCode is told to call Onesist's MCP endpoint there (dev: localhost:4321, desktop:
 * 127.0.0.1:<sidecar port>). Only loopback origins are kept: the value comes from the
 * request's Host, and a DNS-rebinding page must never be able to make Onesist hand its
 * MCP token to a foreign host. State lives on globalThis so Vite's HMR keeps it.
 */
const state: { origin: string | null } = ((globalThis as any).__onesistSelfOrigin ??= { origin: null });

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  } catch {
    return false;
  }
}

export function rememberOrigin(requestUrl: string): void {
  let origin: string;
  try {
    origin = new URL(requestUrl).origin;
  } catch {
    return;
  }
  if (isLoopbackOrigin(origin)) state.origin = origin;
}

export function selfOrigin(): string | null {
  return state.origin;
}

/** For tests. */
export function resetSelfOrigin(): void {
  state.origin = null;
}
