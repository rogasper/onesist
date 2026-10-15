/**
 * Antigravity stream-json events as `agy` 1.2.2 printed them in the 2026-10-16 spike
 * (paths shortened to /ws, tool list trimmed). Tests replay them through a fake `agy`, so no
 * test calls the real CLI or a model.
 */
import type { AgyEvent } from "./stream-mapper";

export const CONV = "4cd04889-9baa-49dc-80a0-74254a50372a";

const step = (s: Record<string, unknown>): AgyEvent => ({ event: "step_update", step_update: { conversation_id: CONV, ...s } });
const usage = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, thinking_tokens: 19, cache_read_tokens: 0, total_tokens: input + output });
const init: AgyEvent = { event: "init", conversation_id: CONV, init: { model: "gemini-3.8-flash-low", cwd: "/ws", tools: ["ask_permission", "run_command", "write_to_file"] } };

/** "Jawab dengan satu kata: halo." */
export const TEXT_TURN: AgyEvent[] = [
  init,
  step({ step_index: 0, state: "DONE", step_type: "user_input" }),
  step({ step_index: 1, state: "ACTIVE", step_type: "agent_response", text_delta: "halo" }),
  step({ step_index: 1, state: "DONE", step_type: "agent_response", text_delta: "\n", duration_seconds: 2.75, usage: usage(13434, 20) }),
  { event: "result", result: { conversation_id: CONV, status: "SUCCESS", response: "halo\n", num_turns: 1, usage: usage(13434, 20) } },
];

/** `pwd` without --dangerously-skip-permissions: refused, listed in denied_actions. */
export const DENIED_TURN: AgyEvent[] = [
  init,
  step({ step_index: 2, state: "DONE", step_type: "user_input" }),
  step({ step_index: 3, state: "DONE", step_type: "system_message" }),
  step({ step_index: 4, state: "DONE", step_type: "agent_response", usage: usage(13677, 237) }),
  step({ step_index: 5, state: "ACTIVE", step_type: "tool", tool_name: "run_command", tool_info: { name: "run_command", parameters: { CommandLine: "pwd" } } }),
  step({
    step_index: 5,
    state: "ERROR",
    step_type: "tool",
    tool_name: "run_command",
    tool_info: {
      name: "run_command",
      parameters: { CommandLine: "pwd" },
      error: { type: "TOOL_ERROR", message: 'permission check failed for unsandboxed "pwd": user denied permission to run command:\npwd' },
    },
  }),
  {
    event: "result",
    result: { conversation_id: CONV, status: "SUCCESS", response: "", num_turns: 2, usage: usage(27111, 257), denied_actions: [{ action: "command", display_name: "RunCommand" }] },
  },
];

/** The same conversation continued with --dangerously-skip-permissions: pwd runs, a file is written. */
export const ALLOWED_TURN: AgyEvent[] = [
  init,
  step({ step_index: 6, state: "DONE", step_type: "user_input" }),
  step({ step_index: 8, state: "DONE", step_type: "agent_response", usage: usage(14296, 430) }),
  step({ step_index: 9, state: "ACTIVE", step_type: "tool", tool_name: "run_command", tool_info: { name: "run_command", parameters: { CommandLine: "pwd" } } }),
  step({ step_index: 9, state: "DONE", step_type: "tool", tool_name: "run_command", tool_info: { name: "run_command", parameters: { CommandLine: "pwd" }, output: "/ws\r\n" } }),
  step({ step_index: 10, state: "ACTIVE", step_type: "tool", tool_name: "write_to_file", tool_info: { name: "write_to_file", parameters: { TargetFile: "/ws/catatan.txt" } } }),
  step({ step_index: 10, state: "DONE", step_type: "tool", tool_name: "write_to_file", tool_info: { name: "write_to_file", parameters: { TargetFile: "/ws/catatan.txt" } } }),
  step({ step_index: 11, state: "ACTIVE", step_type: "agent_response", text_delta: "Hasil pwd: /ws" }),
  step({ step_index: 11, state: "DONE", step_type: "agent_response", text_delta: "\n", usage: usage(15052, 365) }),
  { event: "result", result: { conversation_id: CONV, status: "SUCCESS", response: "Hasil pwd: /ws\n", num_turns: 3, usage: usage(29348, 795) } },
];

export function toJsonl(events: AgyEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}
