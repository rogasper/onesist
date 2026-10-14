/**
 * MCP endpoint for agents running outside Onesist (Claude Code, OpenCode, …).
 *
 * Streamable HTTP, stateless, JSON only: POST carries one JSON-RPC message; GET
 * (a server-sent stream) and DELETE (a session) are not offered. Checks run in
 * this order: Origin (DNS rebinding), token, project, JSON, protocol — the token
 * comes before the project so an unauthenticated caller learns nothing about ids.
 */
import { json } from "../http/response";
import { Router } from "../http/router";
import { getProject, resolveRoot } from "../http/route-utils";
import { handleMcpMessage, isAllowedOrigin } from "../mcp/protocol";
import { buildProjectMcpTools } from "../mcp/registry";
import { mcpEndpointUrl, mcpSnippets } from "../mcp/snippets";
import { bearerMatches, getMcpToken } from "../mcp/token";

export const router = new Router();

const notAllowed = () =>
  new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "no-store" } });

router.post("mcp/projects/:id", async (ctx) => {
  if (!isAllowedOrigin(ctx.request.headers.get("origin"))) {
    return json({ error: "Origin tidak diizinkan" }, 403);
  }
  if (!bearerMatches(ctx.request.headers.get("authorization"), getMcpToken())) {
    return json({ error: "Token MCP tidak valid" }, 401);
  }
  const project = getProject(ctx.params.id);
  if (!project) return json({ error: "Project tidak ditemukan" }, 404);

  let message: unknown;
  try {
    message = JSON.parse(await ctx.request.text());
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  const tools = buildProjectMcpTools(project.id, resolveRoot(project.id));
  const response = await handleMcpMessage(message, tools);
  if (response === null) return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  return json(response);
});

router.get("mcp/projects/:id", notAllowed);
router.delete("mcp/projects/:id", notAllowed);

/**
 * For the Settings panel. Same-origin UI only: the token is shown to the person who
 * already controls this app; a cross-site page is refused, and could not read the
 * answer anyway (no CORS headers).
 */
router.get("projects/:id/mcp", (ctx) => {
  if (!isAllowedOrigin(ctx.request.headers.get("origin"))) {
    return json({ error: "Origin tidak diizinkan" }, 403);
  }
  const project = getProject(ctx.params.id);
  if (!project) return json({ error: "Project tidak ditemukan" }, 404);
  const url = mcpEndpointUrl(new URL(ctx.request.url).origin, project.id);
  const token = getMcpToken();
  return json({ url, token, snippets: mcpSnippets(url, token) });
});
