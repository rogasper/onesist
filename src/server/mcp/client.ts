/**
 * External MCP client manager (GitHub, Figma, Miro, Monday, custom).
 *
 * Uses `@ai-sdk/mcp` `createMCPClient` over HTTP or stdio transports.
 * Caches connected clients per server id with idle shutdown (pola `browser/manager.ts`).
 */
import { db } from "~/server/db/client";
import { mcpServers } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { type Tool } from "ai";
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";

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

export async function getMcpClient(config: McpServerConfig): Promise<MCPClient> {
  const existing = activeClients.get(config.id);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing.client;
  }

  let transportConfig: any;
  const headers: Record<string, string> = {};
  if (config.authKind === "header" && config.authHeader && config.authValue) {
    headers[config.authHeader.trim()] = config.authValue.trim();
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
    const url = config.url?.trim();
    if (!url) throw new McpClientError("URL server MCP belum diisi.");
    transportConfig = {
      type: config.transport === "sse" ? "sse" : "http",
      url,
      headers: Object.keys(headers).length ? headers : undefined,
    };
  }

  try {
    const client = await createMCPClient({ transport: transportConfig });
    activeClients.set(config.id, { client, lastUsed: Date.now() });
    return client;
  } catch (err: any) {
    throw new McpClientError(err?.message ?? "Gagal terhubung ke server MCP.");
  }
}

export async function fetchServerTools(config: McpServerConfig): Promise<{ tools: Record<string, Tool>; count: number; instructions?: string }> {
  const client = await getMcpClient(config);
  const toolSet = await client.tools();
  const rawTools = toolSet as unknown as Record<string, Tool>;
  const count = Object.keys(rawTools).length;
  return { tools: rawTools, count, instructions: client.instructions };
}

export async function closeServerClient(id: string): Promise<void> {
  const entry = activeClients.get(id);
  if (entry) {
    await entry.client.close().catch(() => {});
    activeClients.delete(id);
  }
}

export async function closeAllMcpClients(): Promise<void> {
  for (const [id, entry] of activeClients.entries()) {
    await entry.client.close().catch(() => {});
  }
  activeClients.clear();
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
      const { tools: serverTools, instructions } = await fetchServerTools(row as any);
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

