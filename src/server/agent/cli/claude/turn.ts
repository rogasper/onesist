/**
 * One chat turn run by Claude Code through the Agent SDK: one `query()` per turn, in the
 * thread's workspace, with the user's own `claude` binary. A new session uses a session id
 * Onesist chooses; a known one is resumed, and one Claude no longer has is started again and
 * recorded. Permission requests go through `canUseTool` (permissions.ts). Onesist's MCP is
 * given per process (`mcpServers`), never written to the user's config. Stop interrupts, then
 * aborts if Claude does not stop on its own.
 */
import crypto from "node:crypto";
import { query, type CanUseTool, type Options } from "@anthropic-ai/claude-agent-sdk";
import type { TextStreamPart, ToolSet } from "~/server/agent/ai";
import { createRun } from "~/server/agent/run-registry";
import type { PermissionMode, ThreadMode } from "~/server/agent/types";
import { claudePolicy, disallowedToolsFor, makeCanUseTool } from "./permissions";
import { createClaudeMapper } from "./stream-mapper";

type Part = TextStreamPart<ToolSet>;
type Usage = { inputTokens: number | null; outputTokens: number | null };

export type ClaudeQueryFn = (params: { prompt: string; options: Options }) => AsyncIterable<any> & { interrupt(): Promise<unknown> };

export interface ClaudeTurnInput {
  runId: string;
  threadId: string;
  projectId: string;
  root: string;
  executable: string;
  model: string | null;
  permissionMode: PermissionMode;
  threadMode: ThreadMode;
  text: string;
  sessionId: string | null;
  onSessionCreated: (id: string) => void;
  mcp: { url: string; token: string } | null;
}

const ABORT_GRACE_MS = 2_000;
const live: Set<AbortController> = ((globalThis as any).__onesistClaudeTurns ??= new Set<AbortController>());
const hooks: { installed: boolean } = ((globalThis as any).__onesistClaudeHooks ??= { installed: false });

export function stopClaudeTurns(): void {
  for (const ac of live) ac.abort();
  live.clear();
}

export function liveClaudeTurns(): number {
  return live.size;
}

function installHooks(): void {
  if (hooks.installed) return;
  hooks.installed = true;
  process.once("exit", stopClaudeTurns);
  // Bun does not run "exit" listeners when a signal ends the process (opencode/server.ts).
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      stopClaudeTurns();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}

export function buildClaudeOptions(
  input: ClaudeTurnInput,
  extra: { resume: string | null; newSessionId: string | null; abortController: AbortController; canUseTool: CanUseTool },
): Options {
  const disallowed = disallowedToolsFor(claudePolicy(input.permissionMode, input.threadMode));
  return {
    cwd: input.root,
    ...(input.model ? { model: input.model } : {}),
    pathToClaudeCodeExecutable: input.executable,
    includePartialMessages: true,
    permissionMode: "default",
    ...(extra.resume ? { resume: extra.resume } : {}),
    ...(extra.newSessionId ? { sessionId: extra.newSessionId } : {}),
    ...(input.mcp ? { mcpServers: { onesist: { type: "http", url: input.mcp.url, headers: { Authorization: `Bearer ${input.mcp.token}` } } } } : {}),
    ...(disallowed.length ? { disallowedTools: disallowed } : {}),
    abortController: extra.abortController,
    canUseTool: extra.canUseTool,
  } as Options;
}

const isMissingSession = (err: unknown) => /no conversation found|session not found|not found/i.test(String((err as any)?.message ?? err));

export async function startClaudeTurn(input: ClaudeTurnInput, queryFn: ClaudeQueryFn = query as unknown as ClaudeQueryFn): Promise<{ stream: ReadableStream<Part>; usage: Promise<Usage> }> {
  installHooks();
  const run = createRun({ runId: input.runId, threadId: input.threadId, projectId: input.projectId });
  const mapper = createClaudeMapper(input.model ?? "claude");
  const canUseTool = makeCanUseTool({ runId: input.runId, policy: claudePolicy(input.permissionMode, input.threadMode), cwd: input.root });
  let resolveUsage: (u: Usage) => void = () => {};
  const usage = new Promise<Usage>((resolve) => {
    resolveUsage = resolve;
  });
  // Resolves once the session is known (init) or the turn has ended, so the caller saves the session
  // after the runtime took the prompt — the same point OpenCode and the chat route assume.
  let markReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  const stream = new ReadableStream<Part>({
    async start(controller) {
      let finished = false;
      const runQuery = async (resume: string | null, newSessionId: string | null) => {
        const abortController = new AbortController();
        live.add(abortController);
        const q = queryFn({ prompt: input.text, options: buildClaudeOptions(input, { resume, newSessionId, abortController, canUseTool }) });
        const onAbort = () => {
          void q.interrupt().catch(() => {});
          // Claude may not end the stream on its own: after the grace period, abort and end here.
          setTimeout(() => {
            abortController.abort();
            end({ aborted: true });
          }, ABORT_GRACE_MS).unref?.();
        };
        if (run.abort.signal.aborted) onAbort();
        else run.abort.signal.addEventListener("abort", onAbort, { once: true });
        try {
          for await (const msg of q) {
            if (msg?.type === "system" && msg.subtype === "init") {
              if (typeof msg.session_id === "string" && msg.session_id !== input.sessionId) input.onSessionCreated(msg.session_id);
              markReady();
            }
            if (finished) break;
            for (const part of mapper.map(msg)) controller.enqueue(part);
          }
        } finally {
          run.abort.signal.removeEventListener("abort", onAbort);
          live.delete(abortController);
        }
      };

      const end = (opts: { aborted?: boolean; error?: unknown }) => {
        if (finished) return;
        finished = true;
        markReady();
        for (const part of mapper.finish(opts)) controller.enqueue(part);
        resolveUsage(mapper.usage());
        controller.close();
      };

      try {
        if (input.sessionId) {
          try {
            await runQuery(input.sessionId, null);
          } catch (err) {
            if (run.abort.signal.aborted || mapper.started || !isMissingSession(err)) throw err;
            await runQuery(null, crypto.randomUUID());
          }
        } else {
          await runQuery(null, crypto.randomUUID());
        }
        end({ aborted: run.abort.signal.aborted });
      } catch (err) {
        const aborted = run.abort.signal.aborted;
        end({ aborted, error: aborted ? undefined : err });
      }
    },
  });
  await ready;
  return { stream, usage };
}
