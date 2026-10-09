/**
 * Regression: the composer's recall, long paste, quote and draft rules.
 *
 *   bun test src/components/chat/chat-draft.test.ts
 */
import { expect, test } from "bun:test";
import {
  FRESH_CURSOR,
  attachmentLabel,
  isLongPaste,
  loadDraft,
  pastedTextName,
  promptText,
  quoteBlock,
  saveDraft,
  stepHistory,
} from "./chat-draft";

test("↑ goes back through sent prompts and ↓ comes forward again to the draft", () => {
  const sent = ["ketiga", "kedua", "pertama"];
  let step = stepHistory(sent, FRESH_CURSOR, "older", "sedang diketik");
  expect(step?.text).toBe("ketiga");
  step = stepHistory(sent, step!.cursor, "older", "ketiga");
  expect(step?.text).toBe("kedua");
  step = stepHistory(sent, step!.cursor, "newer", "kedua");
  expect(step?.text).toBe("ketiga");
  step = stepHistory(sent, step!.cursor, "newer", "ketiga");
  expect(step?.text).toBe("sedang diketik");
  expect(stepHistory(sent, step!.cursor, "newer", "sedang diketik")).toBeNull();
});

test("↑ stops at the oldest prompt, and does nothing with no history", () => {
  const first = stepHistory(["satu"], FRESH_CURSOR, "older", "")!;
  expect(stepHistory(["satu"], first.cursor, "older", "satu")).toBeNull();
  expect(stepHistory([], FRESH_CURSOR, "older", "")).toBeNull();
});

test("a long paste is one more than the threshold, counted in lines", () => {
  expect(isLongPaste("baris\n".repeat(29))).toBe(false);
  expect(isLongPaste("baris\n".repeat(40))).toBe(true);
  expect(pastedTextName(42)).toBe("teks-tempelan-42-baris.txt");
});

test("a pasted text attachment is labelled by its lines, including a renamed copy", () => {
  expect(attachmentLabel("teks-tempelan-42-baris.txt")).toBe("Teks tempelan · 42 baris");
  expect(attachmentLabel("teks-tempelan-42-baris-2.txt")).toBe("Teks tempelan · 42 baris");
  expect(attachmentLabel("rule-a.md")).toBe("rule-a.md");
});

test("a recalled prompt drops the attachment block that was sent with it", () => {
  expect(promptText("Lampiran:\n@input/uploads/t/a.md\n@input/uploads/t/b.md\n\nRingkas ini")).toBe("Ringkas ini");
  expect(promptText("Tanpa lampiran")).toBe("Tanpa lampiran");
});

test("a quote is a markdown block, every line marked", () => {
  expect(quoteBlock("  satu\ndua  ")).toBe("> satu\n> dua\n\n");
});

test("a draft is kept per thread and an empty one is removed", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
  saveDraft(storage, "thr_a", { text: "draf A", attachments: [{ path: "p", name: "n", size: 1 }] });
  saveDraft(storage, "thr_b", { text: "draf B", attachments: [] });
  expect(loadDraft(storage, "thr_a")).toEqual({ text: "draf A", attachments: [{ path: "p", name: "n", size: 1 }] });
  expect(loadDraft(storage, "thr_b").text).toBe("draf B");
  saveDraft(storage, "thr_a", { text: "", attachments: [] });
  expect(loadDraft(storage, "thr_a")).toEqual({ text: "", attachments: [] });
});

test("a damaged draft loads as empty instead of breaking the composer", () => {
  const storage = { getItem: () => "{bukan json", setItem: () => {}, removeItem: () => {} };
  expect(loadDraft(storage, "thr_x")).toEqual({ text: "", attachments: [] });
  expect(loadDraft(null, "thr_x")).toEqual({ text: "", attachments: [] });
});
