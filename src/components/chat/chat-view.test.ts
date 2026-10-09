/**
 * Regression: how a turn reads in the transcript.
 *   - work (thinking, tool calls, subagents) folds into runs; the answer stays in place
 *   - a bash result shows its exit code; a write or edit result shows lines added and removed
 *   - a group of writes is titled with files and line totals, a group of reads with steps
 *
 *   bun test src/components/chat/chat-view.test.ts
 */
import { expect, test } from "bun:test";
import { bashExitCode, changeStats, changeTitle, exploreTitle, formatDuration, segmentBlocks, toolFamily, touchedPaths, workSummary } from "./chat-view";

test("consecutive work blocks form one run; the answer splits runs and stays in place", () => {
  const blocks = [
    { kind: "reasoning" }, { kind: "tools" }, { kind: "text" }, { kind: "tools" }, { kind: "tools" }, { kind: "text" },
  ];
  const segs = segmentBlocks(blocks);
  expect(segs.map((s) => (s.work ? `work:${s.items.length}` : `item:${s.item.kind}`))).toEqual([
    "work:2",
    "item:text",
    "work:2",
    "item:text",
  ]);
});

test("notices and plan panels are never folded", () => {
  const segs = segmentBlocks([{ kind: "tools" }, { kind: "todos" }, { kind: "notice" }]);
  expect(segs.map((s) => s.work)).toEqual([true, false, false]);
});

test("tool families: reading never changes the workspace, writing does", () => {
  expect(toolFamily("read_file")).toBe("explore");
  expect(toolFamily("grep")).toBe("explore");
  expect(toolFamily("edit_file")).toBe("changes");
  expect(toolFamily("bash")).toBe("other");
});

test("bash exit code is read from the first line of its result", () => {
  expect(bashExitCode("exit=0\nok")).toBe(0);
  expect(bashExitCode("exit=2\nsalah")).toBe(2);
  expect(bashExitCode("exit=-1")).toBe(-1);
  expect(bashExitCode("tanpa kode")).toBeNull();
  expect(bashExitCode(undefined)).toBeNull();
});

test("a write or edit result reports lines added and removed", () => {
  expect(changeStats("Diubah: docs/a.md (+3/-1 baris, hash=abc)")).toEqual({ added: 3, removed: 1 });
  expect(changeStats("Dibuat: output/x.md (+12/-0 baris, hash=def)")).toEqual({ added: 12, removed: 0 });
  expect(changeStats("Berkas tidak ditemukan")).toBeNull();
});

test("summaries read as the user would say them", () => {
  expect(workSummary({ steps: 14, durationMs: 72_000, files: 3 })).toBe("Bekerja 1 mnt 12 dtk · 14 langkah · 3 berkas");
  expect(workSummary({ steps: 0, durationMs: null, files: 0 })).toBe("Bekerja");
  expect(changeTitle({ files: 2, added: 40, removed: 5 })).toBe("Perubahan · 2 berkas +40 −5");
  expect(changeTitle({ files: 1, added: 0, removed: 0 })).toBe("Perubahan · 1 berkas +0 −0");
  expect(exploreTitle(12)).toBe("Menjelajah 12 langkah");
  expect(formatDuration(1200)).toBe("1,2 dtk");
});

test("touched paths are distinct and ignore calls without a path", () => {
  expect(touchedPaths([{ path: "a.md" }, { path: "a.md" }, { path: "b.md" }, {}, null])).toEqual(["a.md", "b.md"]);
});
