import { useCallback, useEffect, useState } from "react";

export interface McpServerSummary {
  id: string;
  name: string;
  preset: string;
  presetLabel: string;
  transport: "http" | "sse" | "stdio";
  url: string | null;
  command: string | null;
  argsJson: string | null;
  envJson: string | null;
  authKind: "none" | "header" | "oauth";
  authHeader: string | null;
  authValueMasked: string | null;
  hasAuthValue: boolean;
  readOnly: boolean;
  enabled: boolean;
  instructions: string | null;
  toolCount: number;
  lastStatus: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface McpPresetInfo {
  id: string;
  label: string;
  description: string;
  logo: string;
  transport: "http" | "sse" | "stdio";
  url: string;
  authKind: "none" | "header" | "oauth";
  authHeader?: string;
  /** How auto configuration connects: `gh` borrows the CLI token, `oauth` runs
   *  the MCP authorization flow. Absent = manual configuration only. */
  connect?: "gh" | "oauth";
  hint?: string;
}

export interface GhStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
  authenticated: boolean;
  account: string | null;
  tokenPrefix: string | null;
  scopes: string[];
  error: string | null;
}

export interface McpTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  toolCount?: number;
  tools?: string[];
}

/**
 * What a connect step produces. The credential itself stays on the server: the
 * form carries only the reference, and the value is resolved when it is saved.
 */
export interface CredentialResult {
  pending: boolean;
  credentialRef?: string;
  authKind?: "header" | "oauth";
  authHeader?: string | null;
  authValue?: string;
}

export interface McpServerDraft {
  name: string;
  preset: string;
  transport: "http" | "sse" | "stdio";
  url: string;
  command: string;
  argsJson: string;
  envJson: string;
  authKind: "none" | "header" | "oauth";
  authHeader: string;
  authValue: string;
  /**
   * Reference to a credential acquired but not yet saved (the gh token, or an
   * OAuth bundle). The value never reaches the browser, so saving sends this.
   */
  credentialRef: string;
  readOnly: boolean;
  enabled: boolean;
  instructions: string;
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Balasan tidak terbaca dari ${url}`);
  }
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}

export function useMcpServers() {
  const [servers, setServers] = useState<McpServerSummary[]>([]);
  const [presets, setPresets] = useState<McpPresetInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [serversRes, presetsRes] = await Promise.all([
        api<{ servers: McpServerSummary[] }>("/api/mcp-servers"),
        api<{ presets: McpPresetInfo[] }>("/api/mcp-servers/presets"),
      ]);
      setServers(serversRes.servers);
      setPresets(presetsRes.presets);
    } catch (err: any) {
      setError(err?.message ?? "Gagal memuat server MCP.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createServer = async (draft: McpServerDraft): Promise<McpServerSummary> => {
    const res = await api<{ server: McpServerSummary }>("/api/mcp-servers", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    await refresh();
    return res.server;
  };

  const updateServer = async (id: string, patch: Partial<McpServerDraft>): Promise<McpServerSummary> => {
    const res = await api<{ server: McpServerSummary }>(`/api/mcp-servers/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
    await refresh();
    return res.server;
  };

  const deleteServer = async (id: string): Promise<void> => {
    await api<{ ok: boolean }>(`/api/mcp-servers/${id}`, { method: "DELETE" });
    await refresh();
  };

  const testServer = async (id: string, draft?: Partial<McpServerDraft>): Promise<McpTestResult> => {
    const res = await api<McpTestResult>(`/api/mcp-servers/${id}/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: draft ? JSON.stringify(draft) : JSON.stringify({}),
    });
    await refresh();
    return res;
  };

  const testDraft = async (draft: McpServerDraft): Promise<McpTestResult> => {
    return api<McpTestResult>("/api/mcp-servers/test-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
  };

  const startOAuth = async (url: string): Promise<{ authorized: boolean; authorizationUrl?: string; state: string }> => {
    return api<{ authorized: boolean; authorizationUrl?: string; state: string }>("/api/mcp-servers/oauth/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
  };

  /** The credential a finished flow produced, or `pending` while unapproved. */
  const oauthResult = async (state: string): Promise<CredentialResult> => {
    return api<CredentialResult>("/api/mcp-servers/oauth/result", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state }),
    });
  };

  const ghStatus = async (): Promise<GhStatus> => api<GhStatus>("/api/mcp-servers/gh/status");

  /** Fetches the CLI token as an unsaved credential; nothing is written. */
  const ghToken = async (): Promise<{ ok: boolean; account: string | null; credentialRef: string }> => {
    return api<{ ok: boolean; account: string | null; credentialRef: string }>("/api/mcp-servers/gh/token", { method: "POST" });
  };

  return {
    servers,
    presets,
    loading,
    error,
    refresh,
    createServer,
    updateServer,
    deleteServer,
    testServer,
    testDraft,
    startOAuth,
    oauthResult,
    ghStatus,
    ghToken,
  };
}

export function emptyDraft(): McpServerDraft {
  return {
    name: "",
    preset: "custom",
    transport: "http",
    url: "",
    command: "",
    argsJson: "[]",
    envJson: "{}",
    authKind: "none",
    authHeader: "Authorization",
    authValue: "",
    credentialRef: "",
    readOnly: false,
    enabled: true,
    instructions: "",
  };
}

export function draftFrom(s: McpServerSummary): McpServerDraft {
  return {
    name: s.name,
    preset: s.preset,
    transport: s.transport,
    url: s.url ?? "",
    command: s.command ?? "",
    argsJson: s.argsJson ?? "[]",
    envJson: s.envJson ?? "{}",
    authKind: s.authKind,
    authHeader: s.authHeader ?? "Authorization",
    // Empty on purpose: the stored credential is never sent to the page, so the
    // field stays blank and an empty value means "keep what is stored".
    authValue: "",
    credentialRef: "",
    readOnly: s.readOnly,
    enabled: s.enabled,
    instructions: s.instructions ?? "",
  };
}
