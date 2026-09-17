/**
 * Agent loop (FR-B, FR-D7, FR-E).
 *
 * Assembles the AI SDK `ToolLoopAgent` with every decision already settled:
 * step limits, approvals, two-layer context use, and the Onesist tool set.
 * This file does NOT touch HTTP — routes wrap its result into a UI message
 * stream.
 */
import {
  ToolLoopAgent,
  convertToModelMessages,
  isStepCount,
  type LanguageModel,
  type ModelMessage,
  type AgentStream,
  type ToolSet,
  type UIMessage,
} from "./ai";
import { buildLanguageModel, resolveMaxOutputTokens, type ProviderRow } from "./config";
import { pruneForStep, resolveContextWindow, shouldCompact, summarizeOldest, type CompactionDecision } from "./context";
import { awaitApproval, createRun, finishRun, getApprovalSecret, persistStepCount, recordApprovalDecision, recoverInterruptedRuns, stopRun } from "./run-registry";
import { MUTATING_TOOLS, buildTools, type FileChange, type TodoItem } from "./tools";
import { isProtectedPath, type PermissionMode, type ThreadMode } from "./types";
import { newId } from "./store";

export { recoverInterruptedRuns, stopRun, getApprovalSecret };

export interface TurnInput {
  runId: string;
  threadId: string;
  projectId: string;
  root: string;
  provider: ProviderRow;
  permissionMode: PermissionMode;
  maxSteps: number;
  mode: ThreadMode;
  /** System prompt already assembled by `prompt.ts`. */
  system: string;
  /** Conversation history as UI messages. */
  messages: UIMessage[];
  summary?: string | null;
  /** Called on every successful write — routes use it to send the list of
   *  changed files to the UI in the same stream (FR-C5). */
  onFileChange?: (change: FileChange) => void;
  /** Called on every successful read, with the hash the agent saw (FR-C12). */
  onFileRead?: (info: { path: string; hash: string }) => void;
  onTodos?: (todos: TodoItem[]) => void;
  /** Called when context is compacted, so the user sees it (FR-B9).
   *  `summary` is passed along because the route must persist that summary —
   *  if it only lived in this turn's memory, the next compaction would start from
   *  zero and long conversations would lose context after restart. */
  onCompact?: (info: { estimatedBefore: number; estimatedAfter: number; summaryTokens: number; summary: string }) => void;
  onStepFinish?: (info: { stepCount: number }) => void;
}

/** Argument summary for the approval card — never send the full raw JSON
 *  to the UI (file contents can be tens of KB). */
function approvalPreview(name: string, input: any): string {
  if (!input || typeof input !== "object") return String(input ?? "");
  if (name === "bash") return String(input.command ?? "").slice(0, 300);
  const p = input.path ?? input.file_path ?? "";
  if (name === "write_file") return `${p} (${String(input.content ?? "").length} karakter)`;
  if (name === "edit_file") return `${p} — ganti ${String(input.old_string ?? "").length} → ${String(input.new_string ?? "").length} karakter`;
  return `${p}`.trim() || JSON.stringify(input).slice(0, 200);
}

/** Does this write touch a protected path (FR-E3)? Protected paths require
 *  confirmation NO MATTER the permission mode. */
function touchesProtectedPath(name: string, input: any): { protected: boolean; path?: string } {
  const p = input?.path ?? input?.file_path;
  if (typeof p !== "string") return { protected: false };
  if (isProtectedPath(p)) return { protected: true, path: p };
  return { protected: false, path: p };
}

export async function startTurn(input: TurnInput): Promise<AgentStream> {
  const run = createRun({ runId: input.runId, threadId: input.threadId, projectId: input.projectId });

  const model: LanguageModel = buildLanguageModel(input.provider);
  const maxOutputTokens = resolveMaxOutputTokens(input.provider);
  const contextWindow = resolveContextWindow(input.provider.contextWindow);

  // Ask mode must not change anything; readonly neither.
  const includeMutating = input.mode === "agent" && input.permissionMode !== "readonly";
  const tools = buildTools({
    projectId: input.projectId,
    root: input.root,
    threadId: input.threadId,
    includeMutating,
    onFileChange: input.onFileChange,
    onFileRead: input.onFileRead,
    onTodos: input.onTodos,
  });

  const modelMessages: ModelMessage[] = await convertToModelMessages(input.messages as any);

  let lastCompaction: CompactionDecision = { shouldCompact: false, estimatedTokens: 0, contextWindow, ratio: 0 };

  const agent = new ToolLoopAgent({
    model,
    // System prompt assembled by prompt.ts; do not let system messages ride along
    // in history or the user could inject a role via messages.
    instructions: input.system,
    allowSystemInMessages: false,
    tools,
    stopWhen: isStepCount(input.maxSteps),
    toolApproval: async ({ toolCall }) => {
      const name = toolCall.toolName;
      if (!MUTATING_TOOLS.has(name)) return "not-applicable";
      const toolCallId = (toolCall as any).toolCallId;
      if (input.permissionMode === "readonly") {
        recordApprovalDecision(input.runId, toolCallId, "denied-readonly");
        return "denied";
      }

      const args = (toolCall as any).input ?? {};
      const { protected: isProtected } = touchesProtectedPath(name, args);
      // Auto mode: passes automatically, EXCEPT protected paths.
      if (input.permissionMode === "auto" && !isProtected) {
        recordApprovalDecision(input.runId, toolCallId, "auto");
        return "approved";
      }

      const reason = isProtected
        ? `Menyentuh path terproteksi — perubahan di sini bisa merusak dokumen sumber atau konfigurasi skill.`
        : undefined;
      if (isProtected) recordApprovalDecision(input.runId, toolCallId, "protected-path");
      return await awaitApproval(input.runId, {
        toolCallId,
        name,
        preview: approvalPreview(name, args),
        reason,
      });
    },
    experimental_toolApprovalSecret: getApprovalSecret(),
    onStepFinish: async (event: any) => {
      run.stepCount = (event?.stepNumber ?? run.stepCount) + 1;
      persistStepCount(input.runId, run.stepCount);
      input.onStepFinish?.({ stepCount: run.stepCount });
    },
    prepareStep: async ({ messages, stepNumber }: { messages: ModelMessage[]; stepNumber: number }) => {
      // Layer 1 — cheap, every step.
      let next = pruneForStep(messages);

      // Layer 2 — only when still over budget after pruning.
      if (stepNumber > 0) {
        lastCompaction = shouldCompact(next, contextWindow);
        if (lastCompaction.shouldCompact) {
          const result = await summarizeOldest({
            model,
            messages: next,
            previousSummary: input.summary,
            maxOutputTokens,
          });
          if (result) {
            input.summary = result.summary;
            // The summary replaces the oldest messages; the rest is kept as-is
            // so the latest tool call still has its result paired.
            next = next.slice(result.compactedCount);
            input.onCompact?.({
              estimatedBefore: result.estimatedBefore,
              estimatedAfter: result.estimatedAfter,
              summaryTokens: Math.ceil(result.summary.length / 4),
              summary: result.summary,
            });
          }
        }
      }
      return { messages: next };
    },
  });

  // `messages` as history; the system prompt already went via `instructions`.
  return await agent.stream({
    messages: modelMessages,
    maxOutputTokens,
    abortSignal: run.abort.signal,
  } as any);
}

export function makeRunId(): string {
  return newId("run");
}

export { finishRun, persistStepCount };
