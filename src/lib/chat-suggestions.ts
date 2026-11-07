/**
 * Follow-up suggestions an answer ends with (issue #55).
 *
 * The convention is a fenced block whose language is `suggestions`:
 *
 *     ```suggestions
 *     - Buat endpoint login
 *     - Tambahkan test case
 *     ```
 *
 * It is parsed on the server before the answer is stored (so the block never
 * reaches the model again, the search index, or the visible prose) and in the
 * chat panel while the answer streams. Both sides use this module.
 */

export const MAX_CHAT_SUGGESTIONS = 6;
const MAX_SUGGESTION_CHARS = 300;

/** A complete block; the closing fence may be longer than the opening one. */
const COMPLETE_BLOCK = /(^|\n)[ \t]*(?:`{3,}|~{3,})[ \t]*suggestions[^\n]*\r?\n([\s\S]*?)\r?\n[ \t]*(?:`{3,}|~{3,})[ \t]*(?=\r?\n|$)/gi;
/** An opening fence the stream has not closed yet: hidden, no suggestions. */
const OPEN_BLOCK = /(^|\n)[ \t]*(?:`{3,}|~{3,})[ \t]*suggestions[^\n]*\r?\n?[\s\S]*$/i;

export interface ExtractedSuggestions {
  text: string;
  suggestions: string[];
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
    if (out.length >= MAX_CHAT_SUGGESTIONS) break;
  }
  return out;
}

function itemsOf(body: string): string[] {
  const trimmed = body.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map((value) => String(value).trim()).filter(Boolean);
    } catch {
      /* not JSON — fall through to one-per-line */
    }
  }
  const items: string[] = [];
  for (const raw of body.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^[-*•]\s+/, "").replace(/^\d+[.)]\s+/, "").trim();
    line = line.replace(/^["'“”](.*)["'“”]$/, "$1").trim();
    if (line && line.length <= MAX_SUGGESTION_CHARS) items.push(line);
  }
  return items;
}

export function extractSuggestionsFromText(text: string): ExtractedSuggestions {
  const suggestions: string[] = [];
  let cleaned = text.replace(COMPLETE_BLOCK, (_match, lead: string, body: string) => {
    suggestions.push(...itemsOf(body));
    return lead ?? "";
  });
  cleaned = cleaned.replace(OPEN_BLOCK, (_match, lead: string) => lead ?? "").replace(/\s+$/, "");
  return { text: cleaned, suggestions: unique(suggestions) };
}

/** Strips every suggestions block from a message's parts and returns the items.
 *  Non-text parts are kept as they are. */
export function extractSuggestions(parts: unknown): { parts: any[]; suggestions: string[] } {
  if (!Array.isArray(parts)) return { parts: [], suggestions: [] };
  const out: any[] = [];
  const suggestions: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object" || part.type !== "text" || typeof part.text !== "string") {
      out.push(part);
      continue;
    }
    const result = extractSuggestionsFromText(part.text);
    suggestions.push(...result.suggestions);
    if (result.text.trim()) out.push({ ...part, text: result.text });
  }
  return { parts: out, suggestions: unique(suggestions) };
}

/** Just the items, for a transcript that already holds the cleaned parts. */
export function suggestionsInParts(parts: unknown): string[] {
  return extractSuggestions(parts).suggestions;
}
