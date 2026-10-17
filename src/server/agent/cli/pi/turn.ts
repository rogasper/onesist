/**
 * One chat turn on a Pi session, in its own `pi --mode rpc` process. The process starts in
 * the workspace with the model and the approval extension; a known session file is opened
 * with `switch_session` before the prompt. Extension dialogs (`extension_ui_request`) become
 * the run's questions and are answered with `extension_ui_response`. Stop aborts the agent
 * and ends the process. The session file is handed back once it is known.
 */
import { spawn, type ChildProcess } from "node:child_process";
import type { TextStreamPart, ToolSet } from "~/server/agent/ai";
import { awaitQuestion, createRun, stopRun } from "~/server/agent/run-registry";
import type { PermissionMode, ThreadMode } from "~/server/agent/types";
import { ensureApprovalExtension } from "./approval-extension";
import { PiJsonl, type PiRecord } from "./jsonl";
import { PI_APPROVAL_TITLE, piPolicy } from "./policy";
import { createPiMapper } from "./stream-mapper";
import path from "node:path";

type Part = TextStreamPart<ToolSet>;

export interface PiTurnInput {
  runId: string;
  threadId: string;
  projectId: string;
  root: string;
  binary: string;
  dataDir: string;
  provider: string | null;
  model: string | null;
  permissionMode: PermissionMode;
  threadMode: ThreadMode;
  text: string;
  sessionId: string | null;
  onSessionCreated: (sessionFile: string) => void;
}

const STDERR_TAIL = 2000;
const live: Set<ChildProcess> = ((globalThis as any).__onesistPiChildren ??= new Set<ChildProcess>());
const hooks: { installed: boolean } = ((globalThis as any).__onesistPiHooks ??= { installed: false });

function installHooks(): void {
  if (hooks.installed) return;
  hooks.installed = true;
  const stopAll = () => {
    for (const c of live) {
      try {
        c.kill();
      } catch {
        /* already gone */
      }
    }
  };
  process.once("exit", stopAll);
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      stopAll();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}

export function piSpawnArgs(input: { provider: string | null; model: string | null; sessionDir: string; extensionPath: string }): string[] {
  const args = ["--mode", "rpc"];
  // Pi exits at start with --provider and no --model (t3code, Pi 1.0): the two always go together.
  if (input.provider && input.model) args.push("--provider", input.provider, "--model", input.model);
  args.push("--session-dir", input.sessionDir, "--extension", input.extensionPath);
  return args;
}

export async function startPiTurn(input: PiTurnInput): Promise<{ stream: ReadableStream<Part>; usage: Promise<{ inputTokens: number | null; outputTokens: number | null }> }> {
  installHooks();
  const run = createRun({ runId: input.runId, threadId: input.threadId, projectId: input.projectId });
  const policy = piPolicy(input.permissionMode, input.threadMode);
  const mapper = createPiMapper(input.model ?? "pi");
  let resolveUsage: (u: { inputTokens: number | null; outputTokens: number | null }) => void = () => {};
  const usage = new Promise<{ inputTokens: number | null; outputTokens: number | null }>((resolve) => {
    resolveUsage = resolve;
  });
  // Resolves once the session is known (or the turn ended): the chat route saves the session
  // after startTurn resolves, so returning earlier loses it (the 5B/5C bug).
  let markReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  const stream = new ReadableStream<Part>({
    async start(controller) {
      const extensionPath = ensureApprovalExtension(input.dataDir);
      const sessionDir = path.join(input.dataDir, "pi", "sessions");
      const args = piSpawnArgs({ provider: input.provider, model: input.model, sessionDir, extensionPath });
      const child = spawn(input.binary, args, { cwd: input.root, env: { ...process.env, ONESIST_PI_POLICY: policy }, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
      live.add(child);
      let stderr = "";
      let sawEnd = false;
      let settled = false;
      const jsonl = new PiJsonl((line) => {
        if (child.stdin?.writable) child.stdin.write(line);
      });
      const finishTurn = (opts: { aborted?: boolean; error?: unknown }) => {
        markReady();
        if (settled) return;
        settled = true;
        run.abort.signal.removeEventListener("abort", onAbort);
        // agent_end already ended the turn through the mapper; a second finish would be a duplicate.
        if (!mapper.done) for (const part of mapper.finish(opts)) controller.enqueue(part);
        resolveUsage(mapper.usage());
        try {
          child.kill();
        } catch {
          /* already gone */
        }
        controller.close();
      };
      const onAbort = () => {
        // Wait for Pi to acknowledge the abort (or the short timeout) before the process is killed.
        void jsonl.command({ type: "abort" }, 1_000).catch(() => {}).finally(() => finishTurn({ aborted: true }));
      };

      jsonl.onClosed((reason) => {
        if (!sawEnd && !run.abort.signal.aborted) {
          const lastErr = stderr.trim().split("\n").at(-1)?.trim();
          finishTurn({ error: new Error(`Pi berhenti sebelum selesai: ${lastErr || reason}`) });
        }
      });
      child.stdout?.setEncoding("utf-8");
      child.stdout?.on("data", (chunk: string) => jsonl.feed(chunk));
      child.stderr?.on("data", (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-STDERR_TAIL);
      });
      child.on("error", (err) => {
        live.delete(child);
        jsonl.close(`Pi tidak bisa dijalankan: ${err.message}`);
      });
      child.on("close", (code) => {
        live.delete(child);
        jsonl.close(`kode keluar ${code ?? "?"}`);
      });

      jsonl.onEvent((r: PiRecord) => {
        // Output that arrives after the turn ended (a late event, the process exiting) is dropped:
        // the stream is closed and enqueueing on it would throw.
        if (settled) return;
        // Once Stop is pressed the turn is ending: a late agent_end must not turn the abort into a finish.
        if (run.abort.signal.aborted) return;
        if (r.type === "extension_ui_request" && r.method === "confirm") {
          void (async () => {
            const answers = await awaitQuestion(input.runId, [{ question: `${String(r.title ?? PI_APPROVAL_TITLE("alat"))}${r.message ? ` — ${String(r.message)}` : ""}`, options: ["Izinkan sekali", "Tolak"] }]);
            const ok = answers?.[0] === "Izinkan sekali";
            jsonl.send({ type: "extension_ui_response", id: r.id, confirmed: ok });
          })();
          return;
        }
        if (r.type === "agent_end") sawEnd = true;
        for (const part of mapper.map(r)) controller.enqueue(part);
        if (r.type === "agent_end") {
          void (async () => {
            try {
              const stats = await jsonl.command({ type: "get_session_stats" }, 5_000);
              const t = stats?.tokens ?? {};
              mapper.setUsage({ input: Number(t.input ?? 0), output: Number(t.output ?? 0) });
            } catch {
              /* usage is optional */
            }
            finishTurn({});
          })();
        }
      });

      run.abort.signal.addEventListener("abort", onAbort, { once: true });
      try {
        if (input.sessionId) {
          let opened = false;
          try {
            const sw = await jsonl.command({ type: "switch_session", sessionPath: input.sessionId }, 10_000);
            opened = !sw?.cancelled;
          } catch {
            /* the file is gone or unreadable: a new session below, recorded */
          }
          if (!opened) await jsonl.command({ type: "new_session" }, 10_000);
        }
        const state = await jsonl.command({ type: "get_state" }, 10_000);
        const current = typeof state?.sessionFile === "string" ? state.sessionFile : null;
        if (current && current !== input.sessionId) input.onSessionCreated(current);
        markReady();
        await jsonl.command({ type: "prompt", message: input.text }, 30_000);
      } catch (err) {
        if (!settled) finishTurn({ error: err });
      }
    },
  });

  await ready;
  return { stream, usage };
}
