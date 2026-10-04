import type { ProviderPreset } from "./types";

/**
 * Provider presets (FR-L1 / FR-A4).
 *
 * Every `endpoint` carries its API version (`/v1`) because AI SDK only appends
 * its final segment to baseURL — `createOpenAICompatible` → `/chat/completions`,
 * `createAnthropic` → `/messages` (spike T4). Without the API version here,
 * requests would go to the wrong URL.
 *
 * The URLs below are STARTING values the user can override. Third-party endpoints
 * change over time and many have regional or
 * self-hosted variants — which is why they're all pre-filled yet still editable,
 * not locked.
 */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  // ── Major providers ────────────────────────────────────────────────────
  {
    id: "openai",
    label: "OpenAI",
    apiStyle: "completions",
    authMethod: "bearer",
    endpoint: "https://api.openai.com/v1",
    defaultModel: "gpt-4o",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    apiStyle: "anthropic-messages",
    authMethod: "api-key",
    endpoint: "https://api.anthropic.com/v1",
    defaultModel: "claude-sonnet-4-5",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
    hint: "Memakai header x-api-key, bukan Authorization.",
  },
  {
    id: "gemini",
    label: "Google Gemini (OpenAI-compatible)",
    apiStyle: "completions",
    authMethod: "bearer",
    endpoint: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
  },

  // ── Popular OpenAI-compatible endpoints ────────────────────────────────
  {
    id: "deepseek",
    label: "DeepSeek",
    apiStyle: "completions",
    authMethod: "bearer",
    endpoint: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
  },
  {
    id: "kimi",
    label: "Kimi / Moonshot",
    apiStyle: "completions",
    authMethod: "bearer",
    endpoint: "https://api.moonshot.cn/v1",
    defaultModel: "moonshot-v1-32k",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
  },
  {
    id: "qwen",
    label: "Qwen / DashScope",
    apiStyle: "completions",
    authMethod: "bearer",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
  },
  {
    id: "zhipu",
    label: "Zhipu GLM",
    apiStyle: "completions",
    authMethod: "bearer",
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
    defaultModel: "glm-4-plus",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
  },
  {
    id: "minimax",
    label: "MiniMax",
    apiStyle: "completions",
    authMethod: "bearer",
    endpoint: "https://api.minimax.chat/v1",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
  },
  {
    id: "groq",
    label: "Groq",
    apiStyle: "completions",
    authMethod: "bearer",
    endpoint: "https://api.groq.com/openai/v1",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
  },
  {
    id: "mistral",
    label: "Mistral",
    apiStyle: "completions",
    authMethod: "bearer",
    endpoint: "https://api.mistral.ai/v1",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    apiStyle: "completions",
    authMethod: "bearer",
    endpoint: "https://api.x.ai/v1",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    apiStyle: "completions",
    authMethod: "bearer",
    endpoint: "https://openrouter.ai/api/v1",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
    hint: "Satu key untuk banyak model dari banyak vendor.",
  },

  // ── Local ──────────────────────────────────────────────────────────────
  {
    id: "ollama",
    label: "Ollama (lokal)",
    apiStyle: "completions",
    authMethod: "none",
    endpoint: "http://127.0.0.1:11434/v1",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: false,
    hint: "Tidak perlu API key. Pastikan Ollama sedang berjalan.",
  },
  {
    id: "lmstudio",
    label: "LM Studio (lokal)",
    apiStyle: "completions",
    authMethod: "none",
    endpoint: "http://127.0.0.1:1234/v1",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: false,
    hint: "Tidak perlu API key. Aktifkan server lokal di LM Studio.",
  },
  {
    id: "vllm",
    label: "vLLM / llama.cpp (lokal)",
    apiStyle: "completions",
    authMethod: "none",
    endpoint: "http://127.0.0.1:8000/v1",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: false,
  },

  // ── Custom ─────────────────────────────────────────────────────────────────
  {
    id: "custom-openai",
    label: "OpenAI-compatible (custom)",
    apiStyle: "completions",
    authMethod: "bearer",
    endpoint: "",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
    hint: "Untuk proxy, gateway, atau endpoint internal. Isi base URL termasuk /v1.",
  },
  {
    id: "custom-anthropic",
    label: "Anthropic-compatible (custom)",
    apiStyle: "anthropic-messages",
    authMethod: "api-key",
    endpoint: "",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
  },
  {
    id: "custom-responses",
    label: "OpenAI Responses API",
    apiStyle: "responses",
    authMethod: "bearer",
    endpoint: "https://api.openai.com/v1",
    defaultMaxOutputTokens: 8192,
    requiresApiKey: true,
    hint: "Gaya /responses, bukan /chat/completions.",
  },

  // ── CLI agents (apiStyle = "cli") ───────────────────────────────────────
  // Credentials are handled by the CLI runtime itself, so no API key is needed here
  // (FR-L3). Per-CLI path+env are in FR-A13.
  {
    id: "cli-opencode",
    label: "opencode (CLI)",
    apiStyle: "cli",
    authMethod: "none",
    endpoint: "",
    cliAgent: "opencode",
    requiresApiKey: false,
    hint: "Memakai autentikasi opencode yang sudah ada di mesin ini.",
  },
  {
    id: "cli-claude",
    label: "Claude Code (CLI)",
    apiStyle: "cli",
    authMethod: "none",
    endpoint: "",
    cliAgent: "claude",
    requiresApiKey: false,
  },
  {
    id: "cli-codex",
    label: "Codex (CLI)",
    apiStyle: "cli",
    authMethod: "none",
    endpoint: "",
    cliAgent: "codex",
    requiresApiKey: false,
  },
  {
    id: "cli-antigravity",
    label: "Antigravity (CLI)",
    apiStyle: "cli",
    authMethod: "none",
    endpoint: "",
    cliAgent: "antigravity",
    requiresApiKey: false,
  },
  {
    id: "cli-pi",
    label: "Pi (CLI)",
    apiStyle: "cli",
    authMethod: "none",
    endpoint: "",
    cliAgent: "pi",
    requiresApiKey: false,
  },
];

const BY_ID = new Map(PROVIDER_PRESETS.map((p) => [p.id, p]));

export function getPreset(id: string | null | undefined): ProviderPreset | undefined {
  return id ? BY_ID.get(id) : undefined;
}

/** Display order follows the array order above (FR-L11) — so the
 *  configuration list doesn't jump around as entries are added. */
export function presetRank(id: string): number {
  const i = PROVIDER_PRESETS.findIndex((p) => p.id === id);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
}

/** CLI providers need no API key because the runtime handles it itself. */
export function presetRequiresApiKey(id: string): boolean {
  return getPreset(id)?.requiresApiKey ?? true;
}
