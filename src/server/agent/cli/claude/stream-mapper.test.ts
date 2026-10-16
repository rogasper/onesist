/**
 * Agent SDK messages become the parts a native turn produces.
 *
 *   bun test src/server/agent/cli/claude/stream-mapper.test.ts
 */
import { expect, test } from "bun:test";
import { createClaudeMapper } from "./stream-mapper";

const SID = "6f1c2c1e-1b7a-4f1e-9a49-2f8f1d1a0b11";
const init = { type: "system", subtype: "init", session_id: SID, model: "claude-sonnet-5-5", cwd: "/ws", tools: ["Bash"], mcp_servers: [], permissionMode: "default" };
const ev = (event: any) => ({ type: "stream_event", event, parent_tool_use_id: null, session_id: SID });

test("a streamed text answer is one step with its text; the result finishes it with usage", () => {
  const m = createClaudeMapper("claude-sonnet-5-5");
  const parts = [
    ...m.map(init),
    ...m.map(ev({ type: "message_start", message: { id: "msg_1" } })),
    ...m.map(ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } })),
    ...m.map(ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ha" } })),
    ...m.map(ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo" } })),
    ...m.map(ev({ type: "content_block_stop", index: 0 })),
    ...m.map(ev({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } })),
    ...m.map(ev({ type: "message_stop" })),
    ...m.map({ type: "assistant", message: { id: "msg_1", content: [{ type: "text", text: "halo" }] }, parent_tool_use_id: null, session_id: SID }),
    ...m.map({ type: "result", subtype: "success", is_error: false, result: "halo", session_id: SID, usage: { input_tokens: 12, output_tokens: 3 }, total_cost_usd: 0.001, permission_denials: [] }),
  ] as any[];
  expect(parts.map((p) => p.type)).toEqual(["start", "start-step", "text-start", "text-delta", "text-delta", "text-end", "finish-step"]);
  expect(parts.filter((p) => p.type === "text-delta").map((p) => p.text).join("")).toBe("halo");
  expect(m.sessionId).toBe(SID);
  const end = m.finish() as any[];
  expect(end.map((p) => p.type)).toEqual(["finish"]);
  expect(end[0].finishReason).toBe("stop");
  expect(m.usage()).toEqual({ inputTokens: 12, outputTokens: 3 });
});

test("thinking streams as reasoning", () => {
  const m = createClaudeMapper("m");
  const parts = [
    ...m.map(ev({ type: "message_start", message: { id: "msg_2" } })),
    ...m.map(ev({ type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } })),
    ...m.map(ev({ type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "pikir" } })),
    ...m.map(ev({ type: "content_block_stop", index: 0 })),
  ] as any[];
  expect(parts.map((p) => p.type)).toEqual(["start", "start-step", "reasoning-start", "reasoning-delta", "reasoning-end"]);
});

test("a tool call comes from the assistant message with its whole input; its result from the user message", () => {
  const m = createClaudeMapper("m");
  const parts = [
    ...m.map({ type: "assistant", message: { id: "msg_3", content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "pwd" } }] }, parent_tool_use_id: null }),
    ...m.map({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: [{ type: "text", text: "/ws" }], is_error: false }] }, parent_tool_use_id: null }),
  ] as any[];
  expect(parts.find((p) => p.type === "tool-call")).toMatchObject({ toolCallId: "toolu_1", toolName: "Bash", input: { command: "pwd" }, dynamic: true });
  expect(parts.find((p) => p.type === "tool-result")).toMatchObject({ toolCallId: "toolu_1", toolName: "Bash", output: "/ws" });
});

test("a refused or failed tool is a tool error with its message; string content works too", () => {
  const m = createClaudeMapper("m");
  m.map({ type: "assistant", message: { id: "msg_4", content: [{ type: "tool_use", id: "toolu_2", name: "Edit", input: { file_path: "/ws/a.md" } }] }, parent_tool_use_id: null });
  const parts = m.map({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_2", content: "Ditolak oleh pengguna.", is_error: true }] }, parent_tool_use_id: null }) as any[];
  expect(parts[0]).toMatchObject({ type: "tool-error", toolCallId: "toolu_2", toolName: "Edit", error: "Ditolak oleh pengguna." });
});

test("a subagent's messages are left out", () => {
  const m = createClaudeMapper("m");
  expect(m.map({ type: "assistant", message: { id: "msg_s", content: [{ type: "tool_use", id: "toolu_s", name: "Read", input: {} }] }, parent_tool_use_id: "toolu_task" })).toEqual([]);
  expect(m.map({ type: "stream_event", event: { type: "message_start", message: { id: "x" } }, parent_tool_use_id: "toolu_task" })).toEqual([]);
});

test("an error result ends with error and finish; Stop with an abort", () => {
  const m = createClaudeMapper("m");
  m.map({ type: "result", subtype: "error_during_execution", is_error: true, session_id: SID, usage: { input_tokens: 1, output_tokens: 0 }, errors: ["model overloaded"] });
  const end = m.finish() as any[];
  expect(end.map((p) => p.type)).toEqual(["start", "error", "finish"]);
  expect(String(end[1].error.message)).toContain("error_during_execution");
  expect(end[2].finishReason).toBe("error");
  expect((createClaudeMapper("m").finish({ aborted: true }) as any[]).map((p) => p.type)).toEqual(["start", "abort"]);
});
