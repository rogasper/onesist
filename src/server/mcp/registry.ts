/**
 * Which tools a project offers over MCP. Read-only on purpose: an outside agent's
 * own permission prompt is not Onesist's approval flow, so nothing here writes.
 * `app_write` from the same builder is deliberately left out.
 */
import { buildDbTools } from "~/server/agent/db/tools";
import { buildCodeSearchTool } from "~/server/agent/index/tool";
import { mcpToolFromAi } from "./from-ai-tool";
import type { McpTool } from "./protocol";
import { buildThreadTools } from "./thread-tools";

export const MCP_TOOL_NAMES = [
  "onesist_db_schema",
  "onesist_db_query",
  "onesist_code_search",
  "onesist_thread_list",
  "onesist_thread_read",
] as const;

export function buildProjectMcpTools(projectId: string, root: string): McpTool[] {
  const { dbSchema, dbQuery } = buildDbTools({ projectId, permissionMode: "readonly" });
  const codeSearch = buildCodeSearchTool({ projectId, root });
  const { threadList, threadRead } = buildThreadTools(projectId);
  return [
    mcpToolFromAi("onesist_db_schema", dbSchema),
    mcpToolFromAi("onesist_db_query", dbQuery),
    mcpToolFromAi("onesist_code_search", codeSearch),
    mcpToolFromAi("onesist_thread_list", threadList),
    mcpToolFromAi("onesist_thread_read", threadRead),
  ];
}
