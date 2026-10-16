/**
 * Claude Code as a chat runtime: whether it can be used (the user's `claude` is found, and it
 * is logged in — `accountInfo()` says so), its models from Claude Code itself
 * (`supportedModels()`), and one turn. Both questions go through a control-only query whose
 * prompt never yields, so no model is called; it is always closed afterwards. The model list is
 * cached per binary for a minute.
 */
import { execFile } from "node:child_process";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import type { RuntimeStatus } from "~/lib/runtime-types";
import type { ProviderRow } from "~/server/agent/config";
import type { CliRuntime, CliTurnInput, RuntimeModel } from "~/server/agent/runtime/types";
import type { PermissionMode, ThreadMode } from "~/server/agent/types";
import { resolveClaudeExecutable } from "./executable";
import { startClaudeTurn, type ClaudeQueryFn } from "./turn";

export type ClaudeControlFn = (params: { prompt: AsyncIterable<any>; options: Options }) => { accountInfo(): Promise<any>; supportedModels(): Promise<any[]>; close(): void };

const MODELS_TTL_MS = 60_000;
const CONTROL_TIMEOUT_MS = 20_000;
const cache: Map<string, { at: number; models: RuntimeModel[] }> = ((globalThis as any).__onesistClaudeModels ??= new Map());

export function forgetClaudeModels(): void {
  cache.clear();
}

export function parseClaudeModels(models: any[]): RuntimeModel[] {
  return (Array.isArray(models) ? models : [])
    .filter((m) => typeof m?.value === "string")
    .map((m) => ({ id: m.value, name: typeof m.displayName === "string" && m.displayName ? m.displayName : m.value, options: [], contextWindow: null }));
}

/** A prompt that never yields: the query starts Claude Code but never sends a message. */
function idlePrompt(signal: AbortSignal): AsyncIterable<any> {
  return {
    async *[Symbol.asyncIterator]() {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
    },
  };
}

function versionOf(exe: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(exe, ["--version"], { timeout: 5_000, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : String(stdout).trim().split(/\s+/)[0] || null);
    });
  });
}

const withTimeout = <T>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} melewati batas waktu.`)), ms).unref?.())]);

export function createClaudeRuntime(deps: { query?: ClaudeQueryFn; control?: ClaudeControlFn; version?: (exe: string) => Promise<string | null> } = {}): CliRuntime {
  const control = deps.control ?? (query as unknown as ClaudeControlFn);
  const version = deps.version ?? versionOf;

  async function ask<T>(exe: string, fn: (c: ReturnType<ClaudeControlFn>) => Promise<T>): Promise<T> {
    const ac = new AbortController();
    const c = control({ prompt: idlePrompt(ac.signal), options: { pathToClaudeCodeExecutable: exe, abortController: ac } as Options });
    try {
      return await withTimeout(fn(c), CONTROL_TIMEOUT_MS, "Claude Code");
    } finally {
      try {
        c.close();
      } catch {
        /* already closed */
      }
      ac.abort();
    }
  }

  async function models(exe: string, force = false): Promise<RuntimeModel[]> {
    const hit = cache.get(exe);
    if (!force && hit && Date.now() - hit.at < MODELS_TTL_MS) return hit.models;
    const list = parseClaudeModels(await ask(exe, (c) => c.supportedModels()));
    cache.set(exe, { at: Date.now(), models: list });
    return list;
  }

  return {
    id: "claude",
    capabilities: { reasoningEffort: false, modelOptions: false },

    async listModels(provider: ProviderRow, opts: { force?: boolean } = {}): Promise<RuntimeModel[]> {
      const exe = resolveClaudeExecutable(provider.cliPath);
      if (!exe.ok) throw new Error(exe.error);
      return models(exe.path, opts.force);
    },

    async probe(provider: ProviderRow): Promise<RuntimeStatus> {
      const exe = resolveClaudeExecutable(provider.cliPath);
      if (!exe.ok) return { state: "not_installed", version: null, message: exe.error };
      const v = await version(exe.path);
      try {
        const account = await ask(exe.path, (c) => c.accountInfo());
        if (!(account?.email || account?.tokenSource || account?.apiKeySource)) {
          return { state: "not_ready", version: v, message: 'Claude Code belum login. Jalankan "claude" di terminal lalu /login, kemudian cek lagi.' };
        }
        const list = await models(exe.path);
        return { state: "ready", version: v, message: `Claude Code ${v ?? "?"} · ${list.length} model.` };
      } catch (err) {
        return { state: "error", version: v, message: err instanceof Error ? err.message : String(err) };
      }
    },

    startTurn(input: CliTurnInput) {
      const { thread, provider } = input;
      const exe = resolveClaudeExecutable(provider.cliPath);
      if (!exe.ok) return Promise.reject(new Error(exe.error));
      return startClaudeTurn(
        {
          runId: input.runId,
          threadId: thread.id,
          projectId: thread.projectId,
          root: input.root,
          executable: exe.path,
          model: thread.model ?? provider.model ?? null,
          permissionMode: thread.permissionMode as PermissionMode,
          threadMode: thread.mode as ThreadMode,
          text: input.text,
          sessionId: input.sessionId,
          onSessionCreated: input.onSessionCreated,
          mcp: input.mcp,
        },
        deps.query,
      );
    },
  };
}

export const claudeRuntime: CliRuntime = createClaudeRuntime();
