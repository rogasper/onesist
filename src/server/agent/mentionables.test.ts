/**
 * Regression: the `@` popup offers the project's root files and folders, even when a large
 * folder would use up the cap, and marks folders as folders.
 *
 *   bun test src/server/agent/mentionables.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listMentionables } from "./mentionables";

function tree(files: string[]): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-mention-"));
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), "x");
  }
  return root;
}

test("root files and folders come first, folders marked with a slash", () => {
  const root = tree(["README.md", "output/reports/a.md", "input/fsd/b.md"]);
  const list = listMentionables(root);
  const top = list.filter((m) => m.depth === 0).map((m) => m.path);
  expect(top).toEqual(["input/", "output/", "README.md"]);
  expect(list.find((m) => m.path === "output/")?.kind).toBe("dir");
  expect(list.find((m) => m.path === "output/reports/a.md")?.kind).toBe("file");
});

test("a big folder does not hide the files at the root", () => {
  const many = Array.from({ length: 30 }, (_, i) => `big/f${String(i).padStart(2, "0")}.md`);
  const root = tree([...many, "ROOT-NOTE.md"]);
  const list = listMentionables(root, 10);
  expect(list.some((m) => m.path === "ROOT-NOTE.md")).toBe(true);
  expect(list.length).toBe(10);
});

test("dependency folders are not offered", () => {
  const root = tree(["node_modules/pkg/index.js", "src/app.ts"]);
  const paths = listMentionables(root).map((m) => m.path);
  expect(paths).toContain("src/");
  expect(paths.some((p) => p.startsWith("node_modules"))).toBe(false);
});
