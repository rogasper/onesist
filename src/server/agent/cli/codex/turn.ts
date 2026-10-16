/**
 * One chat turn on a Codex thread. The thread is started in the workspace, or resumed when
 * Codex still knows it; a thread Codex no longer knows is started again and the new id is
 * recorded. Approval requests of this thread arrive through the connection's per-thread
 * subscription and are answered through the run's question. Stop sends `turn/interrupt` and
 * the stream ends with an abort.
 */
import type { TextStreamPart, ToolSet } from "~/server/agent/ai";
import { awaitQuestion, createRun } from "~/server/agent/run-registry";
import type { PermissionMode, ThreadMode } from "~/server/agent/types";
import { APPROVAL_OPTIONS, codexPolicy, decisionFor } from "./policy";
import type { RpcServerRequest } from "./rpc";
import { getCodexConnection, type CodexConnection } from "./server";
import { createCodexMapper } from "./stream-mapper";

type Part = TextStreamPart<ToolSet>;
type Usage = { inputTokens: number | null; outputTokens: number | null };

export interface CodexTurnInput {
  runId: string;
  threadId: string;
  projectId: string;
  root: string;
  binary: string;
  model: string | null;
  permissionMode: PermissionMode;
  threadMode: ThreadMode;
  text: string;
  sessionId: string | null;
  onSessionCreated: (id: string) => void;
}

const isUnknownThread = (err: unknown) => /tidak ditemukan|not found|unknown thread/i.test(String((err as any)?.message ?? err));

async function openThread(conn: CodexConnection, input: CodexTurnInput): Promise<string> {
  const policy = codexPolicy(input.permissionMode, input.threadMode);
  const common = { cwd: input.root, approvalPolicy: policy.approvalPolicy, sandbox: policy.sandbox, ...(input.model ? { model: input.model } : {}) };
  if (input.sessionId) {
    try {
      const resumed = await conn.rpc.request("thread/resume", { threadId: input.sessionId, ...common });
      return resumed.thread.id;
    } catch (err) {
      if (!isUnknownThread(err)) throw err;
    }
  }
  const started = await conn.rpc.request("thread/start", common);
  input.onSessionCreated(started.thread.id);
  return started.thread.id;
}

export async function startCodexTurn(input: CodexTurnInput): Promise<{ stream: ReadableStream<Part>; usage: Promise<Usage> }> {
  const run = createRun({ runId: input.runId, threadId: input.threadId, projectId: input.projectId });
  const policy = codexPolicy(input.permissionMode, input.threadMode);
  let resolveUsage: (u: Usage) => void = () => {};
  const usage = new Promise<Usage>((resolve) => {
    resolveUsage = resolve;
  });
  // Resolves once the thread is known (or the turn ended), so the caller saves the session after the
  // runtime took the prompt — the same point the chat route and the Claude runtime rely on.
  let markReady: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });

  const stream = new ReadableStream<Part>({
    async start(controller) {
      let conn: CodexConnection | null = null;
      let threadId = "";
      let turnId = "";
      let mapper = createCodexMapper("", input.model ?? "codex");
      let finished = false;
      let unsubscribeNotifications: (() => void) | null = null;
      let unsubscribeRequests: (() => void) | null = null;
      let unsubscribeClosed: (() => void) | null = null;

      const cleanup = () => {
        unsubscribeNotifications?.();
        unsubscribeRequests?.();
        unsubscribeClosed?.();
        run.abort.signal.removeEventListener("abort", onAbort);
      };
      // Ends the stream once. `parts` are what the mapper still owes (none when it already finished).
      const close = (parts: Part[]) => {
        markReady();
        if (finished) return;
        finished = true;
        cleanup();
        for (const part of parts) controller.enqueue(part);
        resolveUsage(mapper.usage());
        controller.close();
      };
      const finish = (opts: { aborted?: boolean; error?: unknown }) => close(mapper.finish(opts));
      const onAbort = () => {
        if (conn && threadId && turnId) void conn.rpc.request("turn/interrupt", { threadId, turnId }).catch(() => {});
        // The server confirms with turn/completed (status "interrupted"); if it never does, end here.
        setTimeout(() => finish({ aborted: true }), 2_000).unref?.();
      };
      const onApproval = async (r: RpcServerRequest) => {
        const isCommand = r.method === "item/commandExecution/requestApproval";
        const isFile = r.method === "item/fileChange/requestApproval";
        if (!isCommand && !isFile) return;
        const what = isCommand ? `menjalankan perintah ${String(r.params?.command ?? "")}`.trim() : "mengubah berkas";
        const answers = policy.ask ? await awaitQuestion(input.runId, [{ question: `Codex meminta izin ${what}.`, options: [...APPROVAL_OPTIONS] }]) : null;
        const decision = policy.ask ? decisionFor(answers?.[0] ?? null, isCommand ? "command" : "file") : "decline";
        conn?.rpc.respond(r.id, { decision });
      };

      try {
        conn = await getCodexConnection(input.binary);
        threadId = await openThread(conn, input);
        markReady();
        mapper = createCodexMapper(threadId, input.model ?? "codex");
        unsubscribeNotifications = conn.subscribe(threadId, (n) => {
          if (n.method === "turn/started" && typeof n.params?.turn?.id === "string") turnId = n.params.turn.id;
          if (n.method === "item/started" && typeof n.params?.turnId === "string") turnId ||= n.params.turnId;
          // The mapper ends the turn itself on turn/completed; its finish parts go out here, once.
          for (const part of mapper.map(n)) controller.enqueue(part);
          if (mapper.done) close([]);
        });
        unsubscribeClosed = conn.onClosed((reason) => finish({ error: new Error(`Proses Codex berhenti sebelum giliran selesai: ${reason}`) }));
        unsubscribeRequests = conn.subscribeRequests(threadId, (r) => void onApproval(r));
        run.abort.signal.addEventListener("abort", onAbort, { once: true });
        if (run.abort.signal.aborted) return onAbort();
        const started = await conn.rpc.request("turn/start", { threadId, input: [{ type: "text", text: input.text, text_elements: [] }] });
        turnId = started?.turn?.id ?? turnId;
      } catch (err) {
        finish({ aborted: run.abort.signal.aborted, error: run.abort.signal.aborted ? undefined : err });
      }
    },
  });
  await ready;
  return { stream, usage };
}
