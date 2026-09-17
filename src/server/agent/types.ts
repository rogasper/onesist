/**
 * Onesist's own domain types for the agent runtime.
 *
 * Deliberately does NOT import types from `ai` — so naming changes in the AI SDK
 * (which have happened several times: `maxSteps` → `stopWhen`, `needsApproval` →
 * `toolApproval`) only touch `ai.ts` and `config.ts`, not the whole app.
 * Full rules in PRD FR-A11 / ADR-001 D6.2.
 */

/** HTTP protocol style toward the provider. */
export type ApiStyle = "completions" | "responses" | "anthropic-messages" | "cli";

/** How credentials are sent. `api-key` is used by Anthropic (header `x-api-key`). */
export type AuthMethod = "bearer" | "api-key" | "none";

/** How far the agent may act without asking (FR-E1). */
/**
 * Seberapa jauh agent boleh bertindak (FR-E1), plus satu derajat tambahan dari
 * FR-M7:
 *   ask      — setiap penulisan menunggu persetujuan
 *   auto     — boleh menulis, kecuali path terproteksi
 *   no-shell — boleh menulis berkas, TAPI tool `bash` tidak dipasang sama sekali
 *   readonly — hanya membaca (tanpa tool tulis, dan tanpa shell)
 *
 * `no-shell` ada karena tanpa itu pilihannya biner: `readonly` sudah berarti
 * "tanpa shell" sejak awal, jadi user yang ingin agent menulis artefak tetapi
 * tidak ingin memberinya shell tidak punya pilihan.
 */
export type PermissionMode = "ask" | "auto" | "no-shell" | "readonly";

/** Shell hanya tersedia di mode yang mengizinkannya (FR-M7). */
export function shellAllowed(mode: PermissionMode): boolean {
  return mode === "ask" || mode === "auto";
}

/** Tool yang mengubah state dipasang kecuali di mode baca-saja. */
export function mutatingAllowed(mode: PermissionMode): boolean {
  return mode !== "readonly";
}

/**
 * Conversation mode.
 *   ask  — jawab dengan teks (tool baca tetap ada)
 *   plan — Fase 5.1: sama-sama tanpa tool yang mengubah state, tetapi hasilnya
 *          diarahkan menjadi RENCANA yang bisa disetujui user; persetujuan itu
 *          yang mengubah thread ke `agent` dan menjalankannya
 *   agent — boleh memakai tool dan mengubah berkas (dengan izin)
 */
export type ThreadMode = "ask" | "agent" | "plan";

/** Mode yang tidak boleh mengubah apa pun (plan mode termasuk). Shell juga
 *  tidak dipasang di sini: `bash` bisa menulis berkas, dan rencana yang menulis
 *  berkas bukan rencana. */
export function isReadOnlyMode(mode: ThreadMode): boolean {
  return mode !== "agent";
}

/**
 * Which tool families a turn installs.
 *
 * One decision instead of two expressions inside `startTurn`, because plan mode's
 * guarantee — "cannot write anything" (FR-B18) — must be assertable on its own:
 * the suite checks both this policy and the tool set that follows from it.
 */
export function toolPolicyFor(mode: ThreadMode, permissionMode: PermissionMode): { includeMutating: boolean; includeShell: boolean } {
  return {
    includeMutating: mode === "agent" && mutatingAllowed(permissionMode),
    // bash can write files, so it follows the same rule as the write tools.
    includeShell: mode === "agent" && shellAllowed(permissionMode),
  };
}

export type RunStatus = "running" | "done" | "error" | "stopped" | "interrupted";

export type FileOp = "create" | "update" | "delete" | "rename";

/** Where a file change comes from (FR-C5). */
export type ChangeSource = "tool" | "bash" | "external";

/**
 * The effort/reasoning control shapes a model supports, plus where that
 * information comes from. Adopted from dbx's `AiEffortCapability` (FR-A12):
 * instead of a rigid `reasoning_level` column, the provider declares its shape
 * so the UI can adapt the picker and never stores an invalid choice.
 */
export type EffortCapabilitySource = "providerApi" | "localCli" | "officialRegistry" | "custom";

export type EffortCapability =
  | { kind: "enum"; options: { id: string; label: string; value: string }[]; source: EffortCapabilitySource }
  | { kind: "integer"; min: number; max: number; step: number; source: EffortCapabilitySource }
  | { kind: "boolean"; source: EffortCapabilitySource }
  | { kind: "freeText"; placeholder?: string; source: EffortCapabilitySource }
  | { kind: "unsupported" };

/** One selectable model. `saved` = user-entered, not a discovery result. */
export interface ModelInfo {
  id: string;
  displayName?: string;
  saved?: boolean;
  effortCapability?: EffortCapability;
}

/** "Test connection" result (FR-A5). Deliberately richer than a boolean —
 *  the user needs to tell apart a wrong key, a wrong endpoint, a missing model, and
 *  network trouble. */
export interface TestConnectionResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  modelUsed?: string;
  /** Example: "auth" | "endpoint" | "model" | "network" | "unknown". */
  errorCategory?: string;
}

/** Provider preset: pre-fills endpoint + auth + apiStyle so adding a provider
 *  doesn't start from an empty form (FR-L1). Every value may be overridden by the user. */
export interface ProviderPreset {
  id: string;
  label: string;
  apiStyle: ApiStyle;
  authMethod: AuthMethod;
  /** FULL base URL including the API version. AI SDK only appends its
   *  final segment itself, so `/v1` must be present here (spike T4). */
  endpoint: string;
  /** CLI provider: name of the agent recognized by `agent-cli.ts`. */
  cliAgent?: string;
  /** Suggested model; a suggestion only, not a restriction. */
  defaultModel?: string;
  /** Estimated output budget. MUST have a value when used (spike T2). */
  defaultMaxOutputTokens?: number;
  /** Whether an API key is required. CLI agents handle their own credentials. */
  requiresApiKey: boolean;
  /** Short note shown in the UI (e.g. for Ollama/LM Studio). */
  hint?: string;
}

/** Agent step limit, following the dbx `maxAgentTurns` convention (FR-L7). */
export const MAX_STEPS_DEFAULT = 30;
export const MAX_STEPS_MIN = 5;
export const MAX_STEPS_MAX = 500;

export function normalizeMaxSteps(value: number | null | undefined): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : MAX_STEPS_DEFAULT;
  return Math.min(MAX_STEPS_MAX, Math.max(MAX_STEPS_MIN, n));
}

export function maxStepsOutOfRange(value: number | null | undefined): boolean {
  return typeof value === "number" && (value < MAX_STEPS_MIN || value > MAX_STEPS_MAX);
}

/** Default output budget when a provider specifies none. Used as the last-resort
 *  safety net — `config.ts` always sends an explicit value (spike T2). */
export const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

/** Directories the agent may not modify without explicit confirmation (FR-E3),
 *  regardless of permission mode. Patterns are matched against the project-root-relative path. */
export const PROTECTED_PATH_PATTERNS: RegExp[] = [
  /^input\//,
  /^MASTER_.*\.md$/i,
  /^\.git\//,
  /^\.agents\/skills\//,
  /^\.agents\/agents\//,
];

export function isProtectedPath(relPath: string): boolean {
  const p = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  return PROTECTED_PATH_PATTERNS.some((re) => re.test(p));
}
