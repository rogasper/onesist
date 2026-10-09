/**
 * The composer's own rules, kept free of React so they can be tested directly:
 * recalling sent prompts with ↑/↓, a long paste that becomes a text attachment, the
 * label a pasted attachment shows, quoting a selection from an answer, and the draft
 * saved per thread.
 */

/** A paste longer than this many lines is saved as a text attachment, not typed in. */
export const LONG_PASTE_LINES = 30;

/** The file name a long paste is saved under; the lines count is kept in the name. */
export function pastedTextName(lines: number): string {
  return `teks-tempelan-${lines}-baris.txt`;
}

export function isLongPaste(text: string): boolean {
  return text.split("\n").length > LONG_PASTE_LINES;
}

/** The chip label for an attachment: a pasted text reads "Teks tempelan · 42 baris". */
export function attachmentLabel(name: string): string {
  const m = /^teks-tempelan-(\d+)-baris(?:-\d+)?\.txt$/.exec(name);
  return m ? `Teks tempelan · ${m[1]} baris` : name;
}

/**
 * The text a user typed, as the transcript stores it: the `Lampiran:` block that lists
 * attached files is removed, so recalling a prompt puts back only what was typed.
 */
export function promptText(stored: string): string {
  return stored.replace(/^Lampiran:\n(?:@[^\n]*\n)+\n?/, "").trim();
}

/** Where the user is in the sent prompts. `index` -1 is the draft being typed. */
export interface HistoryCursor {
  index: number;
  draft: string;
}

export const FRESH_CURSOR: HistoryCursor = { index: -1, draft: "" };

/**
 * One step through the sent prompts. `sent` is newest first. Going older from the draft
 * remembers the draft, so going back down to it restores what was typed. Null when there
 * is nothing to step to.
 */
export function stepHistory(
  sent: string[],
  cursor: HistoryCursor,
  direction: "older" | "newer",
  current: string,
): { cursor: HistoryCursor; text: string } | null {
  if (direction === "older") {
    const next = cursor.index + 1;
    if (next >= sent.length) return null;
    return { cursor: { index: next, draft: cursor.index === -1 ? current : cursor.draft }, text: sent[next] };
  }
  if (cursor.index < 0) return null;
  const next = cursor.index - 1;
  return { cursor: { index: next, draft: cursor.draft }, text: next < 0 ? cursor.draft : sent[next] };
}

/** A selection from an answer as a markdown quote, ready to append to the composer. */
export function quoteBlock(selected: string): string {
  return `${selected.trim().split("\n").map((line) => `> ${line}`).join("\n")}\n\n`;
}

export interface StoredAttachment {
  path: string;
  name: string;
  size: number;
}

export interface StoredDraft {
  text: string;
  attachments: StoredAttachment[];
}

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const draftKey = (threadId: string) => `onesist.chat.draft.${threadId}`;

export function loadDraft(storage: DraftStorage | null, threadId: string): StoredDraft {
  const empty: StoredDraft = { text: "", attachments: [] };
  if (!storage) return empty;
  try {
    const raw = storage.getItem(draftKey(threadId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<StoredDraft>;
    return {
      text: typeof parsed.text === "string" ? parsed.text : "",
      attachments: Array.isArray(parsed.attachments)
        ? parsed.attachments.filter((a): a is StoredAttachment => !!a && typeof a.path === "string" && typeof a.name === "string")
        : [],
    };
  } catch {
    return empty;
  }
}

/** An empty draft is removed, so a sent message leaves nothing behind. */
export function saveDraft(storage: DraftStorage | null, threadId: string, draft: StoredDraft): void {
  if (!storage) return;
  try {
    if (!draft.text && !draft.attachments.length) storage.removeItem(draftKey(threadId));
    else storage.setItem(draftKey(threadId), JSON.stringify(draft));
  } catch {
    /* storage full or blocked: the draft simply is not kept */
  }
}
