/**
 * Compaction of a thread's history: one service for the manual "Ringkas sekarang", and for the
 * automatic run before a turn when the context is already full (V6).
 *
 * Every compaction tells the open thread what is happening over `chat:compaction`, so the
 * transcript can show a divider while the summary is being written and again when it is done.
 */
import { convertToModelMessages, type LanguageModel } from "./ai";
import { COMPACT_THRESHOLD, estimateTokens, splitForCompaction, summarizeOldest } from "./context";
import { appendMessage, setThreadSummary, toUIMessages, updateThread, type MessageRow } from "./store";
import { eventBus } from "~/server/realtime/events";

/** Where a compaction came from. The client places the divider by this. */
export type CompactionAt = "before-turn" | "in-run" | "manual";

/**
 * The automatic run before a turn compacts only when the context is already over the threshold
 * and there is an older turn to take. Pure, so the decision can be tested without a model.
 */
export function shouldCompactBeforeTurn(input: { ratio: number; splittable: boolean }): boolean {
  return input.splittable && input.ratio >= COMPACT_THRESHOLD;
}

export interface CompactThreadRequest {
  thread: { id: string; summary: string | null };
  /** The rows the model sees now (after the previous cutoff), oldest first. */
  visible: MessageRow[];
  model: LanguageModel;
  maxOutputTokens: number;
  at: Exclude<CompactionAt, "in-run">;
}

export type CompactThreadResult =
  | { ok: true; estimatedBefore: number; estimatedAfter: number; compacted: number }
  /** `nothing`: no older turn to take. `failed`: the summarising call did not return a summary. */
  | { ok: false; reason: "nothing" | "failed"; error: string };

/**
 * Summarises the older turns into the thread summary and moves the cutoff past them, so the model
 * leaves them out from now on. The newest two turns stay as they are (see `splitForCompaction`).
 * Stores a `compactNotice` marker, and emits start and done (or failed) over SSE.
 */
export async function compactThreadHistory(req: CompactThreadRequest): Promise<CompactThreadResult> {
  const plan = splitForCompaction(req.visible);
  if (!plan) return { ok: false, reason: "nothing", error: "Belum ada percakapan lama yang bisa diringkas." };

  eventBus.emitChatCompaction({ threadId: req.thread.id, phase: "start", at: req.at });

  const messages = await convertToModelMessages(toUIMessages(plan.old).filter((m) => m.role !== "system") as any);
  const result = await summarizeOldest({
    model: req.model,
    messages,
    previousSummary: req.thread.summary,
    keepRecent: 0,
    maxOutputTokens: req.maxOutputTokens,
  });
  if (!result) {
    eventBus.emitChatCompaction({ threadId: req.thread.id, phase: "failed", at: req.at });
    return { ok: false, reason: "failed", error: "Ringkasan gagal dibuat. Percakapan tidak diubah." };
  }

  // The summariser estimates only the rows it summarised. The turns kept aside are part of the
  // context both before and after, so they are counted here (what the meter shows).
  const kept = await convertToModelMessages(toUIMessages(req.visible.slice(plan.old.length)).filter((m) => m.role !== "system") as any);
  const keptTokens = estimateTokens(kept);
  const estimatedBefore = result.estimatedBefore + keptTokens;
  const estimatedAfter = Math.ceil(result.summary.length / 4) + keptTokens;

  setThreadSummary(req.thread.id, result.summary);
  updateThread(req.thread.id, { summaryUptoSeq: plan.cutoffSeq });
  appendMessage({
    threadId: req.thread.id,
    role: "system",
    kind: "compactNotice",
    parts: [
      {
        type: "data-notice",
        data: {
          kind: "compacted",
          estimatedBefore,
          estimatedAfter,
          manual: req.at === "manual",
        },
      },
    ],
  });
  eventBus.emitChatCompaction({
    threadId: req.thread.id,
    phase: "done",
    at: req.at,
    estimatedBefore,
    estimatedAfter,
  });
  return { ok: true, estimatedBefore, estimatedAfter, compacted: plan.old.length };
}
