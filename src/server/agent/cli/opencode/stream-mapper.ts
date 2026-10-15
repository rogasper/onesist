/**
 * OpenCode 2 events → AI SDK `TextStreamPart`s, the same parts the native agent
 * produces, so the chat route stores, records and streams an OpenCode turn exactly
 * like a native one. OpenCode's tools are not Onesist tools: they are emitted as
 * dynamic tools. Events of other sessions (one server serves them all) are dropped.
 *
 * Seen in the 2026-10-15 spike: execution/step/text/tool/usage events below.
 * Mapped by analogy and harmless if never sent: reasoning.*, tool.error/failed,
 * execution.failed/interrupted.
 */
import type { FinishReason, LanguageModelUsage, TextStreamPart, ToolSet } from "~/server/agent/ai";
import type { OpenCodeEvent } from "./sse";

export const CLI_TOOL_OUTPUT_MAX_CHARS = 256_000;

export interface OcTokens {
  input?: number;
  output?: number;
  reasoning?: number;
  cache?: { read?: number; write?: number };
}

type Part = TextStreamPart<ToolSet>;

const FINISH_REASONS: readonly string[] = ["stop", "length", "content-filter", "tool-calls", "error", "other"];

export function usageFromTokens(tokens: OcTokens | undefined): LanguageModelUsage {
  const input = tokens?.input;
  const output = tokens?.output;
  return {
    inputTokens: input,
    inputTokenDetails: { noCacheTokens: undefined, cacheReadTokens: tokens?.cache?.read, cacheWriteTokens: tokens?.cache?.write },
    outputTokens: output,
    outputTokenDetails: { textTokens: undefined, reasoningTokens: tokens?.reasoning },
    totalTokens: input !== undefined || output !== undefined ? (input ?? 0) + (output ?? 0) : undefined,
  };
}

/** A tool's content blocks as text, cut at CLI_TOOL_OUTPUT_MAX_CHARS. */
export function toolOutputText(content: unknown): string {
  const text = Array.isArray(content)
    ? content.map((c: any) => (c?.type === "text" && typeof c.text === "string" ? c.text : "")).join("")
    : typeof content === "string"
      ? content
      : JSON.stringify(content ?? "");
  if (text.length <= CLI_TOOL_OUTPUT_MAX_CHARS) return text;
  return `${text.slice(0, CLI_TOOL_OUTPUT_MAX_CHARS)}\n\n… dipotong: ${text.length - CLI_TOOL_OUTPUT_MAX_CHARS} karakter tidak ditampilkan.`;
}

const PERFORMANCE = {
  effectiveOutputTokensPerSecond: 0,
  outputTokensPerSecond: undefined,
  inputTokensPerSecond: undefined,
  effectiveTotalTokensPerSecond: 0,
  stepTimeMs: 0,
  responseTimeMs: 0,
};

export interface OpenCodeMapper {
  map(event: OpenCodeEvent): Part[];
  readonly done: boolean;
  usage(): { inputTokens: number | null; outputTokens: number | null };
}

/**
 * OpenCode names an MCP tool `<server>_<tool>`, so Onesist's tools arrive as
 * `onesist_onesist_thread_list`; the transcript shows the tool's own name.
 */
export function displayToolName(name: string): string {
  return name.startsWith("onesist_onesist_") ? name.slice("onesist_".length) : name;
}

export function createOpenCodeMapper(sessionId: string, modelId: string): OpenCodeMapper {
  let started = false;
  let done = false;
  let lastFinish: FinishReason = "stop";
  let rawFinish: string | undefined;
  let totals: OcTokens | undefined;
  let lastStepTokens: OcTokens | undefined;
  const toolNames = new Map<string, string>();
  const toolInputs = new Map<string, unknown>();

  const begin = (): Part[] => {
    if (started) return [];
    started = true;
    return [{ type: "start" } as Part];
  };
  const blockId = (d: any) => `${d.assistantMessageID ?? "msg"}:${d.ordinal ?? 0}`;
  const toolName = (d: any) => displayToolName(toolNames.get(d.id) ?? (typeof d.name === "string" ? d.name : "tool"));

  return {
    get done() {
      return done;
    },
    usage() {
      const t = totals ?? lastStepTokens;
      return { inputTokens: t?.input ?? null, outputTokens: t?.output ?? null };
    },
    map(event) {
      const d: any = event.data ?? {};
      if (done || d.sessionID !== sessionId) return [];
      switch (event.type) {
        case "session.execution.started":
          return begin();
        case "session.step.started":
          return [...begin(), { type: "start-step", request: {}, warnings: [] } as Part];
        case "session.text.started":
          return [...begin(), { type: "text-start", id: blockId(d) } as Part];
        case "session.text.delta":
          return [{ type: "text-delta", id: blockId(d), text: String(d.delta ?? "") } as Part];
        case "session.text.ended":
          return [{ type: "text-end", id: blockId(d) } as Part];
        case "session.reasoning.started":
          return [...begin(), { type: "reasoning-start", id: blockId(d) } as Part];
        case "session.reasoning.delta":
          return [{ type: "reasoning-delta", id: blockId(d), text: String(d.delta ?? "") } as Part];
        case "session.reasoning.ended":
          return [{ type: "reasoning-end", id: blockId(d) } as Part];
        case "session.tool.input.started":
          toolNames.set(d.id, toolName(d));
          return [...begin(), { type: "tool-input-start", id: d.id, toolName: toolName(d), dynamic: true } as Part];
        case "session.tool.called":
          toolNames.set(d.id, toolName(d));
          toolInputs.set(d.id, d.input ?? {});
          return [{ type: "tool-call", toolCallId: d.id, toolName: toolName(d), input: d.input ?? {}, dynamic: true } as Part];
        case "session.tool.success":
          return [
            {
              type: "tool-result",
              toolCallId: d.id,
              toolName: toolName(d),
              input: toolInputs.get(d.id) ?? {},
              output: toolOutputText(d.content),
              dynamic: true,
            } as Part,
          ];
        case "session.tool.error":
        case "session.tool.failed":
          return [
            {
              type: "tool-error",
              toolCallId: d.id,
              toolName: toolName(d),
              input: toolInputs.get(d.id) ?? {},
              error: String(d.error?.message ?? d.message ?? d.error ?? "Tool gagal."),
              dynamic: true,
            } as Part,
          ];
        case "session.step.ended":
          lastFinish = (FINISH_REASONS.includes(d.finish) ? d.finish : "other") as FinishReason;
          rawFinish = typeof d.rawFinish === "string" ? d.rawFinish : undefined;
          lastStepTokens = d.tokens;
          return [
            {
              type: "finish-step",
              response: { id: String(d.assistantMessageID ?? ""), timestamp: new Date(), modelId },
              usage: usageFromTokens(d.tokens),
              performance: PERFORMANCE,
              finishReason: lastFinish,
              rawFinishReason: rawFinish,
              providerMetadata: undefined,
            } as Part,
          ];
        case "session.usage.updated":
          totals = d.tokens;
          return [];
        case "session.execution.succeeded":
          done = true;
          return [...begin(), { type: "finish", finishReason: lastFinish, rawFinishReason: rawFinish, totalUsage: usageFromTokens(totals ?? lastStepTokens) } as Part];
        case "session.execution.failed":
          done = true;
          return [
            ...begin(),
            { type: "error", error: new Error(String(d.error?.message ?? d.message ?? "OpenCode gagal menjalankan permintaan.")) } as Part,
            { type: "finish", finishReason: "error", rawFinishReason: undefined, totalUsage: usageFromTokens(totals ?? lastStepTokens) } as Part,
          ];
        case "session.execution.interrupted":
          done = true;
          return [...begin(), { type: "abort" } as Part];
        default:
          return [];
      }
    },
  };
}
