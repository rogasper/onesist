/**
 * Copy-ready MCP client configuration. The URL comes from the request that asked
 * for it, so it names the port this server actually listens on (the desktop
 * sidecar picks the first free port from 4321).
 */
export interface McpSnippets {
  claude: string;
  opencode: string;
}

export function mcpEndpointUrl(origin: string, projectId: string): string {
  return `${origin.replace(/\/+$/, "")}/api/mcp/projects/${encodeURIComponent(projectId)}`;
}

export function mcpSnippets(url: string, token: string): McpSnippets {
  return {
    claude: `claude mcp add --transport http onesist ${url} --header "Authorization: Bearer ${token}"`,
    opencode: JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        mcp: { onesist: { type: "remote", url, enabled: true, headers: { Authorization: `Bearer ${token}` } } },
      },
      null,
      2,
    ),
  };
}
