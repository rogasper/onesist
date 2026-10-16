/**
 * One chat turn run by the Antigravity CLI. A turn is one `agy -p … --output-format stream-json`
 * process in the thread's workspace, resumed with `--conversation` (the thread's provider
 * session). Headless agy cannot ask for permission mid-turn, so in "ask" mode a refused action
 * is asked about once the process ends, and when the user allows it one more process runs in
 * the same conversation with permissions skipped. Stop kills the process.
 */
import { spawn, type ChildProcess } from "node:child_process";
import type { TextStreamPart, ToolSet } from "~/server/agent/ai";
import { awaitQuestion, createRun } from "~/server/agent/run-registry";
import type { CliTurn } from "~/server/agent/runtime/types";
import { agyArgs, continueText, deniedQuestion, ESCALATE_OPTIONS, promptTooLong, WINDOWS_ARG_LIMIT, type AgyPolicy } from "./args";
import { createAgyMapper, type AgyEvent } from "./stream-mapper";

type Part = TextStreamPart<ToolSet>;

export interface AgyTurnInput {
  runId: string;
  threadId: string;
  projectId: string;
  root: string;
  binary: string;
  model: string | null;
  policy: AgyPolicy;
  text: string;
  sessionId: string | null;
  onSessionCreated: (sessionId: string) => void;
  /** For tests: the platform whose command-line limit applies. */
  platform?: NodeJS.Platform;
}

const STDERR_TAIL = 2000;

const live: Set<ChildProcess> = ((globalThis as any).__onesistAgyChildren ??= new Set<ChildProcess>());
const hooks: { installed: boolean } = ((globalThis as any).__onesistAgyHooks ??= { installed: false });

/** Ends every agy process this server started. */
export function stopAgyProcesses(): void {
  for (const child of live) {
    try {
      child.kill();
    } catch {
      /* already gone */
    }
  }
}

export function liveAgyProcesses(): number {
  return live.size;
}

function installHooks(): void {
  if (hooks.installed) return;
  hooks.installed = true;
  process.once("exit", stopAgyProcesses);
  // Bun does not run "exit" listeners when a signal ends the process (opencode/server.ts).
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      stopAgyProcesses();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}

interface Outcome {
  aborted: boolean;
  exitCode: number | null;
  stderr: string;
  sawResult: boolean;
}

export async function startAgyTurn(input: AgyTurnInput): Promise<CliTurn> {
  installHooks();
  const run = createRun({ runId: input.runId, threadId: input.threadId, projectId: input.projectId });
  const mapper = createAgyMapper(input.model ?? "antigravity");
  let conversation = input.sessionId;
  let resolveUsage: (u: { inputTokens: number | null; outputTokens: number | null }) => void = () => {};
  const usage = new Promise<{ inputTokens: number | null; outputTokens: number | null }>((resolve) => {
    resolveUsage = resolve;
  });

  const stream = new ReadableStream<Part>({
    async start(controller) {
      const runOnce = (args: string[]) =>
        new Promise<Outcome>((resolve) => {
          let stderr = "";
          let buffer = "";
          let sawResult = false;
          let settled = false;
          const child = spawn(input.binary, args, { cwd: input.root, env: process.env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
          live.add(child);
          const onAbort = () => {
            try {
              child.kill();
            } catch {
              /* already gone */
            }
            settle(true, null);
          };
          const settle = (aborted: boolean, exitCode: number | null) => {
            if (settled) return;
            settled = true;
            run.abort.signal.removeEventListener("abort", onAbort);
            resolve({ aborted, exitCode, stderr: stderr.slice(-STDERR_TAIL), sawResult });
          };
          const handleLine = (line: string) => {
            const trimmed = line.trim();
            if (!trimmed || settled) return;
            let event: AgyEvent;
            try {
              event = JSON.parse(trimmed);
            } catch {
              return; // agy prints only JSON lines on stdout; anything else is noise
            }
            if (event.event === "result") sawResult = true;
            for (const part of mapper.map(event)) controller.enqueue(part);
            // A conversation agy could not find comes back under a new id: that is the new session.
            if (mapper.conversationId && mapper.conversationId !== conversation) {
              conversation = mapper.conversationId;
              input.onSessionCreated(conversation);
            }
          };
          child.stdout?.on("data", (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const l of lines) handleLine(l);
          });
          child.stderr?.on("data", (chunk) => {
            stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL);
          });
          child.on("error", (err) => {
            // A spawn failure (binary gone) may never emit "close".
            live.delete(child);
            stderr += `\n${err.message}`;
            settle(false, null);
          });
          child.on("close", (code) => {
            live.delete(child);
            if (buffer) handleLine(buffer);
            buffer = "";
            settle(false, code);
          });
          if (run.abort.signal.aborted) onAbort();
          else run.abort.signal.addEventListener("abort", onAbort, { once: true });
        });

      const end = (opts: { aborted?: boolean; error?: unknown }) => {
        for (const part of mapper.finish(opts)) controller.enqueue(part);
        resolveUsage(mapper.usage());
        controller.close();
      };

      if (promptTooLong(input.text, input.platform)) {
        end({ error: new Error(`Pesan terlalu panjang untuk Antigravity di Windows (${input.text.length} karakter, batas ${WINDOWS_ARG_LIMIT}). Ringkas percakapan dulu atau pakai provider lain.`) });
        return;
      }

      let outcome = await runOnce(agyArgs({ text: input.text, sessionId: conversation, model: input.model, skipPermissions: input.policy === "skip" }));
      const denied = mapper.lastResult?.denied_actions ?? [];
      if (!outcome.aborted && outcome.sawResult && input.policy === "ask" && denied.length && conversation) {
        const answers = await awaitQuestion(input.runId, [{ question: deniedQuestion(denied), options: [...ESCALATE_OPTIONS] }]);
        if (answers?.[0] === ESCALATE_OPTIONS[0] && !run.abort.signal.aborted) {
          outcome = await runOnce(agyArgs({ text: continueText(denied), sessionId: conversation, model: input.model, skipPermissions: true }));
        }
      }

      const aborted = outcome.aborted || run.abort.signal.aborted;
      const lastErr = outcome.stderr.trim().split("\n").at(-1)?.trim();
      const error =
        !aborted && !outcome.sawResult ? new Error(`Antigravity berhenti tanpa hasil (kode ${outcome.exitCode ?? "?"})${lastErr ? `: ${lastErr}` : ""}.`) : undefined;
      end({ aborted, error });
    },
  });

  return { stream, usage };
}
