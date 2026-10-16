/**
 * Antigravity events become the parts a native turn produces.
 *
 *   bun test src/server/agent/cli/antigravity/stream-mapper.test.ts
 */
import { expect, test } from "bun:test";
import { ALLOWED_TURN, CONV, DENIED_TURN, TEXT_TURN } from "./test-fixtures";
import { createAgyMapper, usageFromAgy } from "./stream-mapper";

const mapAll = (events: any[], mapper = createAgyMapper("gemini-3.8-flash-low")) => events.flatMap((e) => mapper.map(e));

test("a text answer becomes start, one step with its text, and no finish until the turn ends", () => {
  const mapper = createAgyMapper("gemini-3.8-flash-low");
  const parts = mapAll(TEXT_TURN, mapper) as any[];
  expect(parts.map((p) => p.type)).toEqual(["start", "start-step", "text-start", "text-delta", "text-delta", "text-end", "finish-step"]);
  expect(parts.filter((p) => p.type === "text-delta").map((p) => p.text).join("")).toBe("halo\n");
  expect(parts.find((p) => p.type === "finish-step").usage.inputTokens).toBe(13434);
  expect(mapper.conversationId).toBe(CONV);
  expect(mapper.lastResult?.status).toBe("SUCCESS");

  const end = mapper.finish() as any[];
  expect(end.map((p) => p.type)).toEqual(["finish"]);
  expect(end[0].finishReason).toBe("stop");
  expect(end[0].totalUsage.outputTokens).toBe(20);
  expect(mapper.usage()).toEqual({ inputTokens: 13434, outputTokens: 20 });
});

test("a refused tool is a tool call and a tool error; the result keeps the denied actions", () => {
  const mapper = createAgyMapper("m");
  const parts = mapAll(DENIED_TURN, mapper) as any[];
  const call = parts.find((p) => p.type === "tool-call");
  expect(call).toMatchObject({ toolName: "run_command", input: { CommandLine: "pwd" }, dynamic: true });
  const err = parts.find((p) => p.type === "tool-error");
  expect(err.toolCallId).toBe(call.toolCallId);
  expect(err.error).toContain("user denied permission");
  expect(mapper.lastResult?.denied_actions).toEqual([{ action: "command", display_name: "RunCommand" }]);
  // A thinking-only response step still closes as a step.
  expect(parts.filter((p) => p.type === "finish-step").length).toBe(1);
});

test("tools that ran give their output; two processes of one turn share one mapper and one usage", () => {
  const mapper = createAgyMapper("m");
  mapAll(DENIED_TURN, mapper);
  const parts = mapAll(ALLOWED_TURN, mapper) as any[];
  const results = parts.filter((p) => p.type === "tool-result");
  expect(results.map((r) => [r.toolName, r.output])).toEqual([
    ["run_command", "/ws\r\n"],
    ["write_to_file", ""],
  ]);
  // Ids are unique across the two processes (step_index keeps counting).
  const ids = parts.filter((p) => p.type === "tool-call").map((p) => p.toolCallId);
  expect(new Set(ids).size).toBe(ids.length);
  expect(parts.filter((p) => p.type === "start").length).toBe(0); // started by the first process
  expect(mapper.usage()).toEqual({ inputTokens: 27111 + 29348, outputTokens: 257 + 795 });
});

test("a tool step seen only when it is done still gets its call first", () => {
  const parts = mapAll([
    { event: "init", conversation_id: CONV },
    { event: "step_update", step_update: { step_index: 3, state: "DONE", step_type: "tool", tool_name: "view_file", tool_info: { parameters: { AbsolutePath: "/ws/a.md" }, output: "isi" } } },
  ]) as any[];
  expect(parts.map((p) => p.type)).toEqual(["start", "tool-input-start", "tool-call", "tool-result"]);
});

test("a failed result, an error event, an abort and an outside error each end the turn their own way", () => {
  const failed = createAgyMapper("m");
  mapAll([{ event: "init", conversation_id: CONV }, { event: "result", result: { status: "ERROR", error: "kuota habis" } }], failed);
  const f = failed.finish() as any[];
  expect(f.map((p) => p.type)).toEqual(["error", "finish"]);
  expect(String(f[0].error.message)).toContain("kuota habis");
  expect(f[1].finishReason).toBe("error");

  const evented = createAgyMapper("m");
  mapAll([{ event: "error", error: { message: "rusak" } }], evented);
  expect((evented.finish() as any[]).map((p) => p.type)).toEqual(["start", "error", "finish"]);

  expect((createAgyMapper("m").finish({ aborted: true }) as any[]).map((p) => p.type)).toEqual(["start", "abort"]);
  const outside = createAgyMapper("m").finish({ error: new Error("berhenti tanpa hasil") }) as any[];
  expect(outside.map((p) => p.type)).toEqual(["start", "error", "finish"]);
});

test("usage keeps reasoning and cache reads; no usage reads as unknown", () => {
  const u = usageFromAgy({ input_tokens: 10, output_tokens: 4, thinking_tokens: 3, cache_read_tokens: 2 });
  expect(u.inputTokens).toBe(10);
  expect(u.outputTokens).toBe(4);
  expect(u.totalTokens).toBe(14);
  expect(u.outputTokenDetails.reasoningTokens).toBe(3);
  expect(u.inputTokenDetails.cacheReadTokens).toBe(2);
  expect(usageFromAgy(undefined).totalTokens).toBeUndefined();
  expect(createAgyMapper("m").usage()).toEqual({ inputTokens: null, outputTokens: null });
});
