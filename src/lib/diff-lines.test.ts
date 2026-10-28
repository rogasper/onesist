import { expect, test } from "bun:test";
import { annotateDiff } from "./diff-lines";

test("each added or context line knows its line number in the new file", () => {
  const patch = [
    "diff --git a/a.ts b/a.ts",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -1,3 +1,4 @@",
    " const a = 1;",
    "-const b = 2;",
    "+const b = 3;",
    "+const c = 4;",
    " export {};",
  ].join("\n");
  const lines = annotateDiff(patch);
  const added = lines.filter((l) => l.kind === "add");
  expect(added.map((l) => [l.text, l.newLine])).toEqual([
    ["+const b = 3;", 2],
    ["+const c = 4;", 3],
  ]);
  expect(lines.find((l) => l.kind === "del")!.newLine).toBeNull();
  expect(lines.find((l) => l.text === " export {};")!.newLine).toBe(4);
});
