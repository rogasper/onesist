/**
 * Pi's session events become the parts a native turn produces.
 *
 *   bun test src/server/agent/cli/pi/stream-mapper.test.ts
 */
import { expect, test } from "bun:test";
import { createPiMapper } from "./stream-mapper";

const delta = (d: string) => ({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: d } });

test("a text answer streams as text, and agent_end finishes the turn", () => {
  const m = createPiMapper("anthropic/claude");
  const parts = [
    ...m.map({ type: "agent_start" }),
    ...m.map({ type: "turn_start" }),
    ...m.map({ type: "message_start", message: { role: "assistant" } }),
    ...m.map(delta("halo")),
    ...m.map({ type: "message_end", message: { role: "assistant" } }),
    ...m.map({ type: "turn_end" }),
    ...m.map({ type: "agent_end" }),
  ] as any[];
  expect(parts.map((p) => p.type)).toEqual(["start", "start-step", "text-start", "text-delta", "text-end", "finish-step", "finish"]);
  expect(parts.find((p) => p.type === "text-delta").text).toBe("halo");
  expect(parts.at(-1).finishReason).toBe("stop");
  expect(m.done).toBe(true);
});

test("thinking streams as reasoning", () => {
  const m = createPiMapper("m");
  const parts = [
    ...m.map({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", delta: "pikir" } }),
  ] as any[];
  expect(parts.map((p) => p.type)).toEqual(["start", "start-step", "reasoning-start", "reasoning-delta"]);
  expect(parts.at(-1).text).toBe("pikir");
});

test("a tool call starts with its name and input, and finishes with its output", () => {
  const m = createPiMapper("m");
  const parts = [
    ...m.map({ type: "tool_execution_start", toolCallId: "tc1", toolName: "bash", args: { command: "pwd" } }),
    ...m.map({ type: "tool_execution_end", toolCallId: "tc1", toolName: "bash", result: { content: [{ type: "text", text: "/ws" }] }, isError: false }),
  ] as any[];
  expect(parts.find((p) => p.type === "tool-call")).toMatchObject({ toolCallId: "tc1", toolName: "bash", input: { command: "pwd" }, dynamic: true });
  expect(parts.find((p) => p.type === "tool-result").output).toBe("/ws");
});

test("a tool that fails is a tool error with its message", () => {
  const m = createPiMapper("m");
  const parts = [
    ...m.map({ type: "tool_execution_start", toolCallId: "tc2", toolName: "edit", args: { path: "a.md" } }),
    ...m.map({ type: "tool_execution_end", toolCallId: "tc2", toolName: "edit", result: { content: [{ type: "text", text: "berkas tidak ada" }] }, isError: true }),
  ] as any[];
  expect(parts.find((p) => p.type === "tool-error").error).toContain("berkas tidak ada");
});

test("usage from get_session_stats is reported at the end", () => {
  const m = createPiMapper("m");
  m.setUsage({ input: 120, output: 30 });
  expect(m.usage()).toEqual({ inputTokens: 120, outputTokens: 30 });
  const end = m.finish() as any[];
  expect(end.at(-1).totalUsage.outputTokens).toBe(30);
});

test("Stop ends with an abort; an error ends with error and finish", () => {
  expect((createPiMapper("m").finish({ aborted: true }) as any[]).map((p) => p.type)).toEqual(["start", "abort"]);
  expect((createPiMapper("m").finish({ error: new Error("rusak") }) as any[]).map((p) => p.type)).toEqual(["start", "error", "finish"]);
});

test("an extension error is shown as an error part but does not end the turn", () => {
  const m = createPiMapper("m");
  const parts = m.map({ type: "extension_error", error: "gagal dimuat" }) as any[];
  expect(parts.find((p) => p.type === "error").error.message).toContain("gagal dimuat");
  expect(m.done).toBe(false);
});
