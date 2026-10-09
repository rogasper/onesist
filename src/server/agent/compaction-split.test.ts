/**
 * Regression: a manual compaction takes the older turns and keeps the last two prompts
 * with their answers, starting at a user message.
 *
 *   bun test src/server/agent/compaction-split.test.ts
 */
import { expect, test } from "bun:test";
import { splitForCompaction } from "./context";

const row = (role: string, seq: number) => ({ role, seq });

test("the last two turns are kept and the older ones are taken", () => {
  const rows = [row("user", 1), row("assistant", 2), row("user", 3), row("assistant", 4), row("user", 5), row("assistant", 6)];
  const split = splitForCompaction(rows)!;
  expect(split.old.map((r) => r.seq)).toEqual([1, 2]);
  expect(split.cutoffSeq).toBe(2);
});

test("a thread with two turns or fewer has nothing to take", () => {
  expect(splitForCompaction([row("user", 1), row("assistant", 2), row("user", 3), row("assistant", 4)])).toBeNull();
  expect(splitForCompaction([])).toBeNull();
});

test("the kept part starts at a user prompt, not at an answer", () => {
  const rows = [row("user", 1), row("assistant", 2), row("assistant", 3), row("user", 4), row("assistant", 5), row("user", 6), row("assistant", 7)];
  const split = splitForCompaction(rows)!;
  expect(rows[split.old.length].role).toBe("user");
  expect(split.cutoffSeq).toBe(3);
});
