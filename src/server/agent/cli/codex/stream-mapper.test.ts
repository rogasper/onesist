/**
 * Codex notifications become the parts a native turn produces, for one thread only.
 *
 *   bun test src/server/agent/cli/codex/stream-mapper.test.ts
 */
import { expect, test } from "bun:test";
import { createCodexMapper } from "./stream-mapper";

const T = "thr_a";
const n = (method: string, params: Record<string, unknown> = {}) => ({ method, params: { threadId: T, turnId: "t1", ...params } });

test("an agent message streams as text; the turn's completion ends it with usage", () => {
  const m = createCodexMapper(T, "gpt-x");
  const parts = [
    ...m.map(n("turn/started")),
    ...m.map(n("item/started", { item: { type: "agentMessage", id: "i1", text: "" }, startedAtMs: 1 })),
    ...m.map(n("item/agentMessage/delta", { itemId: "i1", delta: "halo" })),
    ...m.map(n("item/completed", { item: { type: "agentMessage", id: "i1", text: "halo" } })),
    ...m.map(n("thread/tokenUsage/updated", { tokenUsage: { total: { inputTokens: 10, outputTokens: 4 } } })),
    ...m.map(n("turn/completed", { turn: { id: "t1", status: "completed", error: null, durationMs: 9 } })),
  ] as any[];
  expect(parts.map((p) => p.type)).toEqual(["start", "text-start", "text-delta", "text-end", "finish"]);
  expect(parts.find((p) => p.type === "text-delta").text).toBe("halo");
  expect(parts.at(-1).finishReason).toBe("stop");
  expect(m.done).toBe(true);
  expect(m.usage()).toEqual({ inputTokens: 10, outputTokens: 4 });
});

test("a command runs as a bash tool: its call at start, its output and exit code at completion", () => {
  const m = createCodexMapper(T, "gpt-x");
  const parts = [
    ...m.map(n("item/started", { item: { type: "commandExecution", id: "c1", command: "pwd", cwd: "/ws", status: "inProgress", commandActions: [] } })),
    ...m.map(n("item/completed", { item: { type: "commandExecution", id: "c1", command: "pwd", cwd: "/ws", status: "completed", aggregatedOutput: "/ws\n", exitCode: 0, commandActions: [] } })),
  ] as any[];
  expect(parts.find((p) => p.type === "tool-call")).toMatchObject({ toolName: "bash", input: { command: "pwd" }, dynamic: true });
  const res = parts.find((p) => p.type === "tool-result");
  expect(res.output).toContain("/ws");
  expect(res.output).toContain("exit=0");
});

test("a declined command is a tool error; a failed turn is an error then finish", () => {
  const m = createCodexMapper(T, "gpt-x");
  const parts = [
    ...m.map(n("item/started", { item: { type: "commandExecution", id: "c2", command: "rm x", cwd: "/ws", status: "declined", commandActions: [] } })),
    ...m.map(n("item/completed", { item: { type: "commandExecution", id: "c2", command: "rm x", cwd: "/ws", status: "declined", commandActions: [] } })),
    ...m.map(n("turn/completed", { turn: { id: "t1", status: "failed", error: { message: "kuota habis" }, durationMs: 1 } })),
  ] as any[];
  expect(parts.find((p) => p.type === "tool-error").error).toContain("ditolak");
  expect(parts.filter((p) => p.type === "error").length).toBe(1);
  expect(parts.at(-1)).toMatchObject({ type: "finish", finishReason: "error" });
});

test("notifications of other threads are ignored", () => {
  const m = createCodexMapper(T, "gpt-x");
  expect(m.map({ method: "item/agentMessage/delta", params: { threadId: "thr_b", turnId: "t", itemId: "i", delta: "x" } })).toEqual([]);
  expect(m.done).toBe(false);
});

test("finish after a stop ends with an abort; after an outside error, with error and finish", () => {
  expect((createCodexMapper(T, "m").finish({ aborted: true }) as any[]).map((p) => p.type)).toEqual(["start", "abort"]);
  expect((createCodexMapper(T, "m").finish({ error: new Error("server mati") }) as any[]).map((p) => p.type)).toEqual(["start", "error", "finish"]);
});
