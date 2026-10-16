/**
 * Antigravity (`agy`) as a chat runtime: whether it can be used right now (installed, and
 * logged in, which `agy models` answers), its models, and one turn. The model list is cached
 * per binary for a minute: the picker asks often and agy fetches it over the network.
 */
import { execFile } from "node:child_process";
import fs from "node:fs";
import { resolveExecutable } from "~/lib/agent-cli";
import type { RuntimeStatus } from "~/lib/runtime-types";
import type { ProviderRow } from "~/server/agent/config";
import type { CliRuntime, CliTurnInput, RuntimeModel } from "~/server/agent/runtime/types";
import type { PermissionMode, ThreadMode } from "~/server/agent/types";
import { agyPolicy } from "./args";
import { startAgyTurn } from "./turn";

const MODELS_TTL_MS = 60_000;
const VERSION_TIMEOUT_MS = 5_000;
const MODELS_TIMEOUT_MS = 20_000;

const cache: Map<string, { at: number; models: RuntimeModel[] }> = ((globalThis as any).__onesistAgyModels ??= new Map());

export function forgetAgyModels(): void {
  cache.clear();
}

export function agyBinary(provider: Pick<ProviderRow, "cliPath">): string {
  return provider.cliPath?.trim() || "agy";
}

/** `agy models`: a "Fetching…" line, then `<id>\t<label>` per model. */
export function parseAgyModels(stdout: string): RuntimeModel[] {
  const models: RuntimeModel[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^fetching\b/i.test(line)) continue;
    const [id, ...rest] = line.split(/\t|\s{2,}/);
    if (!id || /\s/.test(id)) continue;
    models.push({ id, name: rest.join(" ").trim() || id, options: [], contextWindow: null });
  }
  return models;
}

function runAgy(binary: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(binary, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout ?? ""), stderr: String(stderr ?? err?.message ?? "") });
    });
  });
}

function binaryExists(binary: string): boolean {
  if (binary.includes("/") || binary.includes("\\")) return fs.existsSync(binary);
  return resolveExecutable(binary) !== null;
}

async function fetchModels(binary: string): Promise<RuntimeModel[]> {
  const res = await runAgy(binary, ["models"], MODELS_TIMEOUT_MS);
  if (!res.ok) throw new Error(`agy models gagal: ${res.stderr.trim().split("\n").at(-1) ?? "tanpa keterangan"}`);
  const models = parseAgyModels(res.stdout);
  cache.set(binary, { at: Date.now(), models });
  return models;
}

export const antigravityRuntime: CliRuntime = {
  id: "antigravity",
  capabilities: { reasoningEffort: false, modelOptions: false },

  async listModels(provider: ProviderRow, opts: { force?: boolean } = {}): Promise<RuntimeModel[]> {
    const binary = agyBinary(provider);
    const hit = cache.get(binary);
    if (!opts.force && hit && Date.now() - hit.at < MODELS_TTL_MS) return hit.models;
    return fetchModels(binary);
  },

  async probe(provider: ProviderRow): Promise<RuntimeStatus> {
    const binary = agyBinary(provider);
    if (!binaryExists(binary)) {
      return {
        state: "not_installed",
        version: null,
        message: `Antigravity tidak ditemukan ("${binary}"). Pasang Antigravity CLI atau isi path binary-nya di pengaturan provider.`,
      };
    }
    const v = await runAgy(binary, ["--version"], VERSION_TIMEOUT_MS);
    const version = v.ok ? v.stdout.trim().split(/\s+/).at(-1) || null : null;
    try {
      const models = await fetchModels(binary);
      if (!models.length) {
        return {
          state: "not_ready",
          version,
          message: `Antigravity ${version ?? ""} terpasang, tapi belum ada model. Jalankan "agy" sekali di terminal untuk login, lalu cek lagi.`.replace("  ", " "),
        };
      }
      return { state: "ready", version, message: `Antigravity ${version ?? "?"} · ${models.length} model.` };
    } catch (err) {
      return { state: "error", version, message: err instanceof Error ? err.message : String(err) };
    }
  },

  startTurn(input: CliTurnInput) {
    const { thread, provider } = input;
    return startAgyTurn({
      runId: input.runId,
      threadId: thread.id,
      projectId: thread.projectId,
      root: input.root,
      binary: agyBinary(provider),
      model: thread.model ?? provider.model ?? null,
      policy: agyPolicy(thread.permissionMode as PermissionMode, thread.mode as ThreadMode),
      text: input.text,
      sessionId: input.sessionId,
      onSessionCreated: input.onSessionCreated,
    });
  },
};
