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
  transport: "http" | "sse" | "stdio";
  url: string;
  authKind: "none" | "header" | "oauth";
  authHeader?: string;
  hint?: string;
}

export interface McpTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  toolCount?: number;
  tools?: string[];
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
  readOnly: boolean;
  enabled: boolean;
  instructions: string;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
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
    authValue: "",
    readOnly: s.readOnly,
    enabled: s.enabled,
    instructions: s.instructions ?? "",
  };
}
