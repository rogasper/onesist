/**
 * One chat turn run by `opencode serve`. Produces the same `{ stream, usage }` pair
 * the chat route reads from the native agent, so storing, recording and streaming
 * the reply needs no OpenCode-specific code in the route.
 *
 * OpenCode keeps the conversation in its own session (`chat_threads.cli_session_id`),
 * so only the new message is sent. Its permission requests become questions through
 * the run registry, which the chat UI already shows; Stop aborts the run, which
 * interrupts OpenCode here.
 */
import type { TextStreamPart, ToolSet } from "~/server/agent/ai";
import { awaitQuestion, createRun, recordApprovalDecision } from "~/server/agent/run-registry";
import type { PermissionMode, ThreadMode } from "~/server/agent/types";
import {
  ocCreateSession, ocInterrupt, ocOpenEvents, ocPrompt, ocReplyPermission, ocSetModel, ocUpdatePermissions, parseModelRef,
} from "./client";
import { PERMISSION_OPTIONS, autoDecision, decisionFromAnswer, permissionQuestion, permissionRules } from "./rules";
import { getOpenCodeConnection } from "./server";
import { createOpenCodeMapper } from "./stream-mapper";

export interface OpenCodeTurnInput {
  runId: string;
  threadId: string;
  projectId: string;
  root: string;
  binary: string;
  /** A server the user runs themselves (provider setting); null = spawn. */
  serverUrl?: string | null;
  serverPassword?: string | null;
  permissionMode: PermissionMode;
  threadMode: ThreadMode;
  /** `provider/model`, or null for OpenCode's default model. */
  model: string | null;
  /** OpenCode variant of that model (e.g. "high"); null = the model's default. */
  variant?: string | null;
  text: string;
  title: string | null;
  cliSessionId: string | null;
  onSessionCreated: (sessionId: string) => void;
}

export interface OpenCodeTurn {
  stream: ReadableStream<TextStreamPart<ToolSet>>;
  usage: Promise<{ inputTokens: number | null; outputTokens: number | null }>;
}

type Part = TextStreamPart<ToolSet>;

export async function startOpenCodeTurn(input: OpenCodeTurnInput): Promise<OpenCodeTurn> {
  const run = createRun({ runId: input.runId, threadId: input.threadId, projectId: input.projectId });
  const conn = await getOpenCodeConnection({ binary: input.binary, serverUrl: input.serverUrl, serverPassword: input.serverPassword });
  const rules = permissionRules(input.permissionMode, input.threadMode);
  const model = parseModelRef(input.model, input.variant);

  let sessionId = input.cliSessionId;
  if (sessionId) {
    await ocUpdatePermissions(conn, sessionId, rules);
    if (model) await ocSetModel(conn, sessionId, model);
  } else {
    sessionId = await ocCreateSession(conn, { title: input.title, directory: input.root, permissions: rules, model });
    input.onSessionCreated(sessionId);
  }
  const session = sessionId;

  const events = new AbortController();
  const onAbort = () => {
    void ocInterrupt(conn, session).catch(() => {});
    events.abort();
  };
  run.abort.signal.addEventListener("abort", onAbort, { once: true });

  // Subscribe before prompting: the first events follow the prompt within milliseconds.
  const iterator = await ocOpenEvents(conn, events.signal);
  await ocPrompt(conn, session, input.text);

  const handlePermission = async (d: any) => {
    const requestId = typeof d.id === "string" ? d.id : "";
    if (!requestId) return;
    const action = String(d.action ?? "");
    const toolCallId = typeof d.source?.id === "string" ? d.source.id : requestId;
    let decision = autoDecision(input.permissionMode, input.threadMode, action);
    if (!decision) {
      const resources = Array.isArray(d.resources) ? d.resources.map(String) : [];
      const answers = await awaitQuestion(input.runId, [{ question: permissionQuestion(action, resources), options: [...PERMISSION_OPTIONS] }]);
      decision = decisionFromAnswer(answers?.[0] ?? null);
    }
    recordApprovalDecision(input.runId, toolCallId, decision === "reject" ? "denied" : "approved");
    try {
      await ocReplyPermission(conn, session, requestId, decision);
    } catch (err) {
      console.error("[opencode] permission reply failed:", err);
    }
  };

  const mapper = createOpenCodeMapper(session, input.model ?? "opencode");
  let resolveUsage: (usage: { inputTokens: number | null; outputTokens: number | null }) => void = () => {};
  const usage = new Promise<{ inputTokens: number | null; outputTokens: number | null }>((resolve) => {
    resolveUsage = resolve;
  });

  const stream = new ReadableStream<Part>({
    async start(controller) {
      let failure: unknown = null;
      try {
        for await (const event of iterator) {
          if (event.type === "permission.asked") {
            if (event.data.sessionID === session) void handlePermission(event.data);
            continue;
          }
          for (const part of mapper.map(event)) controller.enqueue(part);
          if (mapper.done) break;
        }
      } catch (err) {
        failure = err;
      }
      if (!mapper.done) {
        if (run.abort.signal.aborted) controller.enqueue({ type: "abort" } as Part);
        else controller.enqueue({ type: "error", error: failure ?? new Error("Koneksi ke OpenCode terputus sebelum jawaban selesai.") } as Part);
      }
      run.abort.signal.removeEventListener("abort", onAbort);
      events.abort();
      resolveUsage(mapper.usage());
      controller.close();
    },
  });

  return { stream, usage };
}
