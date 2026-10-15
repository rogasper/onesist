/**
 * Presets for external MCP servers (GitHub, Figma, Miro, Monday, Custom).
 */
export interface McpPreset {
  id: string;
  label: string;
  transport: "http" | "sse" | "stdio";
  url: string;
  authKind: "none" | "header" | "oauth";
  authHeader?: string;
  hint?: string;
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: "github",
    label: "GitHub MCP",
    transport: "http",
    url: "https://api.githubcopilot.com/mcp/",
    authKind: "header",
    authHeader: "Authorization",
    hint: "Gunakan Personal Access Token (PAT) dengan prefix Bearer.",
  },
  {
    id: "figma",
    label: "Figma MCP",
    transport: "http",
    url: "https://mcp.figma.com/mcp",
    authKind: "oauth",
    hint: "Memerlukan autentikasi OAuth Figma.",
  },
  {
    id: "miro",
    label: "Miro MCP",
    transport: "http",
    url: "https://mcp.miro.com/mcp",
    authKind: "header",
    authHeader: "Authorization",
  },
  {
    id: "monday",
    label: "Monday.com MCP",
    transport: "http",
    url: "https://mcp.monday.com/mcp",
    authKind: "header",
    authHeader: "Authorization",
  },
  {
    id: "custom",
    label: "Custom MCP Server",
    transport: "http",
    url: "",
    authKind: "none",
  },
];

export function getMcpPreset(id: string): McpPreset | undefined {
  return MCP_PRESETS.find((p) => p.id === id);
}
