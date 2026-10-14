/**
 * Minimal MCP server protocol (JSON-RPC 2.0) for the Streamable HTTP transport,
 * stateless and JSON-only: every POST carries one message and gets one JSON answer,
 * notifications get none. No sessions, no server-sent events, no batching (removed
 * from MCP in 2025-06-18). Pure: the HTTP route owns auth and transport.
 *
 * Implemented here instead of pulling in an SDK: the server side Onesist needs is
 * five methods, and the app keeps its dependency list deliberate (ADR-001).
 */

export const MCP_SERVER_NAME = "onesist";
/** Version of this MCP surface (tools and their shapes), not of the app. */
export const MCP_SERVER_VERSION = "1";
export const LATEST_PROTOCOL_VERSION = "2025-06-18";
export const SUPPORTED_PROTOCOL_VERSIONS: readonly string[] = ["2025-06-18", "2025-03-26"];
/**
 * Upper bound for one tool result. Claude Code moves larger MCP results to a file
 * and shows the model only a notice (t3code McpHttpServer.ts), so a bounded answer
 * with a hint is more useful than a complete one the model never reads.
 */
export const MCP_RESULT_MAX_CHARS = 20_000;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  call: (args: Record<string, unknown>) => Promise<string>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const INSTRUCTIONS =
  "Server ini memberi akses BACA ke data project Onesist: skema dan isi database aplikasi " +
  "(FSD, ERD, spec, task, RTM, wiki, riwayat chat), index kode project, dan thread chat. " +
  "Mulai dengan onesist_db_schema atau onesist_thread_list. Tidak ada tool yang menulis.";

export function boundText(text: string, max = MCP_RESULT_MAX_CHARS): string {
  if (text.length <= max) return text;
  return (
    `${text.slice(0, max)}\n\n… dipotong: ${text.length - max} karakter tidak ditampilkan. ` +
    "Persempit permintaan (LIMIT, filter, atau halaman berikutnya)."
  );
}

/**
 * MCP servers must check Origin to stop DNS rebinding. CLI clients send none;
 * a browser page does, and only one served from this machine may talk to us.
 */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const host = new URL(origin).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function failure(id: string | number | null, code: number, message: string): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

export async function handleMcpMessage(message: unknown, tools: McpTool[]): Promise<JsonRpcResponse | null> {
  if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    const id = isRecord(message) && (typeof message.id === "string" || typeof message.id === "number") ? message.id : null;
    return failure(id, -32600, "Invalid Request");
  }
  const { method } = message;
  const params = isRecord(message.params) ? message.params : {};
  // A message without an id is a notification: it is acted on (nothing to do here) and never answered.
  if (!("id" in message) || message.id === undefined) return null;
  const id = typeof message.id === "string" || typeof message.id === "number" ? message.id : null;

  switch (method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : LATEST_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: MCP_SERVER_NAME, version: MCP_SERVER_VERSION },
          instructions: INSTRUCTIONS,
        },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: { tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) },
      };
    case "tools/call": {
      const tool = tools.find((t) => t.name === params.name);
      if (!tool) return failure(id, -32602, `Tool tidak dikenal: ${String(params.name)}`);
      const args = params.arguments ?? {};
      if (!isRecord(args)) return failure(id, -32602, "Argumen tool harus berupa objek");
      try {
        const text = await tool.call(args);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: boundText(text) }], isError: false } };
      } catch (err) {
        // Tool failures are results the model can read and act on, not protocol errors.
        const text = err instanceof Error ? err.message : String(err);
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: boundText(text) }], isError: true } };
      }
    }
    default:
      return failure(id, -32601, `Method not found: ${method}`);
  }
}
