/**
 * Antigravity (`agy -p … --output-format stream-json`) events → AI SDK `TextStreamPart`s, the
 * parts the native agent produces, so the chat route stores and streams an AGY turn like any
 * other. Shapes recorded from agy 1.2.2 on 2026-10-16 (test-fixtures.ts):
 * init → step_update (user_input | system_message | agent_response | tool) → result.
 *
 * One mapper serves a whole Onesist turn, which can span two agy processes (a refused action
 * allowed afterwards). So `finish` is not emitted on `result`; the caller asks for it once,
 * at the very end. AGY's tools are not Onesist tools: they are emitted as dynamic tools.
 */
import type { LanguageModelUsage, TextStreamPart, ToolSet } from "~/server/agent/ai";
import { toolOutputText } from "~/server/agent/cli/opencode/stream-mapper";

type Part = TextStreamPart<ToolSet>;

export interface AgyUsage {
  input_tokens?: number;
  output_tokens?: number;
  thinking_tokens?: number;
  cache_read_tokens?: number;
  total_tokens?: number;
}
export interface AgyDenied {
  action?: string;
  display_name?: string;
}
export interface AgyResult {
  conversation_id?: string;
  status?: string;
  response?: string;
  error?: unknown;
  usage?: AgyUsage;
  denied_actions?: AgyDenied[];
}
export interface AgyEvent {
  event?: string;
  conversation_id?: string;
  init?: any;
  step_update?: any;
  result?: AgyResult;
  error?: any;
}

const PERFORMANCE = {
  effectiveOutputTokensPerSecond: 0,
  outputTokensPerSecond: undefined,
  inputTokensPerSecond: undefined,
  effectiveTotalTokensPerSecond: 0,
  stepTimeMs: 0,
  responseTimeMs: 0,
};

export function usageFromAgy(u: AgyUsage | undefined): LanguageModelUsage {
  const input = u?.input_tokens;
  const output = u?.output_tokens;
  return {
    inputTokens: input,
    inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: u?.cache_read_tokens, cacheWriteTokens: undefined },
    outputTokens: output,
    outputTokenDetails: { textTokens: undefined, reasoningTokens: u?.thinking_tokens },
    totalTokens: input !== undefined || output !== undefined ? (input ?? 0) + (output ?? 0) : undefined,
  };
}

export interface AgyMapper {
  map(event: AgyEvent): Part[];
  /** The parts that end the Onesist turn: called once, after the last agy process. */
  finish(opts?: { aborted?: boolean; error?: unknown }): Part[];
  readonly conversationId: string | null;
  readonly lastResult: AgyResult | null;
  usage(): { inputTokens: number | null; outputTokens: number | null };
}

const errorText = (e: unknown) => (typeof e === "string" ? e : e && typeof e === "object" && "message" in e ? String((e as any).message) : JSON.stringify(e));

export function createAgyMapper(modelId: string): AgyMapper {
  let started = false;
  let conversationId: string | null = null;
  let lastResult: AgyResult | null = null;
  let failure: Error | null = null;
  let input = 0;
  let output = 0;
  let sawUsage = false;
  const openSteps = new Set<number>();
  const openText = new Set<number>();
  const toolInputs = new Map<number, unknown>();

  const begin = (): Part[] => {
    if (started) return [];
    started = true;
    return [{ type: "start" } as Part];
  };
  // step_index restarts in a new conversation, so ids carry the conversation too.
  const prefix = () => (conversationId ?? "agy").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const textId = (i: number) => `agy:${prefix()}:${i}`;
  const toolId = (i: number) => `agy_${prefix()}_${i}`;

  function agentResponse(s: any): Part[] {
    const i = Number(s.step_index ?? 0);
    const parts: Part[] = [];
    if (!openSteps.has(i)) {
      openSteps.add(i);
      parts.push({ type: "start-step", request: {}, warnings: [] } as Part);
    }
    const delta = typeof s.text_delta === "string" ? s.text_delta : "";
    if (delta) {
      if (!openText.has(i)) {
        openText.add(i);
        parts.push({ type: "text-start", id: textId(i) } as Part);
      }
      parts.push({ type: "text-delta", id: textId(i), text: delta } as Part);
    }
    if (s.state === "DONE") {
      if (openText.has(i)) {
        openText.delete(i);
        parts.push({ type: "text-end", id: textId(i) } as Part);
      }
      openSteps.delete(i);
      parts.push({
        type: "finish-step",
        response: { id: textId(i), timestamp: new Date(), modelId },
        usage: usageFromAgy(s.usage),
        performance: PERFORMANCE,
        finishReason: "stop",
        rawFinishReason: undefined,
        providerMetadata: undefined,
      } as Part);
    }
    return parts;
  }

  function tool(s: any): Part[] {
    const i = Number(s.step_index ?? 0);
    const info = s.tool_info ?? {};
    const name = String(s.tool_name ?? info.name ?? "tool");
    const parts: Part[] = [];
    if (!toolInputs.has(i)) {
      const toolInput = info.parameters ?? {};
      toolInputs.set(i, toolInput);
      parts.push({ type: "tool-input-start", id: toolId(i), toolName: name, dynamic: true } as Part);
      parts.push({ type: "tool-call", toolCallId: toolId(i), toolName: name, input: toolInput, dynamic: true } as Part);
    }
    if (s.state === "DONE") {
      parts.push({ type: "tool-result", toolCallId: toolId(i), toolName: name, input: toolInputs.get(i) ?? {}, output: toolOutputText(info.output ?? ""), dynamic: true } as Part);
    } else if (s.state === "ERROR") {
      parts.push({
        type: "tool-error",
        toolCallId: toolId(i),
        toolName: name,
        input: toolInputs.get(i) ?? {},
        error: info.error ? errorText(info.error) : "Tool gagal.",
        dynamic: true,
      } as Part);
    }
    return parts;
  }

  const totalUsage = () => (sawUsage ? usageFromAgy({ input_tokens: input, output_tokens: output }) : usageFromAgy(undefined));

  return {
    get conversationId() {
      return conversationId;
    },
    get lastResult() {
      return lastResult;
    },
    usage() {
      return sawUsage ? { inputTokens: input, outputTokens: output } : { inputTokens: null, outputTokens: null };
    },
    map(event) {
      if (event.event === "init") {
        conversationId = event.conversation_id ?? conversationId;
        return begin();
      }
      if (event.event === "step_update") {
        const s = event.step_update ?? {};
        if (s.step_type === "agent_response") return [...begin(), ...agentResponse(s)];
        if (s.step_type === "tool") return [...begin(), ...tool(s)];
        return [];
      }
      if (event.event === "result") {
        const r = event.result ?? {};
        lastResult = r;
        if (r.usage) {
          sawUsage = true;
          input += r.usage.input_tokens ?? 0;
          output += r.usage.output_tokens ?? 0;
        }
        if (r.status && r.status !== "SUCCESS") failure = new Error(`Antigravity ${r.status}${r.error ? `: ${errorText(r.error)}` : ""}`);
        return [];
      }
      if (event.event === "error") {
        failure = new Error(event.error ? errorText(event.error) : "Antigravity gagal menjalankan permintaan.");
        return [];
      }
      return [];
    },
    finish(opts = {}) {
      const parts = begin();
      if (opts.aborted) return [...parts, { type: "abort" } as Part];
      const error = opts.error ?? failure;
      if (error) {
        return [
          ...parts,
          { type: "error", error } as Part,
          { type: "finish", finishReason: "error", rawFinishReason: undefined, totalUsage: totalUsage() } as Part,
        ];
      }
      return [...parts, { type: "finish", finishReason: "stop", rawFinishReason: undefined, totalUsage: totalUsage() } as Part];
    },
  };
}
