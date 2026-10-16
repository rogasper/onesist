/**
 * Agent SDK messages (`query()` with includePartialMessages) → AI SDK `TextStreamPart`s for one
 * turn. Text and thinking come from `stream_event` deltas, so the finished `assistant` message's
 * text blocks are not emitted again. Tool calls come from that message's `tool_use` blocks (their
 * input is complete there); results from the `user` message's `tool_result` blocks. Messages of a
 * subagent (non-null `parent_tool_use_id`) are left out in v1. `result` is kept; the caller ends
 * the turn with `finish()`.
 */
import type { LanguageModelUsage, TextStreamPart, ToolSet } from "~/server/agent/ai";
import { toolOutputText } from "~/server/agent/cli/opencode/stream-mapper";

type Part = TextStreamPart<ToolSet>;

const PERFORMANCE = { effectiveOutputTokensPerSecond: 0, outputTokensPerSecond: undefined, inputTokensPerSecond: undefined, effectiveTotalTokensPerSecond: 0, stepTimeMs: 0, responseTimeMs: 0 };

export interface ClaudeMapper {
  map(msg: any): Part[];
  finish(opts?: { aborted?: boolean; error?: unknown }): Part[];
  readonly started: boolean;
  readonly sessionId: string | null;
  usage(): { inputTokens: number | null; outputTokens: number | null };
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((c: any) => (c?.type === "text" && typeof c.text === "string" ? c.text : "")).join("");
}

export function createClaudeMapper(modelId: string): ClaudeMapper {
  let started = false;
  let sessionId: string | null = null;
  let messageId = "msg";
  let stepOutput: number | undefined;
  let result: any = null;
  const blocks = new Map<number, { kind: "text" | "reasoning"; id: string }>();
  const tools = new Map<string, { name: string; input: unknown }>();
  const begin = (): Part[] => {
    if (started) return [];
    started = true;
    return [{ type: "start" } as Part];
  };
  const totalUsage = (): LanguageModelUsage => {
    const u = result?.usage;
    const input = typeof u?.input_tokens === "number" ? u.input_tokens : undefined;
    const output = typeof u?.output_tokens === "number" ? u.output_tokens : undefined;
    return { inputTokens: input, outputTokens: output, totalTokens: input !== undefined || output !== undefined ? (input ?? 0) + (output ?? 0) : undefined, inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: u?.cache_read_input_tokens, cacheWriteTokens: u?.cache_creation_input_tokens }, outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined } } as any;
  };

  function streamEvent(e: any): Part[] {
    switch (e?.type) {
      case "message_start":
        messageId = String(e.message?.id ?? messageId);
        blocks.clear();
        stepOutput = undefined;
        return [...begin(), { type: "start-step", request: {}, warnings: [] } as Part];
      case "content_block_start": {
        const kind = e.content_block?.type === "text" ? "text" : e.content_block?.type === "thinking" ? "reasoning" : null;
        if (!kind) return [];
        const id = `${messageId}:${e.index}`;
        blocks.set(e.index, { kind, id });
        return [...begin(), { type: kind === "text" ? "text-start" : "reasoning-start", id } as Part];
      }
      case "content_block_delta": {
        const b = blocks.get(e.index);
        if (!b) return [];
        if (e.delta?.type === "text_delta") return [{ type: "text-delta", id: b.id, text: String(e.delta.text ?? "") } as Part];
        if (e.delta?.type === "thinking_delta") return [{ type: "reasoning-delta", id: b.id, text: String(e.delta.thinking ?? "") } as Part];
        return [];
      }
      case "content_block_stop": {
        const b = blocks.get(e.index);
        if (!b) return [];
        blocks.delete(e.index);
        return [{ type: b.kind === "text" ? "text-end" : "reasoning-end", id: b.id } as Part];
      }
      case "message_delta":
        if (typeof e.usage?.output_tokens === "number") stepOutput = e.usage.output_tokens;
        return [];
      case "message_stop":
        return [
          {
            type: "finish-step",
            response: { id: messageId, timestamp: new Date(), modelId },
            usage: { inputTokens: undefined, outputTokens: stepOutput, totalTokens: stepOutput, inputTokenDetails: {}, outputTokenDetails: {} } as any,
            performance: PERFORMANCE,
            finishReason: "stop",
            rawFinishReason: undefined,
            providerMetadata: undefined,
          } as Part,
        ];
      default:
        return [];
    }
  }

  return {
    get started() {
      return started;
    },
    get sessionId() {
      return sessionId;
    },
    usage() {
      const u = result?.usage;
      return { inputTokens: typeof u?.input_tokens === "number" ? u.input_tokens : null, outputTokens: typeof u?.output_tokens === "number" ? u.output_tokens : null };
    },
    map(msg: any): Part[] {
      if (msg?.parent_tool_use_id) return [];
      switch (msg?.type) {
        case "system":
          if (msg.subtype === "init") {
            sessionId = typeof msg.session_id === "string" ? msg.session_id : sessionId;
            return begin();
          }
          return [];
        case "stream_event":
          return streamEvent(msg.event);
        case "assistant": {
          const parts: Part[] = [];
          for (const block of msg.message?.content ?? []) {
            if (block?.type !== "tool_use" || tools.has(block.id)) continue;
            tools.set(block.id, { name: String(block.name), input: block.input ?? {} });
            parts.push({ type: "tool-input-start", id: block.id, toolName: String(block.name), dynamic: true } as Part);
            parts.push({ type: "tool-call", toolCallId: block.id, toolName: String(block.name), input: block.input ?? {}, dynamic: true } as Part);
          }
          return parts.length ? [...begin(), ...parts] : [];
        }
        case "user": {
          const parts: Part[] = [];
          const content = Array.isArray(msg.message?.content) ? msg.message.content : [];
          for (const block of content) {
            if (block?.type !== "tool_result") continue;
            const id = String(block.tool_use_id);
            const { name: toolName, input } = tools.get(id) ?? { name: "tool", input: {} };
            const text = resultText(block.content);
            parts.push(
              block.is_error
                ? ({ type: "tool-error", toolCallId: id, toolName, input, error: text || "Tool gagal.", dynamic: true } as Part)
                : ({ type: "tool-result", toolCallId: id, toolName, input, output: toolOutputText(text), dynamic: true } as Part),
            );
          }
          return parts;
        }
        case "result":
          result = msg;
          if (typeof msg.session_id === "string") sessionId = msg.session_id;
          return [];
        default:
          return [];
      }
    },
    finish(opts: { aborted?: boolean; error?: unknown } = {}): Part[] {
      const parts = begin();
      if (opts.aborted) return [...parts, { type: "abort" } as Part];
      const failed = result && (result.is_error || result.subtype !== "success");
      const error = opts.error ?? (failed ? new Error(`Claude Code: ${result.subtype}${Array.isArray(result.errors) && result.errors.length ? ` — ${result.errors.join("; ")}` : ""}`) : null);
      if (error) return [...parts, { type: "error", error } as Part, { type: "finish", finishReason: "error", rawFinishReason: undefined, totalUsage: totalUsage() } as Part];
      return [...parts, { type: "finish", finishReason: "stop", rawFinishReason: undefined, totalUsage: totalUsage() } as Part];
    },
  };
}
