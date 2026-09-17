/**
 * Timing measurement from model stream parts (FR-B5, FR-B12).
 *
 * `reasoning-*` and `tool-*` parts carry NO persistent timestamps:
 * after reload there is no way to know how long the agent was thinking or
 * how long a tool ran. So the timing is captured as the parts pass through
 * the stream, then stored together with the message.
 *
 * This module only reads parts; it does not change their content (`tap` forwards
 * each part downstream untouched), so it has no effect on the UI stream.
 */
import type { TextStreamPart } from "./ai";

export interface StreamTiming {
  /** ms since the first stream part was received, for a given part. */
  reasoningMs: number | null;
  toolStart: Map<string, number>;
  toolEnd: Map<string, number>;
  /** FATAL error text (provider failure), already sanitized. */
  fatalError: string | null;
  /** Observe one part; safe to call for any part kind. */
  observe: (part: any) => void;
  /** Duration of a tool in ms, when both endpoints were seen. */
  toolDurationMs: (toolCallId: string) => number | null;
}

/**
 * @param onFatalError Called ONLY for `error` parts — provider failures.
 *
 * Why it is separated from the UI stream's own `onError`: the SDK uses the same
 * callback for `tool-error`, so ordinary tool failures (e.g. `read_file` on a
 * file that does not exist yet — which the model then fixes by itself) would mark
 * the entire run and message as FAILED. The transcript would then show an error even
 * though the work completed, and history would store the wrong status. The `error`
 * part is the only true marker of a run failure (FR-B15).
 */
export function createStreamTiming(opts: { onFatalError?: (error: unknown) => void } = {}): StreamTiming {
  const started = Date.now();
  const toolStart = new Map<string, number>();
  const toolEnd = new Map<string, number>();
  let reasoningStart: number | null = null;
  let reasoningEnd: number | null = null;
  let fatalError: string | null = null;

  return {
    get reasoningMs() {
      if (reasoningStart == null || reasoningEnd == null) return null;
      const ms = reasoningEnd - reasoningStart;
      return ms > 0 ? ms : null;
    },
    get fatalError() {
      return fatalError;
    },
    set fatalError(value: string | null) {
      fatalError = value;
    },
    toolStart,
    toolEnd,
    observe(part: any) {
      const type = part?.type;
      if (typeof type !== "string") return;
      const now = Date.now();
      switch (type) {
        case "error":
          // Only this part signals a run failure.
          try {
            opts.onFatalError?.(part.error);
          } catch {
            fatalError = "Kegagalan provider.";
          }
          break;
        case "reasoning-start":
          if (reasoningStart == null) reasoningStart = now;
          break;
        case "reasoning-delta":
          if (reasoningStart == null) reasoningStart = now;
          reasoningEnd = now;
          break;
        case "reasoning-end":
          if (reasoningStart == null) reasoningStart = started;
          reasoningEnd = now;
          break;
        case "tool-input-start":
        case "tool-call":
        case "tool-input-available": {
          const id = part.toolCallId ?? part.id;
          if (id && !toolStart.has(id)) toolStart.set(id, now);
          break;
        }
        case "tool-output-available":
        case "tool-result":
        case "tool-error": {
          const id = part.toolCallId ?? part.id;
          if (id) toolEnd.set(id, now);
          break;
        }
        default:
          break;
      }
    },
    toolDurationMs(toolCallId: string) {
      const a = toolStart.get(toolCallId);
      const b = toolEnd.get(toolCallId);
      if (a == null || b == null) return null;
      return b >= a ? b - a : null;
    },
  };
}

/**
 * Pipe stream parts through while observing them. `observe` must never throw:
 * a running stream should not fail just because of timing bookkeeping.
 */
export function tapStream<T>(stream: ReadableStream<T>, timing: StreamTiming): ReadableStream<T> {
  return stream.pipeThrough(
    new TransformStream<T, T>({
      transform(part, controller) {
        try {
          timing.observe(part);
        } catch {
          /* timing measurement must never stop the stream */
        }
        controller.enqueue(part);
      },
    }),
  );
}

export type { TextStreamPart };
