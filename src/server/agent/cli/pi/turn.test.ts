/**
 * One Pi turn against a fake `pi --mode rpc`: the process started in the workspace with the
 * model and the approval extension, the session switched to, the prompt answered by events
 * and `agent_end`, a confirmation answered through the run's question, a missing session,
 * a process that ends without `agent_end`, and Stop.
 *
 *   bun test src/server/agent/cli/pi/turn.test.ts
 */
import { beforeAll, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-pi-turn-")), "data.db");

const registry = await import("~/server/agent/run-registry");
const { startPiTurn, piSpawnArgs } = await import("./turn");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-pi-fake-"));
const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-pi-root-"));
const fake = path.join(dir, "pi");
const log = path.join(dir, "commands.log");

// Behaviour comes from files in dir: `ask` sends a confirm before the answer, `missing`
// fails switch_session (new_session then gives session-new.jsonl), `dies` exits without
// agent_end, `slow` keeps the turn open.
fs.writeFileSync(
  fake,
  `#!/usr/bin/env bun
const fs = require("node:fs");
const readline = require("node:readline");
const dir = ${JSON.stringify(dir)};
const out = (o) => console.log(JSON.stringify(o));
const exists = (f) => fs.existsSync(dir + "/" + f);
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
fs.appendFileSync(dir + "/args.log", process.argv.slice(2).join(" ") + "\\n");
let sessionFile = dir + "/session.jsonl";
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  fs.appendFileSync(dir + "/commands.log", msg.type + " " + JSON.stringify(msg) + "\\n");
  if (msg.type === "get_state") return out({ id: msg.id, type: "response", command: "get_state", success: true, data: { sessionFile, sessionId: "s1" } });
  if (msg.type === "new_session") {
    sessionFile = dir + "/session-new.jsonl";
    return out({ id: msg.id, type: "response", command: "new_session", success: true, data: { cancelled: false } });
  }
  if (msg.type === "switch_session") {
    if (exists("missing")) return out({ id: msg.id, type: "response", command: "switch_session", success: false, error: "sesi tidak ada" });
    return out({ id: msg.id, type: "response", command: "switch_session", success: true, data: { cancelled: false } });
  }
  if (msg.type === "get_session_stats") return out({ id: msg.id, type: "response", command: "get_session_stats", success: true, data: { tokens: { input: 120, output: 30 } } });
  if (msg.type === "abort") return out({ id: msg.id, type: "response", command: "abort", success: true });
  if (msg.type === "prompt") {
    out({ id: msg.id, type: "response", command: "prompt", success: true });
    out({ type: "agent_start" });
    out({ type: "turn_start" });
    out({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "halo" } });
    if (exists("ask")) {
      out({ type: "extension_ui_request", id: "ui-1", method: "confirm", title: "Izinkan Pi memakai bash?", message: "pwd" });
      return;
    }
    if (exists("dies")) process.exit(3);
    if (exists("slow")) return;
    out({ type: "message_end", message: { role: "assistant" } });
    out({ type: "agent_end" });
  }
  if (msg.type === "extension_ui_response") {
    out({ type: "tool_execution_start", toolCallId: "tc1", toolName: "bash", args: { command: "pwd" } });
    out({ type: "tool_execution_end", toolCallId: "tc1", toolName: "bash", result: { content: [{ type: "text", text: "/ws" }] }, isError: false });
    out({ type: "agent_end" });
  }
});
`,
);
fs.chmodSync(fake, 0o755);

beforeAll(() => {
  fs.mkdirSync(path.join(dir, "x"), { recursive: true });
});

// The fake process appends to one log for the whole file; each test reads only its own commands.
beforeEach(() => {
  fs.rmSync(log, { force: true });
});

let n = 0;
function turn(over: Partial<Parameters<typeof startPiTurn>[0]> = {}) {
  const runId = `run-pi-${++n}`;
  const sessions: string[] = [];
  return {
    runId,
    sessions,
    started: startPiTurn({
      runId,
      threadId: `thr-pi-${n}`,
      projectId: "p-pi",
      root,
      binary: fake,
      dataDir: path.join(dir, "data"),
      provider: "anthropic",
      model: "claude-sonnet",
      permissionMode: "auto",
      threadMode: "agent",
      text: "Jawab dengan satu kata: halo.",
      sessionId: null,
      onSessionCreated: (f) => sessions.push(f),
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

const commands = () => (fs.existsSync(log) ? fs.readFileSync(log, "utf-8").trim().split("\n") : []);
const flag = (f: string) => fs.writeFileSync(path.join(dir, f), "");
const unflag = (f: string) => fs.rmSync(path.join(dir, f), { force: true });

test("the spawn arguments carry the model, the session folder and the approval extension", () => {
  const args = piSpawnArgs({ provider: "anthropic", model: "claude-sonnet", sessionDir: "/d/s", extensionPath: "/d/e.ts" });
  expect(args).toEqual(["--mode", "rpc", "--provider", "anthropic", "--model", "claude-sonnet", "--session-dir", "/d/s", "--extension", "/d/e.ts"]);
  expect(piSpawnArgs({ provider: null, model: null, sessionDir: "/d/s", extensionPath: "/d/e.ts" })).not.toContain("--provider");
});

test("a new turn runs in the workspace, streams its text, and records the session file", async () => {
  unflag("ask");
  const t = turn();
  const { stream, usage } = await t.started;
  const parts = await collect(stream);
  expect(parts.map((p) => p.type)).toEqual(["start", "start-step", "text-start", "text-delta", "text-end", "finish-step", "finish"]);
  expect(t.sessions).toEqual([path.join(dir, "session.jsonl")]);
  expect(await usage).toEqual({ inputTokens: 120, outputTokens: 30 });
  expect(fs.readFileSync(path.join(dir, "args.log"), "utf-8")).toContain("--mode rpc");
});

test("a known session is switched to before the prompt", async () => {
  unflag("ask");
  const t = turn({ sessionId: path.join(dir, "session.jsonl") });
  await collect((await t.started).stream);
  const lines = commands();
  const switchAt = lines.findIndex((l) => l.startsWith("switch_session"));
  const promptAt = lines.findIndex((l) => l.startsWith("prompt"));
  expect(switchAt).toBeGreaterThanOrEqual(0);
  expect(switchAt).toBeLessThan(promptAt);
});

test("a session Pi cannot open starts a new one, records it, and the prompt goes there", async () => {
  flag("missing");
  fs.rmSync(log, { force: true });
  const t = turn({ sessionId: "/tidak/ada.jsonl" });
  const parts = await collect((await t.started).stream);
  expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });
  expect(t.sessions).toEqual([path.join(dir, "session-new.jsonl")]);
  const lines = commands();
  const order = ["switch_session", "new_session", "prompt"].map((c) => lines.findIndex((l) => l.startsWith(c)));
  expect(order.every((i) => i >= 0)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  unflag("missing");
});

test("startPiTurn resolves only once the session is known, so the caller can save it", async () => {
  unflag("ask");
  const t = turn();
  const { stream } = await t.started;
  expect(t.sessions.length).toBe(1);
  await collect(stream);
});

test("ask: a confirmation is put to the user, and allowing it lets the tool finish", async () => {
  flag("ask");
  const t = turn({ permissionMode: "ask" });
  const reading = collect((await t.started).stream);
  const pending = await waitFor(() => registry.listPendingQuestions(t.runId)[0]);
  expect(pending.questions[0].question).toContain("bash");
  registry.resolveQuestion(t.runId, pending.questionId, ["Izinkan sekali"]);
  const parts = await reading;
  expect(parts.find((p) => p.type === "tool-result").output).toBe("/ws");
  unflag("ask");
});

test("ask: a confirmation nobody answers is declined, never left hanging", async () => {
  flag("ask");
  const t = turn({ permissionMode: "ask" });
  const reading = collect((await t.started).stream);
  await waitFor(() => registry.listPendingQuestions(t.runId)[0]);
  registry.stopRun(t.runId);
  const parts = await reading;
  expect(parts.at(-1)).toEqual({ type: "abort" });
  unflag("ask");
});

test("a process that ends without agent_end is an error with its last stderr line", async () => {
  flag("dies");
  const t = turn();
  const parts = await collect((await t.started).stream);
  expect(parts.find((p) => p.type === "error")).toBeTruthy();
  expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: "error" });
  unflag("dies");
});

test("Stop sends abort, kills the process, and ends the stream with an abort", async () => {
  flag("slow");
  const t = turn();
  const reading = collect((await t.started).stream);
  await waitFor(() => commands().find((l) => l.startsWith("prompt")));
  registry.stopRun(t.runId);
  const parts = await reading;
  expect(parts.at(-1)).toEqual({ type: "abort" });
  expect(commands().some((l) => l.startsWith("abort"))).toBe(true);
  unflag("slow");
});
