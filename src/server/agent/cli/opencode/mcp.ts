/**
 * Puts Onesist's own MCP server into OpenCode for one project folder, so an OpenCode
 * thread can read Onesist's data (threads, database, code index) with the same
 * read-only tools outside agents use. OpenCode 2 adds it at runtime, scoped to the
 * folder, and forgets it when its server restarts; nothing is written to the user's
 * OpenCode config.
 *
 * Remembered per server, folder, endpoint and token. A remembered entry is still
 * checked each turn: a server the user runs keeps its URL across a restart, and the
 * restart drops runtime MCP servers.
 */
import crypto from "node:crypto";
import { ocListMcp, ocPutMcp, type OpenCodeConnection } from "./client";

export const ONESIST_MCP_NAME = "onesist";

export interface OnesistMcp {
  url: string;
  token: string;
}

const state: { added: Set<string> } = ((globalThis as any).__onesistOpenCodeMcp ??= { added: new Set<string>() });

const keyOf = (conn: OpenCodeConnection, directory: string, mcp: OnesistMcp) =>
  [conn.baseUrl, directory, mcp.url, crypto.createHash("sha256").update(mcp.token).digest("hex").slice(0, 12)].join("|");

/** True when sessions in `directory` can use Onesist's tools afterwards. Never throws. */
export async function ensureOnesistMcp(conn: OpenCodeConnection, directory: string, mcp: OnesistMcp): Promise<boolean> {
  const key = keyOf(conn, directory, mcp);
  try {
    if (state.added.has(key)) {
      const listed = await ocListMcp(conn, directory);
      if (listed.some((s) => s.name === ONESIST_MCP_NAME)) return true;
      state.added.delete(key);
    }
    await ocPutMcp(conn, directory, ONESIST_MCP_NAME, { url: mcp.url, headers: { Authorization: `Bearer ${mcp.token}` } });
    state.added.add(key);
    return true;
  } catch (err) {
    // OpenCode may echo the config (and so the token) in its error body.
    const text = (err instanceof Error ? err.message : String(err)).split(mcp.token).join("<token>");
    console.warn(`[opencode] Onesist MCP could not be added for ${directory}: ${text}`);
    return false;
  }
}

/** For tests. */
export function forgetOnesistMcp(): void {
  state.added.clear();
}
