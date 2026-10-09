/**
 * The `#` references of the chat composer, shared by the server (which resolves them)
 * and the client (which lists them and writes them into the message).
 *
 * A reference is written as `#kind:slug`, where the slug is the label with its spaces
 * turned into underscores, so the token ends at the first space.
 */
export const MENTION_KINDS = ["fsd", "erd", "endpoint", "task", "wiki", "thread"] as const;
export type MentionKind = (typeof MENTION_KINDS)[number];

export interface MentionRef {
  kind: MentionKind;
  id: string;
  label: string;
  hint: string;
}

/** A label as it appears in the composer. */
export function refSlug(label: string): string {
  return label.trim().replace(/\s+/g, "_").slice(0, 60);
}

/** The `#kind:slug` tokens in a text, in order. A token must start a word. */
export function refTokens(text: string): { kind: MentionKind; slug: string; token: string }[] {
  const out: { kind: MentionKind; slug: string; token: string }[] = [];
  for (const m of text.matchAll(/(?:^|\s)#(fsd|erd|endpoint|task|wiki|thread):(\S+)/g)) {
    out.push({ kind: m[1] as MentionKind, slug: m[2], token: `#${m[1]}:${m[2]}` });
  }
  return out;
}
