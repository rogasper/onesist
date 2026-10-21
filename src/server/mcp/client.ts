/**
 * External MCP client manager (GitHub, Figma, Miro, Monday, custom).
 *
 * Uses `@ai-sdk/mcp` `createMCPClient` over HTTP or stdio transports.
 * Caches connected clients per server id with idle shutdown (pola `browser/manager.ts`).
 */
import { db } from "~/server/db/client";
import { mcpServers } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { type Tool } from "ai";
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { readStoredTokens } from "./oauth";
import { assertSafeMcpUrl, safeMcpFetch } from "./url-guard";

export class McpClientError extends Error {}

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "http" | "sse" | "stdio";
  url: string | null;
  command: string | null;
  argsJson: string | null;
  envJson: string | null;
  authKind: "none" | "header" | "oauth";
  authHeader: string | null;
  authValue: string | null;
}

const activeClients = new Map<string, { client: MCPClient; lastUsed: number }>();
const IDLE_MS = 5 * 60_000;

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of activeClients.entries()) {
    if (now - entry.lastUsed > IDLE_MS) {
      entry.client.close().catch(() => {});
      activeClients.delete(id);
    }
  }
}, 60_000).unref?.();

/**
 * Cache key for a connection.
 *
 * Not the row id alone: a draft test always carries `id: "draft"`, so two
 * different drafts (or the same row after its token changed) would reuse the
 * first connection and report a result for credentials that were never used.
 * Everything that decides where we connect and how we authenticate is in here.
 */
function connectionKey(config: McpServerConfig): string {
  const stored = config.authKind === "oauth" ? readStoredTokens(config as any)?.access_token ?? "" : "";
  return JSON.stringify([
    config.id,
    config.transport,
    config.url,
    config.command,
    config.argsJson,
    config.envJson,
    config.authKind,
    config.authHeader,
    // The value itself never goes in a key that might be logged; a digest is
    // enough to tell two credentials apart.
    config.authValue ? createHash("sha256").update(config.authValue).digest("hex").slice(0, 16) : null,
    stored ? createHash("sha256").update(stored).digest("hex").slice(0, 16) : null,
  ]);
}

export interface ConnectOptions {
  /**
   * Tests only: the mock MCP server listens on loopback, which the URL guard
   * refuses on purpose. No route ever sets this.
   */
  allowPrivateHosts?: boolean;
}

export async function getMcpClient(config: McpServerConfig, options: ConnectOptions = {}): Promise<MCPClient> {
  const key = connectionKey(config);
  const existing = activeClients.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.client;
  }

  let transportConfig: any;
  const headers: Record<string, string> = {};
  if (config.authKind === "oauth") {
    // The row holds the token bundle from the OAuth callback; the client only
    // ever sends the access token.
    const stored = readStoredTokens(config as any);
    if (stored?.access_token) headers["Authorization"] = `Bearer ${stored.access_token}`;
  } else if (config.authKind === "header" && config.authHeader && config.authValue) {
    let val = config.authValue.trim();
    const hdr = config.authHeader.trim();
    if (hdr.toLowerCase() === "authorization" && !/^bearer\s+/i.test(val)) {
      val = `Bearer ${val}`;
    }
    headers[hdr] = val;
  }

  if (config.transport === "stdio" && config.command) {
    let args: string[] = [];
    let env: Record<string, string> = {};
    try {
      if (config.argsJson) args = JSON.parse(config.argsJson);
    } catch {}
    try {
      if (config.envJson) env = JSON.parse(config.envJson);
    } catch {}
    // Dynamic import for stdio transport
    const { Experimental_StdioMCPTransport } = await import("@ai-sdk/mcp/mcp-stdio");
    transportConfig = new Experimental_StdioMCPTransport({
      command: config.command,
      args,
      env: { ...process.env, ...env } as any,
    });
  } else {
    const raw = config.url?.trim();
    if (!raw) throw new McpClientError("URL server MCP belum diisi.");
    let url: URL;
    if (options.allowPrivateHosts) {
      url = new URL(raw);
    } else {
      try {
        url = await assertSafeMcpUrl(raw);
      } catch (err) {
        throw new McpClientError((err as Error).message);
      }
    }
    transportConfig = {
      type: config.transport === "sse" ? "sse" : "http",
      url: url.href,
      headers: Object.keys(headers).length ? headers : undefined,
      // Validates every request and every redirect hop, unlike the transport's
      // own redirect handling.
      ...(options.allowPrivateHosts ? {} : { fetch: safeMcpFetch }),
    };
  }

  try {
    const client = await createMCPClient({ transport: transportConfig });
    activeClients.set(key, { client, lastUsed: Date.now() });
    return client;
  } catch (err: any) {
    throw new McpClientError(err?.message ?? "Gagal terhubung ke server MCP.");
  }
}

export async function fetchServerTools(config: McpServerConfig, options: ConnectOptions = {}): Promise<{ tools: Record<string, Tool>; count: number; instructions?: string }> {
  const client = await getMcpClient(config, options);
  const toolSet = await client.tools();
  const rawTools = toolSet as unknown as Record<string, Tool>;
  const count = Object.keys(rawTools).length;
  return { tools: rawTools, count, instructions: client.instructions };
}

/**
 * Drops every cached connection belonging to one stored row.
 *
 * The cache is keyed by configuration, not by id, so a row whose token changed
 * can have more than one entry; all of them are stale once the row is updated.
 */
export async function closeServerClient(id: string): Promise<void> {
  const prefix = JSON.stringify(id).slice(0, -1);
  for (const [key, entry] of activeClients.entries()) {
    if (!key.startsWith(prefix)) continue;
    await entry.client.close().catch(() => {});
    activeClients.delete(key);
  }
}

export async function closeAllMcpClients(): Promise<void> {
  for (const [id, entry] of activeClients.entries()) {
    await entry.client.close().catch(() => {});
  }
  activeClients.clear();
}

/** A dead endpoint must delay a chat turn, not hold it. */
function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new McpClientError(`${label} tidak merespons dalam ${Math.round(ms / 1000)} detik.`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function loadMcpToolsForTurn(messageText?: string): Promise<{ tools: Record<string, Tool>; serverSummaries: { name: string; instructions?: string }[] }> {
  const rows = db.select().from(mcpServers).where(eq(mcpServers.enabled, true)).all();
  if (!rows.length) return { tools: {}, serverSummaries: [] };

  // Check if message references specific server via %servername
  const mentionedServers = new Set<string>();
  if (messageText) {
    const matches = messageText.matchAll(/%([a-zA-Z0-9_-]+)/g);
    for (const m of matches) {
      mentionedServers.add(m[1].toLowerCase());
    }
  }

  const tools: Record<string, Tool> = {};
  const serverSummaries: { name: string; instructions?: string }[] = [];

  for (const row of rows) {
    const isMentioned = mentionedServers.size === 0 || mentionedServers.has(row.name.toLowerCase());
    if (!isMentioned) continue;

    try {
      const { tools: serverTools, instructions } = await withTimeout(
        fetchServerTools(row as any),
        12_000,
        `Server MCP "${row.name}"`,
      );
      serverSummaries.push({ name: row.name, instructions: instructions ?? row.instructions ?? undefined });
      for (const [tName, tDef] of Object.entries(serverTools)) {
        tools[`${row.name}__${tName}`] = tDef;
      }
    } catch (err: any) {
      console.error(`[mcp] failed to load tools for server ${row.name}:`, err?.message);
    }
  }

  return { tools, serverSummaries };
}

