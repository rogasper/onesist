/**
 * OpenCode as a chat runtime: whether it can be used right now, its models with their
 * variants as a model option, and one turn. The model list is cached per server for a
 * minute — the picker and the option lookups ask often, OpenCode answers the same.
 */
import fs from "node:fs";
import { resolveExecutable } from "~/lib/agent-cli";
import type { ModelOptionDescriptor, RuntimeStatus } from "~/lib/runtime-types";
import type { ProviderRow } from "~/server/agent/config";
import type { CliRuntime, CliTurnInput, RuntimeModel } from "~/server/agent/runtime/types";
import type { PermissionMode, ThreadMode } from "~/server/agent/types";
import { ocInfo, ocListModels, type OcModel, type OpenCodeConnection } from "./client";
import { getOpenCodeConnection } from "./server";
import { openCodeTargetOf } from "./target";
import { startOpenCodeTurn } from "./turn";

const MODELS_TTL_MS = 60_000;
const PROBE_TIMEOUT_MS = 5_000;

const cache: Map<string, { at: number; models: RuntimeModel[] }> = ((globalThis as any).__onesistOpenCodeModels ??= new Map());

/** Labels for OpenCode's usual variant ids; any other id is shown as it is. */
const VARIANT_LABELS: Record<string, string> = {
  none: "Tanpa berpikir",
  minimal: "Minimal",
  low: "Rendah",
  medium: "Sedang",
  high: "Tinggi",
  xhigh: "Sangat tinggi",
  max: "Maksimal",
};

export function variantDescriptor(variants: string[]): ModelOptionDescriptor | null {
  if (!variants.length) return null;
  return {
    id: "variant",
    label: "Tingkat berpikir",
    type: "select",
    choices: variants.map((v) => ({ value: v, label: VARIANT_LABELS[v] ?? v })),
  };
}

function toRuntimeModel(m: OcModel): RuntimeModel {
  const variant = variantDescriptor(m.variants);
  return { id: `${m.providerID}/${m.id}`, name: m.name, options: variant ? [variant] : [], contextWindow: m.contextWindow };
}

/** For tests: start from an empty model cache. */
export function forgetOpenCodeModels(): void {
  cache.clear();
}

async function fetchModels(conn: OpenCodeConnection, signal?: AbortSignal): Promise<RuntimeModel[]> {
  const models = (await ocListModels(conn, signal)).map(toRuntimeModel);
  cache.set(conn.baseUrl, { at: Date.now(), models });
  return models;
}

function binaryExists(binary: string): boolean {
  if (binary.includes("/") || binary.includes("\\")) return fs.existsSync(binary);
  return resolveExecutable(binary) !== null;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export const opencodeRuntime: CliRuntime = {
  id: "opencode",
  capabilities: { reasoningEffort: false, modelOptions: true },

  async listModels(provider: ProviderRow, opts: { force?: boolean } = {}): Promise<RuntimeModel[]> {
    const conn = await getOpenCodeConnection(openCodeTargetOf(provider));
    const hit = cache.get(conn.baseUrl);
    if (!opts.force && hit && Date.now() - hit.at < MODELS_TTL_MS) return hit.models;
    return fetchModels(conn);
  },

  async probe(provider: ProviderRow): Promise<RuntimeStatus> {
    const target = openCodeTargetOf(provider);
    const attached = !!(target.serverUrl || process.env.SA_OPENCODE_URL?.trim());
    if (!attached && !binaryExists(target.binary)) {
      return {
        state: "not_installed",
        version: null,
        message: `OpenCode tidak ditemukan ("${target.binary}"). Pasang OpenCode atau isi path binary-nya di pengaturan provider.`,
      };
    }
    try {
      const conn = await getOpenCodeConnection(target);
      const signal = AbortSignal.timeout(PROBE_TIMEOUT_MS);
      const info = await ocInfo(conn, signal);
      const models = await fetchModels(conn, signal);
      if (!models.length) {
        return {
          state: "not_ready",
          version: info.version,
          message: `OpenCode ${info.version} berjalan, tapi belum ada model. Login dulu lewat terminal dengan "opencode auth", lalu cek lagi.`,
        };
      }
      return { state: "ready", version: info.version, message: `OpenCode ${info.version} · ${models.length} model.` };
    } catch (err) {
      return { state: "error", version: null, message: `Tidak bisa menghubungi OpenCode: ${messageOf(err)}` };
    }
  },

  startTurn(input: CliTurnInput) {
    const { thread, provider } = input;
    return startOpenCodeTurn({
      runId: input.runId,
      threadId: thread.id,
      projectId: thread.projectId,
      root: input.root,
      ...openCodeTargetOf(provider),
      permissionMode: thread.permissionMode as PermissionMode,
      threadMode: thread.mode as ThreadMode,
      model: thread.model ?? provider.model ?? null,
      variant: input.modelOptions.variant ?? null,
      text: input.text,
      title: thread.title,
      cliSessionId: input.sessionId,
      onSessionCreated: input.onSessionCreated,
      mcp: input.mcp,
    });
  },
};
