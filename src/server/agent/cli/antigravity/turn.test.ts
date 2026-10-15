/**
 * One Antigravity turn against a fake `agy` that replays the spike's events: the stream, the
 * conversation handed back, a refused action allowed (or not) through the run's question, the
 * policy flags, Stop killing the process, and a process that ends without a result.
 *
 *   bun test src/server/agent/cli/antigravity/turn.test.ts
 */
import { beforeAll, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-agy-turn-")), "data.db");

const registry = await import("~/server/agent/run-registry");
const { ALLOWED_TURN, CONV, DENIED_TURN, TEXT_TURN, toJsonl } = await import("./test-fixtures");
const { liveAgyProcesses, startAgyTurn, stopAgyProcesses } = await import("./turn");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-agy-fake-"));
const fake = path.join(dir, "agy");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-agy-root-"));

beforeAll(() => {
  // Replays deny.jsonl, or skip.jsonl when permissions are skipped. `slow` keeps the process
  // alive after the first line; `broken` fails without a result. Every call is logged.
  fs.writeFileSync(
    fake,
    `#!/bin/sh
D="$FAKE_AGY_DIR"
printf '%s\\n' "$*" >> "$D/args.log"
pwd >> "$D/cwd.log"
if [ -f "$D/broken" ]; then echo "jetski: tidak bisa login" >&2; exit 3; fi
if [ -f "$D/slow" ]; then head -n 1 "$D/deny.jsonl"; exec sleep 30; fi
case " $* " in
  *" --dangerously-skip-permissions "*) cat "$D/skip.jsonl";;
  *) cat "$D/deny.jsonl";;
esac
`,
  );
  fs.chmodSync(fake, 0o755);
  process.env.FAKE_AGY_DIR = dir;
});

beforeEach(() => {
  for (const f of ["args.log", "cwd.log", "slow", "broken", "deny.jsonl", "skip.jsonl"]) fs.rmSync(path.join(dir, f), { force: true });
});

const replay = (deny: any[], skip: any[] = []) => {
  fs.writeFileSync(path.join(dir, "deny.jsonl"), toJsonl(deny));
  fs.writeFileSync(path.join(dir, "skip.jsonl"), toJsonl(skip));
};
const calls = () => (fs.existsSync(path.join(dir, "args.log")) ? fs.readFileSync(path.join(dir, "args.log"), "utf-8").trim().split("\n") : []);

let n = 0;
function turn(over: Partial<Parameters<typeof startAgyTurn>[0]> = {}) {
  const runId = `run-agy-${++n}`;
  const sessions: string[] = [];
  const started = startAgyTurn({
    runId,
    threadId: `thr-agy-${n}`,
    projectId: "p-agy",
    root,
    binary: fake,
    model: "gemini-3.8-flash-low",
    policy: "ask",
    text: "Jawab dengan satu kata: halo.",
    sessionId: null,
    onSessionCreated: (id) => sessions.push(id),
    ...over,
  });
  return { runId, sessions, started };
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

test("a text turn streams like a native one, in the workspace, and hands back its conversation", async () => {
  replay(TEXT_TURN);
  const t = turn();
  const { stream, usage } = await t.started;
  const parts = await collect(stream);
  expect(parts.map((p) => p.type)).toEqual(["start", "start-step", "text-start", "text-delta", "text-delta", "text-end", "finish-step", "finish"]);
  expect(t.sessions).toEqual([CONV]);
  expect(await usage).toEqual({ inputTokens: 13434, outputTokens: 20 });
  expect(calls()).toEqual(["-p Jawab dengan satu kata: halo. --output-format stream-json --print-timeout 60m --model gemini-3.8-flash-low"]);
  expect(fs.readFileSync(path.join(dir, "cwd.log"), "utf-8").trim()).toBe(fs.realpathSync(root));
  expect(liveAgyProcesses()).toBe(0);
});

test("a known conversation is resumed; a different id from agy is recorded as a new session", async () => {
  replay(TEXT_TURN);
  const same = turn({ sessionId: CONV });
  await collect((await same.started).stream);
  expect(calls()[0]).toContain(`--conversation ${CONV}`);
  expect(same.sessions).toEqual([]);

  const stale = turn({ sessionId: "11111111-2222-4333-8444-555555555555" });
  await collect((await stale.started).stream);
  expect(stale.sessions).toEqual([CONV]);
});

test("ask: a refused action is asked about after the process, and allowing it continues the turn with permissions skipped", async () => {
  replay(DENIED_TURN, ALLOWED_TURN);
  const t = turn({ text: "Jalankan pwd" });
  const { stream, usage } = await t.started;
  const reading = collect(stream);
  const pending = await waitFor(() => registry.listPendingQuestions(t.runId)[0]);
  expect(pending.questions[0].question).toContain("ditolak: RunCommand");
  expect(pending.questions[0].options).toEqual(["Izinkan semua & lanjutkan", "Tolak"]);
  registry.resolveQuestion(t.runId, pending.questionId, ["Izinkan semua & lanjutkan"]);
  const parts = await reading;

  const log = calls();
  expect(log.length).toBe(2);
  expect(log[0]).not.toContain("--dangerously-skip-permissions");
  expect(log[1]).toContain(`--conversation ${CONV}`);
  expect(log[1]).toContain("--dangerously-skip-permissions");
  expect(log[1]).toContain("sekarang diberikan. Lanjutkan tugas dari pesan sebelumnya.");
  expect(parts.filter((p) => p.type === "tool-error").length).toBe(1);
  expect(parts.filter((p) => p.type === "tool-result").length).toBe(2);
  expect(parts.filter((p) => p.type === "start").length).toBe(1);
  expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });
  expect(await usage).toEqual({ inputTokens: 27111 + 29348, outputTokens: 257 + 795 });
});

test("ask: refusing keeps the refusal and runs nothing more", async () => {
  replay(DENIED_TURN, ALLOWED_TURN);
  const t = turn();
  const { stream } = await t.started;
  const reading = collect(stream);
  const pending = await waitFor(() => registry.listPendingQuestions(t.runId)[0]);
  registry.resolveQuestion(t.runId, pending.questionId, ["Tolak"]);
  const parts = await reading;
  expect(calls().length).toBe(1);
  expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });
});

test("deny never asks; skip passes the flag from the first process", async () => {
  replay(DENIED_TURN, ALLOWED_TURN);
  const denied = turn({ policy: "deny" });
  await collect((await denied.started).stream);
  expect(calls().length).toBe(1);
  expect(registry.listPendingQuestions(denied.runId)).toEqual([]);

  fs.rmSync(path.join(dir, "args.log"), { force: true });
  const skipped = turn({ policy: "skip" });
  const parts = await collect((await skipped.started).stream);
  expect(calls()).toHaveLength(1);
  expect(calls()[0]).toContain("--dangerously-skip-permissions");
  expect(parts.filter((p) => p.type === "tool-result").length).toBe(2);
});

test("Stop ends the agy process and the stream with an abort", async () => {
  replay(TEXT_TURN);
  fs.writeFileSync(path.join(dir, "slow"), "");
  const t = turn();
  const { stream } = await t.started;
  const reading = collect(stream);
  await waitFor(() => liveAgyProcesses() === 1);
  registry.stopRun(t.runId);
  const parts = await reading;
  expect(parts.at(-1)).toEqual({ type: "abort" });
  await waitFor(() => liveAgyProcesses() === 0);
});

test("a process that ends without a result is an error naming its last stderr line", async () => {
  replay(TEXT_TURN);
  fs.writeFileSync(path.join(dir, "broken"), "");
  const t = turn();
  const parts = await collect((await t.started).stream);
  const err = parts.find((p) => p.type === "error");
  expect(String(err.error.message)).toBe("Antigravity berhenti tanpa hasil (kode 3): jetski: tidak bisa login.");
  expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: "error" });
});

test("a prompt too long for the platform is refused before agy starts", async () => {
  replay(TEXT_TURN);
  const t = turn({ text: "x".repeat(30_001), platform: "win32" });
  const parts = await collect((await t.started).stream);
  expect(String(parts.find((p) => p.type === "error").error.message)).toContain("terlalu panjang");
  expect(calls()).toEqual([]);
});

test("stopAgyProcesses ends every live agy process", async () => {
  replay(TEXT_TURN);
  fs.writeFileSync(path.join(dir, "slow"), "");
  const t = turn();
  const reading = collect((await t.started).stream);
  await waitFor(() => liveAgyProcesses() === 1);
  stopAgyProcesses();
  await waitFor(() => liveAgyProcesses() === 0);
  registry.stopRun(t.runId);
  await reading;
});
