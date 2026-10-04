/**
 * SERVER BARREL — the only file on the server side allowed to import the AI SDK.
 *
 * Why it exists (PRD FR-A11 / ADR-001 D6.2): AI SDK API naming has changed
 * several times already (`maxSteps` → `stopWhen`/`isStepCount`, `needsApproval`
 * → `toolApproval`, `toUIMessageStreamResponse` → `createUIMessageStreamResponse`)
 * and `ToolLoopAgent` is still exported twice as `Experimental_Agent`. By
 * centralising imports here, a version bump means touching one file instead of
 * the whole app.
 *
 * DO NOT import `ai` directly from any other file. Verify with:
 *   grep -rn 'from "ai"' src/ | grep -v 'src/server/agent/ai.ts'
 *
 * The client side has its own barrel: `src/lib/ai-client.ts` (for `useChat`).
 */

// ── Core: tool & loop ────────────────────────────────────────────────────────
export { tool, ToolLoopAgent, isStepCount, stepCountIs, pruneMessages, hasToolCall, isLoopFinished } from "ai";

// ── Core: text generation ────────────────────────────────────────────────────
export { streamText, generateText } from "ai";

// ── UI message stream (transport chat) ───────────────────────────────────────
export {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  readUIMessageStream,
  validateUIMessages,
  safeValidateUIMessages,
} from "ai";

// ── Continuing the loop after approval (FR-E4) ──────────────────────────────
export { lastAssistantMessageIsCompleteWithApprovalResponses, lastAssistantMessageIsCompleteWithToolCalls } from "ai";

// ── Utilities ────────────────────────────────────────────────────────────────
export { wrapLanguageModel, defaultSettingsMiddleware, simulateReadableStream } from "ai";

// ── Provider factories ───────────────────────────────────────────────────────
export { createOpenAICompatible } from "@ai-sdk/openai-compatible";
export { createOpenAI } from "@ai-sdk/openai";
export { createAnthropic } from "@ai-sdk/anthropic";

// ── Types ────────────────────────────────────────────────────────────────────

// Types imported specifically for use INSIDE this file: `export { X } from "ai"`
// does not bring that name into this module's scope, while the aliases below need
// a local reference.
import type { ToolLoopAgent as ToolLoopAgentType } from "ai";

/** Stream result from `agent.stream()`. The route uses it to wrap the stream as
 *  a UI message stream without having to spell out its four generic parameters. */
export type AgentStream = Awaited<ReturnType<ToolLoopAgentType<any, any, any, any>["stream"]>>;
export type {
  UIMessage,
  UIMessagePart,
  UIMessageChunk,
  ToolSet,
  Tool,
  LanguageModel,
  ModelMessage,
  ToolApprovalStatus,
  ToolApprovalConfiguration,
  PrepareStepResult,
  PrepareStepFunction,
  StopCondition,
  StreamTextResult,
  GenerateTextResult,
  TypedToolCall,
  TypedToolResult,
  TextStreamPart,
  LanguageModelUsage,
  FinishReason,
} from "ai";
