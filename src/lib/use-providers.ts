import { useCallback, useEffect, useState } from "react";

/**
 * Data hook for BYOK provider configuration (FR-L).
 *
 * Every request uses `cache: "no-store"` — this app's convention, because
 * the desktop WKWebView caches API responses heuristically and stale provider
 * data means the user thinks their config changed when it hasn't.
 */

export interface ProviderSummary {
  id: string;
  name: string;
  preset: string;
  presetLabel: string;
  apiStyle: string;
  endpoint: string | null;
  /** Already masked (`sk-…abcd`). The API never sends the raw key. */
  apiKeyMasked: string | null;
  hasApiKey: boolean;
  authMethod: string;
  model: string | null;
  modelsJson: string | null;
  customHeadersJson: string | null;
  proxyUrl: string | null;
  skipTlsVerify: boolean;
  enableThinking: boolean;
  effortCapabilityJson: string | null;
  maxOutputTokens: number | null;
  contextWindow: number | null;
  cliAgent: string | null;
  cliPath: string | null;
  cliEnvKeys: string[];
  isDefault: boolean;
  lastTestOk: boolean | null;
  lastTestedAt: string | null;
  lastTestLatencyMs: number | null;
  lastTestErrorCategory: string | null;
  /** "user" | "env" — environment-sourced ones can't be edited/deleted (FR-A17). */
  source: string;
  /** Worth offering in the model picker? (FR-L3) */
  usable: boolean;
  /** Config fingerprint; used to judge whether a test result still holds (FR-L5). */
  fingerprint: string;
}

export interface ProviderPresetInfo {
  id: string;
  label: string;
  apiStyle: string;
  authMethod: string;
  endpoint: string;
  cliAgent?: string;
  defaultModel?: string;
  defaultMaxOutputTokens?: number;
  requiresApiKey: boolean;
  hint?: string;
}

export interface ProviderTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  modelUsed?: string;
  errorCategory?: string;
}

export interface ProviderModelInfo {
  id: string;
  displayName?: string;
  saved?: boolean;
}

export interface ProviderDraft {
  name: string;
  preset: string;
  apiStyle: string;
  endpoint: string;
  apiKey: string;
  authMethod: string;
  model: string;
  maxOutputTokens: number | null;
  contextWindow: number | null;
  /** Header HTTP tambahan (FR-A2): sebagian endpoint butuh header khusus, mis.
   *  gateway yang meminta header sesi. Bentuknya objek nama→nilai. */
  customHeaders: Record<string, string>;
  /** Harga per 1 juta token, diisi user (Fase 5.5). Kosong = biaya tidak dihitung. */
  inputPricePerMTok: number | null;
  outputPricePerMTok: number | null;
  proxyUrl: string;
  skipTlsVerify: boolean;
  enableThinking: boolean;
  isDefault?: boolean;
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

/** Error category → suggestion sentence. Mirrors the server-side `errorHintFor`, so
 *  the user knows what to change without opening the docs. */
export function testErrorHint(category?: string): string {
  switch (category) {
    case "auth":
      return "API key ditolak. Periksa key-nya, atau apakah key itu memang untuk endpoint ini.";
    case "endpoint":
      return "Endpoint tidak ditemukan. Pastikan base URL lengkap termasuk versi API (mis. /v1).";
    case "request":
      return "Permintaan ditolak provider. Biasanya nama model tidak dikenal.";
    case "rate-limit":
      return "Kena batas laju provider. Coba lagi beberapa saat lagi.";
    case "server":
      return "Provider sedang bermasalah di sisinya. Coba lagi nanti.";
    case "network":
      return "Tidak bisa menghubungi endpoint. Periksa koneksi jaringan atau apakah servis lokalnya berjalan.";
    case "cli":
      return "Provider CLI diuji dengan mendeteksi binary-nya, bukan lewat HTTP.";
    default:
      return "Penyebab tidak dapat dipastikan. Lihat pesan provider di atas.";
  }
}

/** Config name validation — mirrors the server-side `validateConfigName` (FR-L2).
 *  Validated while typing so the user knows before saving, not after. */
export function validateName(name: string, providers: ProviderSummary[], excludeId?: string): "empty" | "duplicate" | "valid" {
  if (!name.trim()) return "empty";
  const lower = name.trim().toLowerCase();
  if (providers.some((p) => p.id !== excludeId && p.source === "user" && p.name.trim().toLowerCase() === lower)) return "duplicate";
  return "valid";
}

export function useProviders() {
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [presets, setPresets] = useState<ProviderPresetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [p, pr] = await Promise.all([
        api<{ providers: ProviderSummary[] }>("/api/providers"),
        api<{ presets: ProviderPresetInfo[] }>("/api/providers/presets"),
      ]);
      setProviders(p.providers);
      setPresets(pr.presets);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Gagal memuat provider");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createProvider = useCallback(
    async (draft: ProviderDraft) => {
      await api("/api/providers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      await refresh();
    },
    [refresh],
  );

  const updateProvider = useCallback(
    async (id: string, patch: Partial<ProviderDraft> & { clearApiKey?: boolean }) => {
      await api(`/api/providers/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      await refresh();
    },
    [refresh],
  );

  const deleteProvider = useCallback(
    async (id: string) => {
      await api(`/api/providers/${id}`, { method: "DELETE" });
      await refresh();
    },
    [refresh],
  );

  /** Tests a configuration. `overrides` tests unsaved edits, so the user
   *  doesn't have to save first to try them out. */
  const testProvider = useCallback(async (id: string, overrides?: Partial<ProviderDraft>): Promise<ProviderTestResult> => {
    const body = await api<{ result: ProviderTestResult }>(`/api/providers/${id}/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(overrides ?? {}),
    });
    return body.result;
  }, []);

  /** Test a configuration that has NOT been saved yet. Nothing is written, so
   *  pressing Test can no longer act as a hidden "apply" — and the test is
   *  available exactly when it matters most: before committing the config. */
  const testDraft = useCallback(async (draft: Partial<ProviderDraft>): Promise<ProviderTestResult> => {
    const body = await api<{ result: ProviderTestResult }>("/api/providers/test-draft", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
    return body.result;
  }, []);

  const getModels = useCallback(async (id: string) => {
    return api<{ models: ProviderModelInfo[]; supported: boolean; message?: string }>(`/api/providers/${id}/models`);
  }, []);

  /** Discovery for an unsaved config — used when adding a new
   *  provider, exactly when the model list is needed most. */
  const getModelsForDraft = useCallback(async (draft: Partial<ProviderDraft> & { id?: string }) => {
    return api<{ models: ProviderModelInfo[]; supported: boolean; message?: string }>("/api/providers/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
  }, []);

  return { providers, presets, loading, error, refresh, createProvider, updateProvider, deleteProvider, testProvider, testDraft, getModels, getModelsForDraft };
}

/** Client-side fingerprint, used to judge whether the last test result still
 *  holds after the form changes (FR-L5). Compared against the server's
 *  `fingerprint`; the key is NOT included — the server hashes it, and we only
 *  need to know "did anything change". */
export function draftFingerprint(draft: Partial<ProviderDraft>): string {
  return JSON.stringify([
    draft.apiStyle,
    draft.endpoint,
    draft.apiKey ? "[SET]" : null,
    draft.authMethod,
    draft.model,
    draft.proxyUrl,
    draft.skipTlsVerify,
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Application preferences (FR-L7)
// ─────────────────────────────────────────────────────────────────────────────

export interface AppSettings {
  agentMaxSteps: number;
}

export interface AppSettingsBounds {
  agentMaxSteps: { min: number; max: number; default: number };
}

/**
 * Application-level preferences. Machine-wide defaults (they apply to threads
 * that do not exist yet), which is why they live here and not on a thread.
 *
 * The bounds come from the server so the form and the backend guard cannot drift
 * apart — the clamp on write is the source of truth (ADR D7.5).
 */
export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [bounds, setBounds] = useState<AppSettingsBounds | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setSettings((data.settings ?? null) as AppSettings | null);
      setBounds((data.bounds ?? null) as AppSettingsBounds | null);
    } catch {
      /* preferences are not worth breaking the surface over */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const save = useCallback(
    async (patch: Partial<AppSettings>) => {
      setSaving(true);
      try {
        const res = await fetch("/api/settings", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) return { ok: false as const, error: data?.error ?? `HTTP ${res.status}` };
        // The server returns the stored value: show what was actually saved, not
        // what was typed, so a clamped value cannot look like it was accepted.
        setSettings((data.settings ?? null) as AppSettings | null);
        return { ok: true as const };
      } catch (err: any) {
        return { ok: false as const, error: err?.message ?? "Gagal menyimpan preferensi." };
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { settings, bounds, saving, save, refresh };
}
