/**
 * Codex (`codex app-server`) as a chat runtime: whether it can be used right now (installed,
 * and logged in — `account/read` says so), its models from `model/list`, and one turn. The
 * model list is cached per binary for a minute.
 */
import fs from "node:fs";
import { resolveExecutable } from "~/lib/agent-cli";
import type { RuntimeStatus } from "~/lib/runtime-types";
import type { ProviderRow } from "~/server/agent/config";
import type { CliRuntime, CliTurnInput, RuntimeModel } from "~/server/agent/runtime/types";
import type { PermissionMode, ThreadMode } from "~/server/agent/types";
import { getCodexConnection } from "./server";
import { startCodexTurn } from "./turn";

const MODELS_TTL_MS = 60_000;
const cache: Map<string, { at: number; models: RuntimeModel[] }> = ((globalThis as any).__onesistCodexModels ??= new Map());

export function codexBinary(provider: Pick<ProviderRow, "cliPath">): string {
  return provider.cliPath?.trim() || "codex";
}

export function parseCodexModels(result: any): RuntimeModel[] {
  const list: any[] = Array.isArray(result?.data) ? result.data : [];
  return list
    .filter((m) => typeof m?.id === "string")
    .map((m) => ({ id: m.id, name: typeof m.displayName === "string" && m.displayName ? m.displayName : m.id, options: [], contextWindow: null }));
}

function binaryExists(binary: string): boolean {
  if (binary.includes("/") || binary.includes("\\")) return fs.existsSync(binary);
  return resolveExecutable(binary) !== null;
}

export const codexRuntime: CliRuntime = {
  id: "codex",
  capabilities: { reasoningEffort: false, modelOptions: false },

  async listModels(provider: ProviderRow, opts: { force?: boolean } = {}): Promise<RuntimeModel[]> {
    const binary = codexBinary(provider);
    const hit = cache.get(binary);
    if (!opts.force && hit && Date.now() - hit.at < MODELS_TTL_MS) return hit.models;
    const conn = await getCodexConnection(binary);
    const models = parseCodexModels(await conn.rpc.request("model/list", {}));
    cache.set(binary, { at: Date.now(), models });
    return models;
  },

  async probe(provider: ProviderRow): Promise<RuntimeStatus> {
    const binary = codexBinary(provider);
    if (!binaryExists(binary)) {
      return { state: "not_installed", version: null, message: `Codex tidak ditemukan ("${binary}"). Pasang Codex CLI atau isi path binary-nya di pengaturan provider.` };
    }
    try {
      const conn = await getCodexConnection(binary);
      const account: any = await conn.rpc.request("account/read", {});
      if (!account?.account) {
        return { state: "not_ready", version: null, message: 'Codex belum login. Jalankan "codex login" di terminal, lalu cek lagi.' };
      }
      const models = parseCodexModels(await conn.rpc.request("model/list", {}));
      return { state: "ready", version: null, message: `Codex siap · ${models.length} model.` };
    } catch (err) {
      return { state: "error", version: null, message: err instanceof Error ? err.message : String(err) };
    }
  },

  startTurn(input: CliTurnInput) {
    const { thread, provider } = input;
    return startCodexTurn({
      runId: input.runId,
      threadId: thread.id,
      projectId: thread.projectId,
      root: input.root,
      binary: codexBinary(provider),
      model: thread.model ?? provider.model ?? null,
      permissionMode: thread.permissionMode as PermissionMode,
      threadMode: thread.mode as ThreadMode,
      text: input.text,
      sessionId: input.sessionId,
      onSessionCreated: input.onSessionCreated,
    });
  },
};
