/**
 * Pi (`pi --mode rpc`) as a chat runtime: whether it can be used (installed, and it lists at
 * least one model — a model needs credentials), its models as provider/model ids, and one
 * turn. Listing models starts a short-lived process; the result is cached per binary for a minute.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveExecutable } from "~/lib/agent-cli";
import type { RuntimeStatus } from "~/lib/runtime-types";
import type { ProviderRow } from "~/server/agent/config";
import type { CliRuntime, CliTurnInput, RuntimeModel } from "~/server/agent/runtime/types";
import type { PermissionMode, ThreadMode } from "~/server/agent/types";
import { ensureApprovalExtension } from "./approval-extension";
import { PiJsonl } from "./jsonl";
import { piSpawnArgs, startPiTurn } from "./turn";
import { piPolicy } from "./policy";

const MODELS_TTL_MS = 60_000;
const cache: Map<string, { at: number; models: RuntimeModel[] }> = ((globalThis as any).__onesistPiModels ??= new Map());

export function piBinary(provider: Pick<ProviderRow, "cliPath">): string {
  return provider.cliPath?.trim() || "pi";
}

export function parsePiModels(data: any): RuntimeModel[] {
  const list: any[] = Array.isArray(data?.models) ? data.models : [];
  return list
    .filter((m) => typeof m?.provider === "string" && typeof m?.id === "string")
    .map((m) => ({
      id: `${m.provider}/${m.id}`,
      name: typeof m.name === "string" && m.name ? m.name : m.id,
      options: [],
      contextWindow: typeof m.contextWindow === "number" ? m.contextWindow : null,
    }));
}

function binaryExists(binary: string): boolean {
  if (binary.includes("/") || binary.includes("\\")) return fs.existsSync(binary);
  return resolveExecutable(binary) !== null;
}

/** One short-lived `pi --mode rpc` process: asks one question, then ends. */
async function askPi<T>(binary: string, dataDir: string, command: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const extension = ensureApprovalExtension(dataDir);
  const child = spawn(binary, piSpawnArgs({ provider: null, model: null, sessionDir: path.join(dataDir, "pi", "sessions"), extensionPath: extension }), {
    cwd: dataDir,
    env: { ...process.env, ONESIST_PI_POLICY: piPolicy("readonly", "agent") },
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const jsonl = new PiJsonl((line) => child.stdin?.writable && child.stdin.write(line));
  child.stdout?.setEncoding("utf-8");
  child.stdout?.on("data", (c: string) => jsonl.feed(c));
  child.on("error", (err) => jsonl.close(err.message));
  child.on("close", (code) => jsonl.close(`kode keluar ${code ?? "?"}`));
  try {
    return (await jsonl.command(command, timeoutMs)) as T;
  } finally {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
}

export const piRuntime: CliRuntime = {
  id: "pi",
  capabilities: { reasoningEffort: false, modelOptions: false },

  async listModels(provider: ProviderRow, opts: { force?: boolean } = {}): Promise<RuntimeModel[]> {
    const binary = piBinary(provider);
    const hit = cache.get(binary);
    if (!opts.force && hit && Date.now() - hit.at < MODELS_TTL_MS) return hit.models;
    const models = parsePiModels(await askPi(binary, dataDirOf(), { type: "get_available_models" }, 20_000));
    cache.set(binary, { at: Date.now(), models });
    return models;
  },

  async probe(provider: ProviderRow): Promise<RuntimeStatus> {
    const binary = piBinary(provider);
    if (!binaryExists(binary)) {
      return { state: "not_installed", version: null, message: `Pi tidak ditemukan ("${binary}"). Pasang Pi CLI atau isi path binary-nya di pengaturan provider.` };
    }
    try {
      const models = parsePiModels(await askPi(binary, dataDirOf(), { type: "get_available_models" }, 20_000));
      if (!models.length) {
        return { state: "not_ready", version: null, message: "Pi belum punya model yang bisa dipakai. Tambahkan kredensial provider lewat terminal (perintah pi), lalu cek lagi." };
      }
      return { state: "ready", version: null, message: `Pi siap · ${models.length} model.` };
    } catch (err) {
      return { state: "error", version: null, message: err instanceof Error ? err.message : String(err) };
    }
  },

  startTurn(input: CliTurnInput) {
    const { thread, provider } = input;
    const [providerPart, ...modelParts] = (thread.model ?? provider.model ?? "").split("/");
    const model = modelParts.join("/") || null;
    return startPiTurn({
      runId: input.runId,
      threadId: thread.id,
      projectId: thread.projectId,
      root: input.root,
      binary: piBinary(provider),
      dataDir: dataDirOf(),
      provider: model ? providerPart || null : null,
      model,
      permissionMode: thread.permissionMode as PermissionMode,
      threadMode: thread.mode as ThreadMode,
      text: input.text,
      sessionId: input.sessionId,
      onSessionCreated: input.onSessionCreated,
    });
  },
};

/** The app's data folder, from the environment (desktop: appData; web dev: beside data.db). */
function dataDirOf(): string {
  const db = process.env.SA_DB_PATH?.trim();
  return db ? path.dirname(path.resolve(db)) : path.join(process.env.HOME ?? ".", ".onesist");
}
