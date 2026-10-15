/**
 * Exposes an AI SDK tool (as built in `server/agent`) over MCP.
 *
 * The agent loop validates arguments before it calls `execute`; an MCP call does
 * not go through that loop, so validation happens here with the same zod schema.
 */
import { z } from "zod";
import type { McpTool } from "./protocol";

export interface AiToolLike {
  /** A string, or (in the AI SDK's own types) a function of the call context. Only a string is used here. */
  description?: unknown;
  /** A zod schema — every Onesist tool is declared with one. */
  inputSchema: unknown;
  execute?: (...args: any[]) => unknown;
}

export function mcpToolFromAi(name: string, tool: AiToolLike): McpTool {
  const schema = tool.inputSchema as z.ZodType;
  const inputSchema = z.toJSONSchema(schema) as Record<string, unknown>;
  delete inputSchema.$schema;

  return {
    name,
    description: typeof tool.description === "string" ? tool.description : "",
    inputSchema,
    call: async (args) => {
      const parsed = schema.safeParse(args);
      if (!parsed.success) {
        const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
        throw new Error(`Argumen tidak valid: ${detail}`);
      }
      if (!tool.execute) throw new Error(`Tool ${name} tidak bisa dijalankan.`);
      const output = await tool.execute(parsed.data, { toolCallId: `mcp-${crypto.randomUUID()}`, messages: [] });
      return typeof output === "string" ? output : JSON.stringify(output, null, 1);
    },
  };
}
