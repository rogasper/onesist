/**
 * OpenCode events become AI SDK stream parts that the chat route already turns
 * into a stored message: text, dynamic tools with their output, steps, usage.
 * The last test runs the parts through the AI SDK itself, as the route does.
 *
 *   bun test src/server/agent/cli/opencode/stream-mapper.test.ts
 */
import { expect, test } from "bun:test";
import { readUIMessageStream, toUIMessageStream } from "ai";
import { CLI_TOOL_OUTPUT_MAX_CHARS, createOpenCodeMapper, displayToolName, toolOutputText, usageFromTokens } from "./stream-mapper";
import type { OpenCodeEvent } from "./sse";

const S = "ses_map";
const ev = (type: string, data: Record<string, any> = {}): OpenCodeEvent => ({ type, data: { sessionID: S, ...data } });
const tokens = (input: number, output: number) => ({ input, output, reasoning: 0, cache: { read: 0, write: 0 } });

const TURN: OpenCodeEvent[] = [
  ev("session.execution.started"),
  { type: "session.text.delta", data: { sessionID: "ses_other", assistantMessageID: "x", ordinal: 0, delta: "BOCOR" } },
  ev("session.step.started", { assistantMessageID: "msg_a" }),
  ev("session.tool.input.started", { assistantMessageID: "msg_a", id: "call_1", name: "shell" }),
  ev("session.tool.called", { assistantMessageID: "msg_a", id: "call_1", input: { command: "ls -la" }, executed: false }),
  ev("session.tool.success", { assistantMessageID: "msg_a", id: "call_1", content: [{ type: "text", text: "total 0\n" }], metadata: { exit: 0 } }),
  ev("session.step.ended", { assistantMessageID: "msg_a", finish: "tool-calls", rawFinish: "TOOL_CALLS", tokens: tokens(100, 5) }),
  ev("session.step.started", { assistantMessageID: "msg_b" }),
  ev("session.text.started", { assistantMessageID: "msg_b", ordinal: 0 }),
  ev("session.text.delta", { assistantMessageID: "msg_b", ordinal: 0, delta: "O" }),
  ev("session.text.delta", { assistantMessageID: "msg_b", ordinal: 0, delta: "K" }),
  ev("session.text.ended", { assistantMessageID: "msg_b", ordinal: 0 }),
  ev("session.step.ended", { assistantMessageID: "msg_b", finish: "stop", rawFinish: "STOP", tokens: tokens(120, 2) }),
  ev("session.usage.updated", { tokens: tokens(220, 7) }),
  ev("session.execution.succeeded"),
];

const partsOf = (events: OpenCodeEvent[]) => {
  const mapper = createOpenCodeMapper(S, "p/m");
  return { parts: events.flatMap((e) => mapper.map(e)), mapper };
};

test("a turn maps to start, steps, a dynamic tool, text and finish", () => {
  const { parts, mapper } = partsOf(TURN);
  expect(parts.map((p) => p.type)).toEqual([
    "start", "start-step", "tool-input-start", "tool-call", "tool-result", "finish-step",
    "start-step", "text-start", "text-delta", "text-delta", "text-end", "finish-step", "finish",
  ]);
  const call: any = parts.find((p) => p.type === "tool-call");
  expect(call).toMatchObject({ toolCallId: "call_1", toolName: "shell", input: { command: "ls -la" }, dynamic: true });
  const result: any = parts.find((p) => p.type === "tool-result");
  expect(result).toMatchObject({ toolCallId: "call_1", toolName: "shell", output: "total 0\n", dynamic: true });
  const finish: any = parts.at(-1);
  expect(finish.finishReason).toBe("stop");
  expect(finish.totalUsage.inputTokens).toBe(220);
  expect(mapper.done).toBe(true);
  expect(mapper.usage()).toEqual({ inputTokens: 220, outputTokens: 7 });
});

test("events of another session never leak into this turn", () => {
  const { parts } = partsOf(TURN);
  expect(parts.some((p: any) => p.type === "text-delta" && p.text === "BOCOR")).toBe(false);
});

test("nothing is mapped after the turn ended", () => {
  const mapper = createOpenCodeMapper(S, "p/m");
  for (const e of TURN) mapper.map(e);
  expect(mapper.map(ev("session.text.delta", { assistantMessageID: "msg_b", ordinal: 0, delta: "late" }))).toEqual([]);
});

test("a failed execution becomes an error part and an error finish", () => {
  const { parts, mapper } = partsOf([ev("session.execution.started"), ev("session.execution.failed", { error: { message: "kuota habis" } })]);
  expect(parts.map((p) => p.type)).toEqual(["start", "error", "finish"]);
  expect(String((parts[1] as any).error?.message ?? (parts[1] as any).error)).toContain("kuota habis");
  expect((parts[2] as any).finishReason).toBe("error");
  expect(mapper.done).toBe(true);
});

test("an interrupted execution becomes an abort", () => {
  const { parts, mapper } = partsOf([ev("session.execution.started"), ev("session.execution.interrupted")]);
  expect(parts.map((p) => p.type)).toEqual(["start", "abort"]);
  expect(mapper.done).toBe(true);
});

test("an unknown finish reason becomes other; usage falls back to the last step", () => {
  const { parts, mapper } = partsOf([
    ev("session.step.started", { assistantMessageID: "m" }),
    ev("session.step.ended", { assistantMessageID: "m", finish: "weird", tokens: tokens(9, 1) }),
    ev("session.execution.succeeded"),
  ]);
  expect((parts.find((p) => p.type === "finish-step") as any).finishReason).toBe("other");
  expect(mapper.usage()).toEqual({ inputTokens: 9, outputTokens: 1 });
});

test("tool output is text, and over the limit it is cut with a note", () => {
  expect(toolOutputText([{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }])).toBe("ab");
  expect(toolOutputText("plain")).toBe("plain");
  const long = toolOutputText([{ type: "text", text: "x".repeat(CLI_TOOL_OUTPUT_MAX_CHARS + 10) }]);
  expect(long.startsWith("x".repeat(CLI_TOOL_OUTPUT_MAX_CHARS))).toBe(true);
  expect(long).toContain("dipotong: 10 karakter");
});

test("usage maps OpenCode tokens, totals included", () => {
  expect(usageFromTokens({ input: 3, output: 4, reasoning: 1, cache: { read: 2, write: 0 } })).toEqual({
    inputTokens: 3,
    inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: 2, cacheWriteTokens: 0 },
    outputTokens: 4,
    outputTokenDetails: { textTokens: undefined, reasoningTokens: 1 },
    totalTokens: 7,
  });
  expect(usageFromTokens(undefined).totalTokens).toBeUndefined();
});

test("the AI SDK turns the parts into one assistant message with text and a finished tool", async () => {
  const { parts } = partsOf(TURN);
  const stream = new ReadableStream<any>({
    start(controller) {
      for (const p of parts) controller.enqueue(p);
      controller.close();
    },
  });
  let last: any = null;
  for await (const message of readUIMessageStream({ stream: toUIMessageStream({ stream }) as any })) last = message;
  expect(last.role).toBe("assistant");
  expect(last.parts.find((p: any) => p.type === "text")?.text).toBe("OK");
  const tool = last.parts.find((p: any) => p.type === "dynamic-tool");
  expect(tool).toMatchObject({ toolName: "shell", toolCallId: "call_1", state: "output-available", output: "total 0\n" });
});

test("Onesist's MCP tools keep one onesist_ prefix in the transcript", () => {
  expect(displayToolName("onesist_onesist_thread_list")).toBe("onesist_thread_list");
  expect(displayToolName("onesist_thread_list")).toBe("onesist_thread_list");
  expect(displayToolName("bash")).toBe("bash");
});