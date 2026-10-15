/**
 * Tool output size limits (plan decision 12), in two layers:
 *  - store: one tool call keeps at most TOOL_OUTPUT_STORE_MAX_CHARS of output in data.db,
 *    a single file that travels between laptops;
 *  - view: the transcript sent to the UI carries outputs up to TOOL_OUTPUT_VIEW_MAX_CHARS;
 *    a larger one arrives shortened and marked `outputOmitted`, and its card loads the
 *    whole output on demand.
 * The model's history is built from the stored rows, so the view layer never reaches it.
 * Shortening keeps an object's short fields (exit codes, paths, counts): tool cards read them.
 */
export const TOOL_OUTPUT_STORE_MAX_CHARS = 256_000;
export const TOOL_OUTPUT_VIEW_MAX_CHARS = 16_000;
export const TOOL_OUTPUT_VIEW_PREVIEW_CHARS = 2_000;

export function isToolPart(part: unknown): boolean {
  const type = (part as { type?: unknown } | null)?.type;
  return typeof type === "string" && (type.startsWith("tool-") || type === "dynamic-tool");
}

export function outputSize(value: unknown): number {
  if (typeof value === "string") return value.length;
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return 0;
  }
}

function cutText(text: string, max: number, note: string): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n\n… ${note}: ${text.length - max} karakter tidak ditampilkan.`;
}

const isScalar = (value: unknown) => value === null || typeof value === "number" || typeof value === "boolean";

/** An output brought down to about `max` characters; returned unchanged when it already fits. */
export function shortenOutput(output: unknown, max: number, note: string): unknown {
  if (outputSize(output) <= max) return output;
  if (typeof output === "string") return cutText(output, max, note);
  if (output && typeof output === "object" && !Array.isArray(output)) {
    const entries = Object.entries(output);
    const longCount = entries.filter(([, v]) => !isScalar(v)).length;
    const budget = Math.max(200, Math.floor(max / Math.max(1, longCount)));
    const out: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      if (isScalar(value)) out[key] = value;
      else out[key] = cutText(typeof value === "string" ? value : (JSON.stringify(value) ?? ""), budget, note);
    }
    return out;
  }
  return cutText(JSON.stringify(output) ?? "", max, note);
}

/** Message parts as they go into data.db: tool outputs over the store limit are cut. */
export function capToolOutputsForStore(parts: unknown): unknown {
  if (!Array.isArray(parts)) return parts;
  return parts.map((part: any) => {
    if (!isToolPart(part) || part.output === undefined) return part;
    const size = outputSize(part.output);
    if (size <= TOOL_OUTPUT_STORE_MAX_CHARS) return part;
    return {
      ...part,
      output: shortenOutput(part.output, TOOL_OUTPUT_STORE_MAX_CHARS, "dipotong saat disimpan"),
      outputTruncated: { originalChars: size },
    };
  });
}

/** Messages as the transcript shows them: big tool outputs shortened and marked. Input is not changed. */
export function pruneToolOutputsForView<T extends { parts: any[] }>(messages: T[]): T[] {
  return messages.map((message) => {
    if (!Array.isArray(message.parts) || !message.parts.some((p: any) => isToolPart(p) && outputSize(p.output) > TOOL_OUTPUT_VIEW_MAX_CHARS)) {
      return message;
    }
    return {
      ...message,
      parts: message.parts.map((part: any) => {
        if (!isToolPart(part)) return part;
        const size = outputSize(part.output);
        if (size <= TOOL_OUTPUT_VIEW_MAX_CHARS) return part;
        return {
          ...part,
          output: shortenOutput(part.output, TOOL_OUTPUT_VIEW_PREVIEW_CHARS, "dipendekkan"),
          outputOmitted: { chars: size },
        };
      }),
    };
  });
}

/** The stored output of one tool call, for a card that opens a shortened one. */
export function findToolOutput(messages: { parts: any[] }[], toolCallId: string): { found: boolean; output: unknown } {
  for (const message of messages) {
    for (const part of message.parts ?? []) {
      if (isToolPart(part) && (part as any).toolCallId === toolCallId) return { found: true, output: (part as any).output };
    }
  }
  return { found: false, output: undefined };
}
