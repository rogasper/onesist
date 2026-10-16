/**
 * One Claude Code turn with a fake `query()`: the options it is given (workspace, user's
 * binary, session, MCP, policy), a session started or resumed, a lost session started again,
 * an approval answered through the run's question, Stop, and a failure.
 *
 *   bun test src/server/agent/cli/claude/turn.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-claude-turn-")), "data.db");

const registry = await import("~/server/agent/run-registry");
const { buildClaudeOptions, liveClaudeTurns, startClaudeTurn } = await import("./turn");

const answer = (sid: string) => [
  { type: "system", subtype: "init", session_id: sid, model: "m", cwd: "/ws", tools: [], mcp_servers: [], permissionMode: "default" },
  { type: "stream_event", event: { type: "message_start", message: { id: "msg_1" } }, parent_tool_use_id: null, session_id: sid },
  { type: "stream_event", event: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }, parent_tool_use_id: null, session_id: sid },
  { type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "halo" } }, parent_tool_use_id: null, session_id: sid },
  { type: "stream_event", event: { type: "content_block_stop", index: 0 }, parent_tool_use_id: null, session_id: sid },
  { type: "stream_event", event: { type: "message_stop" }, parent_tool_use_id: null, session_id: sid },
  { type: "result", subtype: "success", is_error: false, result: "halo", session_id: sid, usage: { input_tokens: 9, output_tokens: 2 }, permission_denials: [] },
];

/** A fake query(): records its options, plays `script`, and honours interrupt/abort. */
function fakeQuery(script: (options: any) => AsyncGenerator<any>) {
  const calls: any[] = [];
  let interrupted = 0;
  const fn = ({ options }: { prompt: string; options: any }) => {
    calls.push(options);
    const gen = script(options);
    return Object.assign(gen, {
      interrupt: async () => {
        interrupted++;
        options.abortController?.abort();
      },
    });
  };
  return { fn, calls, interrupted: () => interrupted };
}

let n = 0;
const base = (over: any = {}) => ({
  runId: `run-claude-${++n}`,
  threadId: `thr-claude-${n}`,
  projectId: "p-claude",
  root: "/ws",
  executable: "/usr/local/bin/claude",
  model: "claude-sonnet-5-5",
  permissionMode: "ask",
  threadMode: "agent",
  text: "Jawab dengan satu kata: halo.",
  sessionId: null,
  onSessionCreated: () => {},
  mcp: { url: "http://127.0.0.1:4321/api/mcp/projects/p", token: "t0k" },
  ...over,
});

async function collect(stream: ReadableStream<any>): Promise<any[]> {
  const parts: any[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return parts;
    parts.push(value);
  }
}

async function waitFor<T>(get: () => T | undefined | null, ms = 5000): Promise<T> {
  const until = Date.now() + ms;
  for (;;) {
    const v = get();
    if (v) return v;
    if (Date.now() > until) throw new Error("timed out");
    await Bun.sleep(10);
  }
}

test("the options carry the workspace, the user's binary, a new session id, Onesist's MCP and the policy", () => {
  const ac = new AbortController();
  const canUseTool = async () => ({ behavior: "allow" as const });
  const opts = buildClaudeOptions(base({ permissionMode: "readonly" }) as any, { resume: null, newSessionId: "11111111-1111-4111-8111-111111111111", abortController: ac, canUseTool });
  expect(opts).toMatchObject({
    cwd: "/ws",
    model: "claude-sonnet-5-5",
    pathToClaudeCodeExecutable: "/usr/local/bin/claude",
    includePartialMessages: true,
    permissionMode: "default",
    sessionId: "11111111-1111-4111-8111-111111111111",
    mcpServers: { onesist: { type: "http", url: "http://127.0.0.1:4321/api/mcp/projects/p", headers: { Authorization: "Bearer t0k" } } },
    disallowedTools: ["Bash", "BashOutput", "KillShell", "Edit", "MultiEdit", "Write", "NotebookEdit"],
  });
  expect(opts.resume).toBeUndefined();
  expect(opts.abortController).toBe(ac);
  expect(opts.canUseTool).toBe(canUseTool);
  const resumed = buildClaudeOptions(base({ mcp: null }) as any, { resume: "22222222-2222-4222-8222-222222222222", newSessionId: null, abortController: ac, canUseTool });
  expect(resumed.resume).toBe("22222222-2222-4222-8222-222222222222");
  expect(resumed.sessionId).toBeUndefined();
  expect(resumed.mcpServers).toBeUndefined();
  expect(resumed.disallowedTools).toBeUndefined();
});

test("a new turn streams its text, records the session Onesist chose, and reports usage", async () => {
  const q = fakeQuery(async function* (options) {
    yield* answer(options.sessionId);
  });
  const sessions: string[] = [];
  const { stream, usage } = await startClaudeTurn(base({ onSessionCreated: (id: string) => sessions.push(id) }) as any, q.fn as any);
  const parts = await collect(stream);
  expect(parts.map((p) => p.type)).toEqual(["start", "start-step", "text-start", "text-delta", "text-end", "finish-step", "finish"]);
  expect(sessions).toEqual([q.calls[0].sessionId]);
  expect(q.calls[0].sessionId).toMatch(/^[0-9a-f-]{36}$/);
  expect(await usage).toEqual({ inputTokens: 9, outputTokens: 2 });
  expect(liveClaudeTurns()).toBe(0);
});

test("a known session is resumed and not recorded again", async () => {
  const sid = "33333333-3333-4333-8333-333333333333";
  const q = fakeQuery(async function* () {
    yield* answer(sid);
  });
  const sessions: string[] = [];
  await collect((await startClaudeTurn(base({ sessionId: sid, onSessionCreated: (id: string) => sessions.push(id) }) as any, q.fn as any)).stream);
  expect(q.calls[0].resume).toBe(sid);
  expect(sessions).toEqual([]);
});

test("a session Claude no longer has starts a new one and records it", async () => {
  const q = fakeQuery(async function* (options) {
    if (options.resume) throw new Error("No conversation found with session ID: 44444444-4444-4444-8444-444444444444");
    yield* answer(options.sessionId);
  });
  const sessions: string[] = [];
  const parts = await collect((await startClaudeTurn(base({ sessionId: "44444444-4444-4444-8444-444444444444", onSessionCreated: (id: string) => sessions.push(id) }) as any, q.fn as any)).stream);
  expect(q.calls.length).toBe(2);
  expect(sessions).toEqual([q.calls[1].sessionId]);
  expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });
});

test("ask: Claude's permission request becomes the run's question; the answer reaches Claude", async () => {
  const decisions: any[] = [];
  const q = fakeQuery(async function* (options) {
    yield answer(options.sessionId)[0];
    decisions.push(await options.canUseTool("Bash", { command: "pwd" }, { signal: options.abortController.signal }));
    yield* answer(options.sessionId).slice(1);
  });
  const input = base();
  const reading = (async () => collect((await startClaudeTurn(input as any, q.fn as any)).stream))();
  const pending = await waitFor(() => registry.listPendingQuestions(input.runId)[0]);
  expect(pending.questions[0].question).toBe("Claude Code meminta izin menjalankan perintah: pwd");
  registry.resolveQuestion(input.runId, pending.questionId, ["Izinkan sekali"]);
  const parts = await reading;
  expect(decisions).toEqual([{ behavior: "allow", updatedInput: { command: "pwd" } }]);
  expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });
});

test("Stop interrupts Claude and ends the stream with an abort; the pending question is denied", async () => {
  const decisions: any[] = [];
  const q = fakeQuery(async function* (options) {
    yield answer(options.sessionId)[0];
    decisions.push(await options.canUseTool("Bash", { command: "rm -rf x" }, { signal: options.abortController.signal }));
    if (!options.abortController.signal.aborted) {
      await new Promise<void>((resolve) => options.abortController.signal.addEventListener("abort", () => resolve(), { once: true }));
    }
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  });
  const input = base();
  const reading = (async () => collect((await startClaudeTurn(input as any, q.fn as any)).stream))();
  await waitFor(() => registry.listPendingQuestions(input.runId)[0]);
  registry.stopRun(input.runId);
  const parts = await reading;
  expect(parts.at(-1)).toEqual({ type: "abort" });
  expect(decisions[0].behavior).toBe("deny");
  expect(q.interrupted()).toBe(1);
});

test("a failure (binary gone, SDK error) ends with an error and finish", async () => {
  const q = fakeQuery(async function* () {
    throw new Error("spawn /usr/local/bin/claude ENOENT");
  });
  const parts = await collect((await startClaudeTurn(base() as any, q.fn as any)).stream);
  expect(String(parts.find((p) => p.type === "error").error.message)).toContain("ENOENT");
  expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: "error" });
});
