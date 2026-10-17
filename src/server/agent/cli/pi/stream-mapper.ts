/**
 * Pi session events → AI SDK `TextStreamPart`s for one turn. Text and thinking come from
 * `message_update.assistantMessageEvent`; tools from `tool_execution_*`; `agent_end` ends the
 * turn. Usage is not in the events: the caller asks `get_session_stats` at the end and passes
 * it in with `setUsage`. Pi's own tool names (bash, read, write, edit) are shown as they are.
 */
import type { LanguageModelUsage, TextStreamPart, ToolSet } from "~/server/agent/ai";
import { toolOutputText } from "~/server/agent/cli/opencode/stream-mapper";
import type { PiRecord } from "./jsonl";

type Part = TextStreamPart<ToolSet>;

const PERFORMANCE = { effectiveOutputTokensPerSecond: 0, outputTokensPerSecond: undefined, inputTokensPerSecond: undefined, effectiveTotalTokensPerSecond: 0, stepTimeMs: 0, responseTimeMs: 0 };

function textOf(result: any): string {
  const content = Array.isArray(result?.content) ? result.content : [];
  return content.map((c: any) => (c?.type === "text" && typeof c.text === "string" ? c.text : "")).join("");
}

export function createPiMapper(modelId: string) {
  let started = false;
  let done = false;
  let stepOpen = false;
  let textOpen = false;
  let reasoningOpen = false;
  let usage: { input: number; output: number } | null = null;
  const toolInputs = new Map<string, unknown>();

  const begin = (): Part[] => {
    if (started) return [];
    started = true;
    return [{ type: "start" } as Part];
  };
  const openStep = (): Part[] => {
    if (stepOpen) return [];
    stepOpen = true;
    return [{ type: "start-step", request: {}, warnings: [] } as Part];
  };
  const totalUsage = (): LanguageModelUsage =>
    ({ inputTokens: usage?.input, outputTokens: usage?.output, totalTokens: usage ? usage.input + usage.output : undefined, inputTokenDetails: {}, outputTokenDetails: {} }) as any;

  return {
    get done() {
      return done;
    },
    usage(): { inputTokens: number | null; outputTokens: number | null } {
      return usage ? { inputTokens: usage.input, outputTokens: usage.output } : { inputTokens: null, outputTokens: null };
    },
    setUsage(u: { input: number; output: number }) {
      usage = u;
    },
    map(r: PiRecord): Part[] {
      switch (r.type) {
        case "agent_start":
          return begin();
        case "message_update": {
          const e = r.assistantMessageEvent ?? {};
          const parts: Part[] = [...begin(), ...openStep()];
          if (e.type === "text_delta") {
            if (!textOpen) {
              textOpen = true;
              parts.push({ type: "text-start", id: "text" } as Part);
            }
            parts.push({ type: "text-delta", id: "text", text: String(e.delta ?? "") } as Part);
          } else if (e.type === "thinking_delta") {
            if (!reasoningOpen) {
              reasoningOpen = true;
              parts.push({ type: "reasoning-start", id: "reasoning" } as Part);
            }
            parts.push({ type: "reasoning-delta", id: "reasoning", text: String(e.delta ?? "") } as Part);
          }
          return parts;
        }
        case "message_end": {
          const parts: Part[] = [];
          if (textOpen) {
            textOpen = false;
            parts.push({ type: "text-end", id: "text" } as Part);
          }
          if (reasoningOpen) {
            reasoningOpen = false;
            parts.push({ type: "reasoning-end", id: "reasoning" } as Part);
          }
          return parts;
        }
        case "tool_execution_start": {
          const id = String(r.toolCallId);
          toolInputs.set(id, r.args ?? {});
          return [...begin(), ...openStep(), { type: "tool-input-start", id, toolName: String(r.toolName), dynamic: true } as Part, { type: "tool-call", toolCallId: id, toolName: String(r.toolName), input: r.args ?? {}, dynamic: true } as Part];
        }
        case "tool_execution_end": {
          const id = String(r.toolCallId);
          const input = toolInputs.get(id) ?? {};
          if (r.isError) return [{ type: "tool-error", toolCallId: id, toolName: String(r.toolName), input, error: textOf(r.result) || "Tool gagal.", dynamic: true } as Part];
          return [{ type: "tool-result", toolCallId: id, toolName: String(r.toolName), input, output: toolOutputText(textOf(r.result)), dynamic: true } as Part];
        }
        case "extension_error":
          return [...begin(), { type: "error", error: new Error(`Ekstensi Pi: ${String(r.error ?? "gagal")}`) } as Part];
        case "agent_end": {
          done = true;
          return [...begin(), { type: "finish-step", response: { id: "pi", timestamp: new Date(), modelId }, usage: totalUsage(), performance: PERFORMANCE, finishReason: "stop", rawFinishReason: undefined, providerMetadata: undefined } as Part, { type: "finish", finishReason: "stop", rawFinishReason: undefined, totalUsage: totalUsage() } as Part];
        }
        default:
          return [];
      }
    },
    finish(opts: { aborted?: boolean; error?: unknown } = {}): Part[] {
      done = true;
      const parts = begin();
      if (opts.aborted) return [...parts, { type: "abort" } as Part];
      if (opts.error) return [...parts, { type: "error", error: opts.error } as Part, { type: "finish", finishReason: "error", rawFinishReason: undefined, totalUsage: totalUsage() } as Part];
      return [...parts, { type: "finish", finishReason: "stop", rawFinishReason: undefined, totalUsage: totalUsage() } as Part];
    },
  };
}
