/**
 * Presets for external MCP servers (GitHub, Figma, Miro, Monday, Custom).
 */
export interface McpPreset {
  id: string;
  label: string;
  description: string;
  logo: string;
  transport: "http" | "sse" | "stdio";
  url: string;
  authKind: "none" | "header" | "oauth";
  authHeader?: string;
  /**
   * How "auto configuration" connects, when the provider supports it.
   *  - `gh`    — borrow the token the gh CLI already holds. GitHub publishes no
   *              dynamic client registration, so there is no browser flow for it.
   *  - `oauth` — the MCP authorization flow (dynamic client registration + PKCE).
   * A preset without this connects through manual configuration only.
   *
   * This is separate from `authKind`, which records what the *stored row* looks
   * like: a gh-connected row is a plain `header` + Bearer token, while a
   * browser-authorized one is `oauth` + a token bundle.
   */
  connect?: "gh" | "oauth";
  hint?: string;
}

export const MCP_PRESETS: McpPreset[] = [
  {
    id: "custom",
    label: "Custom MCP Server",
    description: "Hubungkan server MCP kustom milik Anda via HTTP, SSE, atau Stdio.",
    logo: "⚙️",
    transport: "http",
    url: "",
    authKind: "none",
  },
  {
    id: "github",
    label: "GitHub MCP",
    description: "Akses repository, issue, PR, dan file kode GitHub secara langsung.",
    logo: "🐙",
    transport: "http",
    url: "https://api.githubcopilot.com/mcp/",
    authKind: "header",
    authHeader: "Authorization",
    connect: "gh",
    hint: "Hubungkan otomatis lewat gh CLI, atau pakai Personal Access Token manual.",
  },
  {
    id: "figma",
    label: "Figma MCP",
    description: "Ambil struktur file desain, komponen, dan token dari Figma.",
    logo: "🎨",
    transport: "http",
    url: "https://mcp.figma.com/mcp",
    authKind: "header",
    authHeader: "Authorization",
    hint: "Figma hanya menerima klien katalog resminya — pakai Personal Access Token.",
  },
  {
    id: "miro",
    label: "Miro MCP",
    description: "Baca board, sticky notes, dan diagram dari Miro workspace.",
    logo: "📋",
    transport: "http",
    url: "https://mcp.miro.com/mcp",
    authKind: "oauth",
    connect: "oauth",
    hint: "Mendukung Hubungkan otomatis (OAuth) atau Access Token manual.",
  },
  {
    id: "monday",
    label: "Monday.com MCP",
    description: "Kelola item board, workspace, dan update project management.",
    logo: "📊",
    transport: "http",
    url: "https://mcp.monday.com/mcp",
    authKind: "oauth",
    connect: "oauth",
    hint: "Mendukung Hubungkan otomatis (OAuth) atau API Token manual.",
  },
];

export function getMcpPreset(id: string): McpPreset | undefined {
  return MCP_PRESETS.find((p) => p.id === id) ?? MCP_PRESETS[0];
}
