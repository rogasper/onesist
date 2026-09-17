/**
 * Two-layer context management (FR-B8, FR-B9, FR-B10).
 *
 * The Phase 0 spike (T1) proved one important thing: **`pruneMessages` is not
 * a conversation summarizer.** It drops old reasoning blocks and tool calls
 * (measured −82% size on tool-heavy history), but on 24 plain-text messages it
 * still returns 24 messages — it has no notion of "summarize".
 *
 * Hence two layers, and neither replaces the other:
 *   Layer 1 (every step, cheap): pruneMessages
 *   Layer 2 (when still over)  : summarize the oldest messages into one summary
 *                                  stored in chat_threads.summary
 */
import { pruneMessages, generateText, type LanguageModel, type ModelMessage } from "./ai";

/** Compaction threshold: share of the context budget that triggers layer 2. */
export const COMPACT_THRESHOLD = 0.7;

/** Keep this many latest messages intact when summarizing. */
export const KEEP_RECENT_MESSAGES = 6;

export const DEFAULT_CONTEXT_WINDOW = 128_000;

export function resolveContextWindow(configWindow: number | null | undefined): number {
  return typeof configWindow === "number" && configWindow > 0 ? configWindow : DEFAULT_CONTEXT_WINDOW;
}

/**
 * Token estimate. The `length/4` heuristic — same as the example in the AI SDK
 * docs, and chosen deliberately because it is cheap and needs no network. This
 * number only DECIDES when to summarize; the token counts shown to the user
 * always come from the provider's real `usage` (FR-B12).
 */
export function estimateTokens(messages: ModelMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    if (typeof m.content === "string") {
      chars += m.content.length;
      continue;
    }
    if (Array.isArray(m.content)) {
      for (const part of m.content as any[]) {
        if (typeof part?.text === "string") chars += part.text.length;
        else if (typeof part?.input === "object") chars += JSON.stringify(part.input ?? {}).length;
        else if (part?.output != null) chars += JSON.stringify(part.output).length;
        else chars += 32;
      }
    }
  }
  return Math.ceil(chars / 4);
}

/** Layer 1: trim reasoning and old tool calls. Called every step via
 *  `prepareStep`, so it must be cheap and must not do I/O. */
export function pruneForStep(messages: ModelMessage[]): ModelMessage[] {
  return pruneMessages({
    messages,
    reasoning: "all",
    toolCalls: `before-last-${Math.max(2, KEEP_RECENT_MESSAGES / 2)}-messages` as `before-last-${number}-messages`,
    emptyMessages: "remove",
  });
}

export interface CompactionDecision {
  shouldCompact: boolean;
  estimatedTokens: number;
  contextWindow: number;
  ratio: number;
}

export function shouldCompact(messages: ModelMessage[], contextWindow: number, threshold = COMPACT_THRESHOLD): CompactionDecision {
  const estimatedTokens = estimateTokens(messages);
  const ratio = estimatedTokens / contextWindow;
  return { shouldCompact: ratio >= threshold, estimatedTokens, contextWindow, ratio };
}

export interface SummarizeResult {
  summary: string;
  /** How many of the oldest messages this summary already represents. */
  compactedCount: number;
  estimatedBefore: number;
  estimatedAfter: number;
}

const SUMMARY_INSTRUCTION = `Ringkas percakapan berikut menjadi catatan kerja yang padat untuk melanjutkan tugas.

Pertahankan:
- keputusan dan preferensi user yang sudah disepakati
- berkas yang sudah dibuat/diubah beserta path-nya
- temuan penting, angka, dan nama (modul, entitas, endpoint, kode requirement)
- hal yang masih menggantung atau gagal

Buang: obrolan basa-basi, pengulangan, dan detail tool yang sudah tidak relevan.
Tulis sebagai poin-poin ringkas dalam Bahasa Indonesia. Jangan menambahkan informasi baru.`;

/**
 * Layer 2: summarize the oldest messages, keeping the last `keepRecent` intact.
 * Returns `null` when there is nothing to summarize.
 *
 * The previous summary is included so layered summaries do not lose context
 * from earlier compactions.
 */
export async function summarizeOldest(opts: {
  model: LanguageModel;
  messages: ModelMessage[];
  previousSummary?: string | null;
  keepRecent?: number;
  maxOutputTokens: number;
}): Promise<SummarizeResult | null> {
  const keepRecent = opts.keepRecent ?? KEEP_RECENT_MESSAGES;
  const cutoff = opts.messages.length - keepRecent;
  if (cutoff <= 0) return null;

  const oldest = opts.messages.slice(0, cutoff);
  const estimatedBefore = estimateTokens(opts.messages);

  const transcript = oldest
    .map((m) => {
      const role = m.role;
      const text =
        typeof m.content === "string"
          ? m.content
          : (m.content as any[])
              .map((p) => p?.text ?? (p?.input ? `${p.type} ${JSON.stringify(p.input).slice(0, 400)}` : p?.output ? `${p.type} ${JSON.stringify(p.output).slice(0, 600)}` : ""))
              .filter(Boolean)
              .join("\n");
      return `### ${role}\n${text.slice(0, 2000)}`;
    })
    .join("\n\n");

  const priorBlock = opts.previousSummary?.trim()
    ? `\n\nRingkasan sebelumnya (gabungkan dengan yang baru):\n${opts.previousSummary.trim()}`
    : "";

  try {
    const res = await generateText({
      model: opts.model,
      system: SUMMARY_INSTRUCTION,
      prompt: `Percakapan yang diringkas:\n\n${transcript}${priorBlock}`,
      maxOutputTokens: Math.min(opts.maxOutputTokens, 2000),
    } as any);
    const summary = (await res.text).trim();
    if (!summary) return null;
    return {
      summary,
      compactedCount: oldest.length,
      estimatedBefore,
      // Estimate after: summary + the messages kept aside.
      estimatedAfter: Math.ceil(summary.length / 4) + estimateTokens(opts.messages.slice(cutoff)),
    };
  } catch {
    // Summarization is an optimization, not a critical function: if the provider
    // fails, better to continue with full context than to fail the turn.
    return null;
  }
}
