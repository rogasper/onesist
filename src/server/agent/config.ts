/**
 * Provider configuration: `llm_providers` row → AI SDK model instance.
 *
 * Three things that are easy to get wrong and were proven in the Phase 0 spike,
 * all handled here:
 *
 *  - `includeUsage: true` — without it `usage` is always `undefined` when streaming,
 *    making per-turn token counting impossible (spike R1).
 *  - `maxOutputTokens` ALWAYS explicit — registry-based providers cap output
 *    at 4096 tokens for models unknown to them (spike T2).
 *  - `baseURL` used as-is — AI SDK only appends its final segment
 *    itself, so the API version must already be in the endpoint (spike T4).
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { llmProviders } from "~/server/db/schema";
import {
  createAnthropic,
  createOpenAI,
  createOpenAICompatible,
  generateText,
  type LanguageModel,
} from "./ai";
import { getPreset, presetRank } from "./presets";
import { DEFAULT_MAX_OUTPUT_TOKENS, type AuthMethod, type ModelInfo, type TestConnectionResult } from "./types";

/** Provider row as-is from the DB. */
export type ProviderRow = typeof llmProviders.$inferSelect;

// ─────────────────────────────────────────────────────────────────────────────
// Secret redaction (FR-K7)
// ─────────────────────────────────────────────────────────────────────────────

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{8,}/g,
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  // Truncated forms the provider itself produces, e.g. `sk-...-000` — LiteLLM
  // shows the first 3 and last 3 characters (spike R6). The dots break
  // the pattern above, so a separate pattern is needed.
  /\bsk-\S*\.\.\.\S*/g,
  /\b(?:Bearer|bearer)\s+[A-Za-z0-9._-]{12,}/g,
  /\b(?:api[_-]?key|apikey|token|secret|password)["'\s:=]+["']?[A-Za-z0-9._-]{12,}/gi,
];

/**
 * Provider error messages can echo part of the API key — LiteLLM for example
 * prints `Received API Key = sk-...` along with its token hash (spike R6). Anything
 * coming from the provider MUST pass through here before entering logs or the DB.
 *
 * When `knownKey` is given, its exact occurrences are replaced first. That is far
 * more reliable than patterns, and covers unexpected forms.
 */
export function redactSecrets(input: unknown, knownKey?: string | null): string {
  let text = typeof input === "string" ? input : input instanceof Error ? input.message : String(input ?? "");
  const key = knownKey?.trim();
  if (key && key.length >= 8) text = text.split(key).join("[REDACTED]");
  for (const re of SECRET_PATTERNS) text = text.replace(re, "[REDACTED]");
  return text;
}

/** Keys that must be hidden when a provider row is sent to the UI (FR-A8). */
export function maskApiKey(key: string | null | undefined): string | null {
  const k = key?.trim();
  if (!k) return null;
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 3)}…${k.slice(-4)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Error classification (FR-A5)
// ─────────────────────────────────────────────────────────────────────────────

export function classifyError(err: unknown): { category: string; status?: number } {
  const anyErr = err as any;
  const status: number | undefined = anyErr?.statusCode ?? anyErr?.status ?? anyErr?.response?.status;
  if (typeof status === "number") {
    if (status === 401 || status === 403) return { category: "auth", status };
    if (status === 404) return { category: "endpoint", status };
    if (status === 429) return { category: "rate-limit", status };
    if (status === 400 || status === 422) return { category: "request", status };
    if (status >= 500) return { category: "server", status };
    return { category: "unknown", status };
  }
  const msg = String(anyErr?.message ?? err ?? "").toLowerCase();
  if (/fetch failed|enotfound|econnrefused|network|socket|timeout|abort/.test(msg)) return { category: "network" };
  return { category: "unknown" };
}

/** Hint sentence per category — so the user knows what to change. */
export function errorHintFor(category: string): string {
  switch (category) {
    case "auth":
      return "API key ditolak. Periksa kembali key-nya, atau apakah key itu untuk endpoint ini.";
    case "endpoint":
      return "Endpoint tidak ditemukan. Pastikan base URL lengkap termasuk versi API (mis. /v1).";
    case "request":
      return "Permintaan ditolak provider. Biasanya nama model tidak dikenal — periksa kolom Model.";
    case "rate-limit":
      return "Kena batas laju provider. Coba lagi beberapa saat lagi.";
    case "server":
      return "Provider sedang bermasalah di sisinya. Coba lagi nanti.";
    case "network":
      return "Tidak bisa menghubungi endpoint. Periksa koneksi jaringan, alamat, atau apakah servis lokalnya berjalan.";
    default:
      return "Penyebab tidak dapat dipastikan. Lihat pesan provider di atas.";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication headers
// ─────────────────────────────────────────────────────────────────────────────

export function authHeaders(config: Pick<ProviderRow, "apiKey" | "authMethod">): Record<string, string> {
  const key = config.apiKey?.trim();
  if (!key || config.authMethod === "none") return {};
  if (config.authMethod === "api-key") return { "x-api-key": key };
  return { Authorization: `Bearer ${key}` };
}

function customHeadersOf(config: ProviderRow): Record<string, string> {
  if (!config.customHeadersJson) return {};
  try {
    const parsed = JSON.parse(config.customHeadersJson);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Building the model
// ─────────────────────────────────────────────────────────────────────────────

export class ProviderConfigError extends Error {
  constructor(message: string, readonly category = "config") {
    super(message);
    this.name = "ProviderConfigError";
  }
}

/**
 * `maxOutputTokens` for a configuration. Always returns a number —
 * never lets the provider pick its own default (spike T2).
 */
export function resolveMaxOutputTokens(config: Pick<ProviderRow, "maxOutputTokens" | "preset">): number {
  if (typeof config.maxOutputTokens === "number" && config.maxOutputTokens > 0) return config.maxOutputTokens;
  const fromPreset = getPreset(config.preset)?.defaultMaxOutputTokens;
  return fromPreset ?? DEFAULT_MAX_OUTPUT_TOKENS;
}

/** Builds an AI SDK model instance from a single provider row.
 *  Throws ProviderConfigError with a user-readable message. */
/**
 * Identitas kita ke endpoint, dan header yang diminta gateway tertentu.
 *
 * Ditemukan dari laporan user: endpoint OpenCode Zen ("Go") menolak permintaan
 * dengan "Request is missing x-opencode-session and cannot be routed efficiently".
 * Dokumentasi mereka memang meminta dua hal dari klien non-OpenCode: **session id
 * yang stabil per percakapan** di `x-opencode-session`, dan **user agent sendiri**,
 * bukan nama SDK umum. Keduanya kita kirim sekarang, karena itu syarat resmi
 * pemakaian sebagai klien pihak ketiga — bukan akal-akalan.
 *
 * UA dikirim ke semua endpoint (mengidentifikasi diri itu sopan dan membantu
 * penyedia menelusuri masalah); header sesi hanya ke host yang memintanya, supaya
 * kita tidak mengirim header asing ke endpoint yang tidak mengharapkannya.
 */
const APP_USER_AGENT = `onesist/${process.env.SA_APP_VERSION?.trim() || "0.1"}`;

/**
 * Fetch yang memasang identitas kita, dan header sesi bila endpoint memintanya.
 *
 * Kenapa lewat `fetch` dan bukan opsi `headers` provider: sudah diuji langsung ke
 * wire (endpoint lokal yang mencatat header yang diterima) bahwa `headers` kustom
 * memang terkirim, tetapi **`user-agent` ditimpa SDK** dengan miliknya
 * (`ai/7.0.102 ai-sdk/provider-utils/…`). Dokumentasi gateway OpenCode meminta
 * klien pihak ketiga mengidentifikasi diri dengan user agent sendiri, jadi satu-
 * satunya tempat yang bisa memastikan itu adalah sebelum permintaan keluar.
 */
export function identityHeaders(endpoint: string, sessionId: string | undefined, overrides: Record<string, string> = {}): Record<string, string> {
  const identity: Record<string, string> = {
    "user-agent": APP_USER_AGENT,
    ...sessionHeaderFor(endpoint, sessionId),
  };
  for (const [name, value] of Object.entries(overrides)) identity[name.toLowerCase()] = value;
  return identity;
}

function identityFetch(opts: { endpoint: string; sessionId?: string; overrides: Record<string, string> }): typeof fetch {
  // Nilai yang kita kirim, dan yang menang kalau USER mengisinya sendiri di
  // header kustom. SDK sudah menaruh `user-agent` bawaannya di init.headers, jadi
  // "sudah ada" BUKAN alasan untuk tidak menimpanya — itu justru yang membuat
  // identitas aplikasi tidak pernah terkirim (terukur di wire).
  const identity = identityHeaders(opts.endpoint, opts.sessionId, opts.overrides);
  return (async (input: any, init: any) => {
    const headers = new Headers(init?.headers ?? undefined);
    for (const [name, value] of Object.entries(identity)) headers.set(name, value);
    return fetch(input, { ...init, headers });
  }) as typeof fetch;
}

function sessionHeaderFor(endpoint: string, sessionId: string | undefined): Record<string, string> {
  try {
    const host = new URL(endpoint).hostname;
    if (/(^|\.)opencode\.ai$/i.test(host)) {
      // Stabil per percakapan: id thread. Kalau tidak ada (mis. uji koneksi
      // sebelum thread dibuat), pakai satu id tetap per proses.
      return { "x-opencode-session": sessionId?.trim() || "onesist-standalone" };
    }
  } catch {
    /* endpoint belum bisa diparse — jangan menambah header apa pun */
  }
  return {};
}

export function buildLanguageModel(config: ProviderRow, opts: { sessionId?: string } = {}): LanguageModel {
  const model = config.model?.trim();
  if (!model) throw new ProviderConfigError("Model belum diisi pada konfigurasi provider ini.");

  const endpoint = config.endpoint?.trim();
  if (config.apiStyle !== "cli" && !endpoint) {
    throw new ProviderConfigError("Endpoint belum diisi pada konfigurasi provider ini.");
  }

  // Urutan penting: header yang diminta provider TIDAK menimpa header kustom user
  // (kalau user mau menimpanya sendiri, itu haknya).
  const headers = { "user-agent": APP_USER_AGENT, ...sessionHeaderFor(endpoint ?? "", opts.sessionId), ...authHeaders(config), ...customHeadersOf(config) };

  if (config.apiStyle === "cli") {
    throw new ProviderConfigError(
      "Provider bergaya CLI tidak memakai AI SDK — jalankan lewat adapter agent-runner.",
      "cli",
    );
  }

  if (config.apiStyle === "anthropic-messages") {
    const provider = createAnthropic({
      // Anthropic distinguishes credentials via headers: apiKey → x-api-key,
      // authToken → Authorization: Bearer.
      ...(config.authMethod === "api-key"
        ? { apiKey: config.apiKey?.trim() || undefined }
        : { authToken: config.apiKey?.trim() || undefined }),
      baseURL: endpoint,
      headers,
      fetch: identityFetch({ endpoint: endpoint ?? "", sessionId: opts.sessionId, overrides: customHeadersOf(config) }),
    });
    return provider(model);
  }

  if (config.apiStyle === "responses") {
    const provider = createOpenAI({
      apiKey: config.apiKey?.trim() || undefined,
      baseURL: endpoint,
      // `headers`, bukan hanya header kustom user: di sinilah user agent aplikasi
      // dan header sesi gateway ikut terkirim. Versi sebelumnya menyusun `headers`
      // lalu tidak memakainya di cabang ini — itulah sebabnya error
      // `x-opencode-session` masih muncul walau headernya "sudah" ditambahkan.
      headers,
      fetch: identityFetch({ endpoint: endpoint ?? "", sessionId: opts.sessionId, overrides: customHeadersOf(config) }),
    });
    return provider.responses(model);
  }

  // completions (default). includeUsage is MANDATORY (spike R1).
  const provider = createOpenAICompatible({
    name: config.preset || "onesist",
    // For authMethod "api-key" credentials go via the headers above,
    // because createOpenAICompatible only knows the Bearer scheme.
    apiKey: config.authMethod === "bearer" ? config.apiKey?.trim() || undefined : undefined,
    baseURL: endpoint!,
    headers: Object.keys(headers).length ? headers : undefined,
    fetch: identityFetch({ endpoint: endpoint!, sessionId: opts.sessionId, overrides: customHeadersOf(config) }),
    includeUsage: true,
  });
  return provider(model);
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration eligibility & fingerprint (FR-L3, FR-L5)
// ─────────────────────────────────────────────────────────────────────────────

/** Is this configuration eligible for the model picker? (FR-L3)
 *
 *  The rules: endpoint and model must be filled in. API key is NOT required, because
 *  local endpoints (Ollama, LM Studio, vLLM) are valid without credentials — and demanding
 *  a key there would make local models unusable. What matters is that
 *  half-finished configurations (no endpoint or no model) don't show up in the
 *  picker, since they are guaranteed to fail when used.
 *
 *  CLI providers are excluded entirely: their credentials and model are handled by the CLI
 *  runtime itself. */
export function isProviderUsable(config: Pick<ProviderRow, "apiStyle" | "endpoint" | "model">): boolean {
  if (config.apiStyle === "cli") return true;
  return !!config.endpoint?.trim() && !!config.model?.trim();
}

/**
 * Configuration fingerprint. Used so a "Test connection" result expires as soon as any
 * field changes — comparing ids alone is not enough (FR-L5).
 *
 * The API key is HASHED, never included raw. This value is sent to the UI, and
 * putting the raw key in it would be the same as leaking it through a field
 * that should only mark "this configuration has changed" (FR-A8).
 * The hash is enough to detect changes.
 */
export function configFingerprint(config: Partial<ProviderRow>): string {
  const key = config.apiKey?.trim();
  return JSON.stringify([
    config.apiStyle,
    config.endpoint,
    key ? createHash("sha256").update(key).digest("hex").slice(0, 12) : null,
    config.authMethod,
    config.model,
    config.customHeadersJson,
    config.proxyUrl,
    config.skipTlsVerify,
  ]);
}

/** A test result only applies to the exact same configuration. */
export function isTestResultCurrent(row: ProviderRow): boolean {
  return !!row.lastTestedAt && row.lastTestOk !== null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test connection (FR-A5)
// ─────────────────────────────────────────────────────────────────────────────

export async function testConnection(config: ProviderRow): Promise<TestConnectionResult> {
  if (config.apiStyle === "cli") {
    return { success: false, message: "Provider CLI diuji dengan mendeteksi binary-nya, bukan lewat HTTP.", errorCategory: "cli" };
  }
  const started = Date.now();
  try {
    const model = buildLanguageModel(config);
    // Non-streaming: failures here are genuinely thrown, unlike
    // the streaming path where errors arrive as parts (spike R6).
    await generateText({
      model,
      prompt: "ping",
      maxOutputTokens: 16,
    } as any);
    return {
      success: true,
      message: "Berhasil terhubung.",
      latencyMs: Date.now() - started,
      modelUsed: config.model ?? undefined,
    };
  } catch (err) {
    const { category, status } = classifyError(err);
    const raw = redactSecrets(err, config.apiKey);
    return {
      success: false,
      message: status ? `HTTP ${status} — ${raw}` : raw,
      latencyMs: Date.now() - started,
      modelUsed: config.model ?? undefined,
      errorCategory: category,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Model discovery (FR-A6, FR-L4)
// ─────────────────────────────────────────────────────────────────────────────

/** User-entered models. Always available regardless of discovery results —
 *  many OpenAI-compatible providers don't offer GET /models (FR-L4). */
export function savedModels(config: Pick<ProviderRow, "model" | "modelsJson">): ModelInfo[] {
  const out: ModelInfo[] = [];
  const primary = config.model?.trim();
  if (primary) out.push({ id: primary, saved: true });
  if (config.modelsJson) {
    try {
      const list = JSON.parse(config.modelsJson);
      if (Array.isArray(list)) {
        for (const m of list) {
          const id = typeof m === "string" ? m : m?.id ?? m?.name;
          if (typeof id === "string" && id.trim() && !out.some((o) => o.id === id.trim())) {
            out.push({ id: id.trim(), displayName: m?.label ?? m?.displayName, saved: true });
          }
        }
      }
    } catch {
      /* corrupt modelsJson — ignore it, the primary model is still used */
    }
  }
  return out;
}

/** Merges saved models with discovery results. Discovery results do NOT
 *  overwrite user-entered models (FR-L4). */
export function mergeModels(
  saved: ModelInfo[],
  discovered: ModelInfo[],
): ModelInfo[] {
  const map = new Map<string, ModelInfo>();
  for (const m of [...saved, ...discovered]) {
    const id = m.id.trim();
    if (!id) continue;
    const prev = map.get(id);
    map.set(id, {
      id,
      displayName: prev?.displayName ?? m.displayName,
      saved: prev?.saved ?? m.saved,
      effortCapability: m.effortCapability ?? prev?.effortCapability,
    });
  }
  return [...map.values()];
}

export interface DiscoverModelsResult {
  models: ModelInfo[];
  /** false when the provider offers no model-listing endpoint. That's normal,
   *  not a failure — the UI must still show the saved models (FR-L4). */
  supported: boolean;
  message?: string;
}

export async function discoverModels(config: ProviderRow): Promise<DiscoverModelsResult> {
  const saved = savedModels(config);
  const endpoint = config.endpoint?.trim().replace(/\/+$/, "");
  if (config.apiStyle === "cli") return { models: saved, supported: false, message: "Provider CLI tidak menyediakan daftar model." };
  if (!endpoint) return { models: saved, supported: false, message: "Endpoint belum diisi." };

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...authHeaders(config),
    ...customHeadersOf(config),
  };
  if (config.apiStyle === "anthropic-messages") headers["anthropic-version"] = "2023-06-01";

  try {
    const res = await fetch(`${endpoint}/models`, { headers, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      return {
        models: saved,
        supported: false,
        message: `Provider tidak menyediakan daftar model (HTTP ${res.status}). Tambahkan model secara manual.`,
      };
    }
    const body: any = await res.json();
    const list = Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : [];
    const discovered: ModelInfo[] = list
      .map((m: any) => ({
        id: String(m?.id ?? m?.name ?? "").trim(),
        displayName: m?.display_name ?? m?.displayName ?? undefined,
      }))
      .filter((m: ModelInfo) => m.id);
    return {
      models: mergeModels(saved, discovered),
      supported: true,
      message: discovered.length ? undefined : "Provider membalas tanpa daftar model.",
    };
  } catch (err) {
    return {
      models: saved,
      supported: false,
      message: `Gagal mengambil daftar model: ${redactSecrets(err, config.apiKey)}`,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration name validation (FR-L2)
// ─────────────────────────────────────────────────────────────────────────────

export type ConfigNameValidation = "empty" | "duplicate" | "valid";

export function validateConfigName(
  name: string,
  existing: { id: string; name: string }[],
  excludeId?: string,
): ConfigNameValidation {
  if (!name.trim()) return "empty";
  const lower = name.trim().toLowerCase();
  if (existing.some((c) => c.id !== excludeId && c.name.trim().toLowerCase() === lower)) return "duplicate";
  return "valid";
}

// ─────────────────────────────────────────────────────────────────────────────
// DB access & environment-bootstrapped provider (FR-A17)
// ─────────────────────────────────────────────────────────────────────────────

export function listProviders(): ProviderRow[] {
  const rows = db.select().from(llmProviders).all() as ProviderRow[];
  // Sort following preset order, while preserving creation order
  // among providers sharing a preset (FR-L11).
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => presetRank(a.r.preset) - presetRank(b.r.preset) || a.i - b.i)
    .map((x) => x.r);
}

export function getProvider(id: string): ProviderRow | undefined {
  return db.select().from(llmProviders).where(eq(llmProviders.id, id)).get() as ProviderRow | undefined;
}

export function getDefaultProvider(): ProviderRow | undefined {
  const all = listProviders();
  return all.find((p) => p.isDefault) ?? all[0];
}

/** Synthetic ID for environment-sourced providers. Deliberately not a DB
 *  row id so it can never be confused with a user configuration. */
export const ENV_PROVIDER_ID = "env-bootstrap";

/**
 * Provider from the environment (FR-A17) — **opt-in, off by default**.
 *
 * Sebelumnya provider ini selalu aktif sebagai cadangan, dan itu melahirkan kelas
 * masalah yang nyata: aplikasi memakai endpoint yang tidak pernah dikonfigurasi
 * user, sementara di permukaan pengaturan endpoint itu tidak muncul sebagai
 * pilihan user. Akibatnya user bisa menghabiskan waktu men-debug endpoint yang
 * bahkan tidak ia kenal — persis bagaimana error "Request is missing
 * x-opencode-session" sampai ke layar padahal tidak ada yang mengisi endpoint itu
 * di aplikasi.
 *
 * Aplikasi ini BYOK: provider yang dipakai harus yang user isi sendiri. Dev, CI,
 * dan suite verifikasi tetap butuh jalur cepat ini, jadi mereka mengaktifkannya
 * secara eksplisit lewat `SA_ALLOW_ENV_PROVIDER=1` — pernyataan yang sengaja,
 * bukan efek samping environment yang kebetulan terisi.
 */
export function envBootstrapProvider(): ProviderRow | null {
  if (process.env.SA_ALLOW_ENV_PROVIDER !== "1") return null;
  const endpoint = process.env.BASE_URL_LLM?.trim();
  const model = process.env.MODEL_NAME_LLM?.trim();
  const apiKey = process.env.API_KEY_LLM?.trim();
  if (!endpoint || !model) return null;

  const now = new Date().toISOString();
  return {
    // Harga tidak diisi: provider env adalah jalur uji, dan menebak harganya
    // akan menghasilkan angka biaya yang salah. UI menampilkan token saja.
    inputPricePerMTok: null,
    outputPricePerMTok: null,
    id: ENV_PROVIDER_ID,
    name: "Environment (BASE_URL_LLM)",
    preset: "custom-openai",
    apiStyle: "completions",
    endpoint,
    apiKey: apiKey ?? null,
    authMethod: apiKey ? "bearer" : "none",
    model,
    modelsJson: null,
    customHeadersJson: null,
    proxyUrl: null,
    skipTlsVerify: false,
    enableThinking: false,
    effortCapabilityJson: null,
    maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    contextWindow: null,
    cliAgent: null,
    cliPath: null,
    cliEnvJson: null,
    isDefault: false,
    lastTestOk: null,
    lastTestedAt: null,
    lastTestLatencyMs: null,
    lastTestErrorCategory: null,
    source: "env",
    createdAt: now,
    updatedAt: now,
  };
}

/** The provider used for a thread: from the DB when present, otherwise
 *  falls back to the environment bootstrap. */
export function resolveProvider(providerId?: string | null): ProviderRow | null {
  if (providerId && providerId !== ENV_PROVIDER_ID) {
    const row = getProvider(providerId);
    if (row) return row;
  }
  if (providerId === ENV_PROVIDER_ID) return envBootstrapProvider();
  return getDefaultProvider() ?? envBootstrapProvider();
}
