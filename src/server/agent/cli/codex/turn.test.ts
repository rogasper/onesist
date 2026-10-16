/**
 * One Codex turn against a fake app-server: the thread started or resumed in the workspace,
 * the stream of its own thread, an approval answered through the run's question, a thread
 * Codex no longer knows, Stop sending turn/interrupt, and a server that dies mid-turn.
 *
 *   bun test src/server/agent/cli/codex/turn.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-codex-turn-")), "data.db");

const registry = await import("~/server/agent/run-registry");
const { startCodexTurn } = await import("./turn");
const { stopCodexServers } = await import("./server");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-codex-fake2-"));
// The workspace path is already real (4C resolves it); the test does the same.
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-codex-root-")));
const fake = path.join(dir, "codex");
const log = path.join(dir, "requests.log");

// Behaviour is chosen by marker files in dir: `ask` sends a command approval before the turn
// ends, `unknown` answers thread/resume with an error, `dies` exits after the first delta.
fs.writeFileSync(
  fake,
  `#!/usr/bin/env bun
const fs = require("node:fs");
const readline = require("node:readline");
const dir = ${JSON.stringify(dir)};
const out = (o) => console.log(JSON.stringify(o));
const rl = readline.createInterface({ input: process.stdin });
const exists = (f) => fs.existsSync(dir + "/" + f);
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  fs.appendFileSync(dir + "/requests.log", (msg.method ?? "reply:" + msg.id) + " " + JSON.stringify(msg.params ?? msg.result ?? {}) + "\\n");
  if (msg.method === "initialize") return out({ id: msg.id, result: { userAgent: "fake" } });
  if (msg.method === "thread/start") return out({ id: msg.id, result: { thread: { id: "thr_new" } } });
  if (msg.method === "thread/resume") {
    if (exists("unknown")) return out({ id: msg.id, error: { code: -32600, message: "thread tidak ditemukan" } });
    return out({ id: msg.id, result: { thread: { id: msg.params.threadId } } });
  }
  if (msg.method === "turn/interrupt") {
    out({ id: msg.id, result: {} });
    out({ method: "turn/completed", params: { threadId: msg.params.threadId, turn: { id: "t1", status: "interrupted" } } });
    return;
  }
  if (msg.method === "turn/start") {
    const t = msg.params.threadId;
    out({ id: msg.id, result: { turn: { id: "t1", status: "inProgress" } } });
    out({ method: "item/started", params: { threadId: t, turnId: "t1", item: { type: "agentMessage", id: "m1", text: "" } } });
    out({ method: "item/agentMessage/delta", params: { threadId: t, turnId: "t1", itemId: "m1", delta: "halo" } });
    if (exists("ask")) {
      out({ id: 900, method: "item/commandExecution/requestApproval", params: { threadId: t, turnId: "t1", itemId: "c1", command: "pwd" } });
      return;
    }
    if (exists("dies")) process.exit(4);
    out({ method: "item/completed", params: { threadId: t, turnId: "t1", item: { type: "agentMessage", id: "m1", text: "halo" } } });
    out({ method: "turn/completed", params: { threadId: t, turn: { id: "t1", status: "completed", error: null } } });
    return;
  }
  if (msg.id === 900) {
    const d = msg.result?.decision;
    out({ method: "item/completed", params: { threadId: "thr_new", turnId: "t1", item: { type: "commandExecution", id: "c1", command: "pwd", cwd: "/ws", status: d === "decline" ? "declined" : "completed", aggregatedOutput: "/ws\\n", exitCode: 0, commandActions: [] } } });
    out({ method: "turn/completed", params: { threadId: "thr_new", turn: { id: "t1", status: "completed", error: null } } });
  }
});
`,
);
fs.chmodSync(fake, 0o755);

let n = 0;
function turn(over: Partial<Parameters<typeof startCodexTurn>[0]> = {}) {
  const runId = `run-codex-${++n}`;
  const sessions: string[] = [];
  return {
    runId,
    sessions,
    started: startCodexTurn({
      runId,
      threadId: `thr-codex-${n}`,
      projectId: "p-codex",
      root,
      binary: fake,
      model: "gpt-x",
      permissionMode: "ask",
      threadMode: "agent",
      text: "Jawab dengan satu kata: halo.",
      sessionId: null,
      onSessionCreated: (id) => sessions.push(id),
      ...over,
    }),
  };
}

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
    await Bun.sleep(20);
  }
}

const requests = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf-8").trim().split("\n") : []);
const flag = (f: string) => fs.writeFileSync(path.join(dir, f), "");
const unflag = (f: string) => fs.rmSync(path.join(dir, f), { force: true });

test("a new thread starts in the workspace with the policy, and its text streams", async () => {
  unflag("ask");
  const t = turn({ permissionMode: "auto" });
  const { stream, usage } = await t.started;
  const parts = await collect(stream);
  expect(parts.map((p) => p.type)).toEqual(["start", "text-start", "text-delta", "text-end", "finish"]);
  expect(t.sessions).toEqual(["thr_new"]);
  const start = requests().find((r) => r.startsWith("thread/start"))!;
  expect(start).toContain(`"cwd":"${fs.realpathSync(root)}"`);
  expect(start).toContain('"approvalPolicy":"never"');
  expect(start).toContain('"sandbox":"workspace-write"');
  expect(await usage).toEqual({ inputTokens: null, outputTokens: null });
});

test("startCodexTurn resolves only once the thread is known, so the caller can save it before the turn runs", async () => {
  unflag("ask");
  const t = turn({ permissionMode: "auto" });
  const { stream } = await t.started;
  expect(t.sessions).toEqual(["thr_new"]);
  await collect(stream);
});

test("a known thread is resumed, not started again", async () => {
  unflag("unknown");
  const t = turn({ sessionId: "thr_old" });
  await collect((await t.started).stream);
  expect(requests().some((r) => r.startsWith("thread/resume") && r.includes("thr_old"))).toBe(true);
  expect(t.sessions).toEqual([]);
});

test("a thread Codex no longer knows starts a new one and records it", async () => {
  flag("unknown");
  const t = turn({ sessionId: "thr_gone" });
  const parts = await collect((await t.started).stream);
  expect(t.sessions).toEqual(["thr_new"]);
  expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });
  unflag("unknown");
});

test("ask: an approval is put to the user, and allowing it lets the command run", async () => {
  flag("ask");
  const t = turn();
  const reading = collect((await t.started).stream);
  const pending = await waitFor(() => registry.listPendingQuestions(t.runId)[0]);
  expect(pending.questions[0].question).toContain("pwd");
  registry.resolveQuestion(t.runId, pending.questionId, ["Izinkan sekali"]);
  const parts = await reading;
  expect(parts.find((p) => p.type === "tool-result").output).toContain("/ws");
  expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });
  unflag("ask");
});

test("ask: an approval nobody answers ends the turn with an abort, never hanging", async () => {
  flag("ask");
  const t = turn();
  const reading = collect((await t.started).stream);
  await waitFor(() => registry.listPendingQuestions(t.runId)[0]);
  registry.stopRun(t.runId);
  const parts = await reading;
  expect(parts.at(-1)).toEqual({ type: "abort" });
  unflag("ask");
});

test("Stop sends turn/interrupt and the stream ends with an abort", async () => {
  flag("ask");
  const t = turn();
  const reading = collect((await t.started).stream);
  await waitFor(() => registry.listPendingQuestions(t.runId)[0]);
  registry.stopRun(t.runId);
  const parts = await reading;
  expect(parts.at(-1)).toEqual({ type: "abort" });
  expect(requests().some((r) => r.startsWith("turn/interrupt"))).toBe(true);
  unflag("ask");
});

test("a server that dies mid-turn ends the stream with an error, not a hang", async () => {
  unflag("ask");
  stopCodexServers();
  flag("dies");
  const t = turn();
  const parts = await collect((await t.started).stream);
  expect(parts.find((p) => p.type === "error")).toBeTruthy();
  expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: "error" });
  unflag("dies");
});
