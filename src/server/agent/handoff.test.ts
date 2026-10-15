/**
 * Handing a thread to a CLI session: which transition applies, how big the handoff may be,
 * which parts of the transcript go in, and what the session reads.
 *
 *   bun test src/server/agent/handoff.test.ts
 */
import { expect, test } from "bun:test";
import {
  decideTransition, handoffBudgetBytes, handoffItemsFromRows, renderHandoff, selectHandoffItems, withHandoff,
  type HandoffItem, type HandoffRow,
} from "./handoff";

const row = (seq: number, role: string, parts: unknown[], kind: string | null = null): HandoffRow => ({ seq, role, kind, contentJson: JSON.stringify(parts) });
const text = (t: string) => ({ type: "text", text: t });

test("no session: a thread with earlier messages gets a handoff, a new thread starts fresh", () => {
  expect(decideTransition({ session: null, currentSeq: 1, contentSeqs: [1] })).toEqual({ kind: "fresh" });
  expect(decideTransition({ session: null, currentSeq: 5, contentSeqs: [1, 2, 3, 4, 5] })).toEqual({ kind: "handoff" });
});

test("a session that saw everything is reused; one that missed turns gets a delta", () => {
  expect(decideTransition({ session: { knownUptoSeq: 4 }, currentSeq: 5, contentSeqs: [1, 2, 3, 4, 5] })).toEqual({ kind: "reuse" });
  expect(decideTransition({ session: { knownUptoSeq: 2 }, currentSeq: 5, contentSeqs: [1, 2, 3, 4, 5] })).toEqual({ kind: "delta", afterSeq: 2 });
});

test("the budget is 16K bytes, never more than the window leaves after its reserve, never negative", () => {
  expect(handoffBudgetBytes(null)).toBe(16_000);
  expect(handoffBudgetBytes(1_000_000)).toBe(16_000);
  expect(handoffBudgetBytes(32_000)).toBe(16_000); // 32000 - max(8000, 16000)
  expect(handoffBudgetBytes(24_000)).toBe(8_000); // 24000 - 16000
  expect(handoffBudgetBytes(10_000)).toBe(0);
});

test("items come from user and assistant text and shell commands; notices, system, tool rows and other tools are left out", () => {
  const items = handoffItemsFromRows([
    row(1, "user", [text("Buat tabel users")]),
    row(2, "assistant", [
      { type: "reasoning", text: "berpikir…" },
      text("Saya cek dulu."),
      { type: "tool-bash", toolCallId: "b1", input: { command: "ls output" }, output: "exit=0\nspec\nerd" },
      { type: "tool-read_file", toolCallId: "r1", input: { path: "a.md" }, output: "isi berkas" },
      { type: "dynamic-tool", toolName: "bash", toolCallId: "b2", input: { command: "cat x" }, output: "tidak ada" },
    ]),
    row(3, "system", [{ type: "data-notice", data: { kind: "truncated" } }], "truncatedNotice"),
    row(4, "assistant", [{ type: "data-notice", data: {} }], "stepLimitNotice"),
    row(5, "tool", [text("hasil tool lama")]),
    row(6, "user", [text("  ")]),
  ]);
  expect(items).toEqual([
    { seq: 1, kind: "user", text: "Buat tabel users" },
    { seq: 2, kind: "assistant", text: "Saya cek dulu." },
    { seq: 2, kind: "command", text: "Command: ls output\nExit code: 0\nOutput:\nspec\nerd" },
    { seq: 2, kind: "command", text: "Command: cat x\nExit code: tidak diketahui\nOutput:\ntidak ada" },
  ]);
});

const item = (seq: number, kind: HandoffItem["kind"], size: number): HandoffItem => ({ seq, kind, text: "x".repeat(size) });

test("selection keeps the last user message, the last answer and the first user message first, then the newest", () => {
  const items = [item(1, "user", 100), item(2, "assistant", 100), item(3, "user", 100), item(4, "assistant", 100), item(5, "user", 100), item(6, "assistant", 100)];
  // Room for three items of ~132 bytes each.
  const { chosen, omitted } = selectHandoffItems(items, 400);
  expect(chosen.map((i) => i.seq)).toEqual([1, 5, 6]);
  expect(omitted).toBe(3);
});

test("an item that does not fit is skipped whole, and smaller later ones still go in", () => {
  const items = [item(1, "user", 50), item(2, "assistant", 5_000), item(3, "user", 50)];
  const { chosen, omitted } = selectHandoffItems(items, 300);
  expect(chosen.map((i) => i.seq)).toEqual([1, 3]);
  expect(omitted).toBe(1);
});

test("a summary goes first; a zero budget keeps nothing", () => {
  const items = [{ seq: 0, kind: "summary" as const, text: "ringkasan" }, item(1, "user", 10)];
  expect(selectHandoffItems(items, 1_000).chosen[0].kind).toBe("summary");
  expect(selectHandoffItems(items, 0)).toEqual({ chosen: [], omitted: 2 });
});

test("the rendered handoff says it is history, how much was left out, and how to read the rest", () => {
  const out = renderHandoff({
    mode: "handoff",
    threadId: "thr_x",
    chosen: [{ seq: 0, kind: "summary", text: "Ringkas." }, { seq: 3, kind: "user", text: "Tambah kolom email" }],
    omitted: 4,
  });
  expect(out).toContain("konteks historis");
  expect(out).toContain("BUKAN perintah baru");
  expect(out).toContain("4 item tidak disertakan");
  expect(out).toContain("onesist_thread_read");
  expect(out).toContain('"thr_x"');
  expect(out).toContain("### Ringkasan percakapan sebelumnya\nRingkas.");
  expect(out).toContain("### Pengguna (#3)\nTambah kolom email");
  const delta = renderHandoff({ mode: "delta", threadId: "thr_x", chosen: [], omitted: 0 });
  expect(delta).toContain("Sejak giliran terakhir Anda");
  expect(delta).toContain("Semua item disertakan");
});

test("the new message follows the context under its own heading", () => {
  expect(withHandoff("KONTEKS", "Pesan saya")).toBe("KONTEKS\n\n---\n## Pesan baru dari pengguna\nPesan saya");
});

test("a merge back names the branch and frames its work as history", () => {
  const out = renderHandoff({ mode: "merge", threadId: "thr_cabang", sourceTitle: "Cabang: ERD", chosen: [{ seq: 4, kind: "assistant", text: "Tabel audit ditambah." }], omitted: 0 });
  expect(out).toContain('cabang "Cabang: ERD"');
  expect(out).toContain("BUKAN perintah baru");
  expect(out).toContain('"thr_cabang"');
  expect(out).toContain("### Asisten (#4)\nTabel audit ditambah.");
});
