/**
 * Regression: `@` mentions of files and folders expand to project paths; the popup puts the
 * best match first.
 *
 *   bun test src/lib/mentions.test.ts
 */
import { expect, test } from "bun:test";
import { expandMentions } from "./mentions";
import { rankMentions } from "./mention-rank";

const entries = [
  { name: "reports", path: "output/reports/" },
  { name: "rule-a.md", path: "output/reports/rule-a.md" },
  { name: "README.md", path: "README.md" },
  { name: "reports", path: "input/reports/" },
];

test("a file mention expands to its path", () => {
  expect(expandMentions("lihat @rule-a.md dulu", entries)).toBe("lihat @output/reports/rule-a.md dulu");
});

test("a folder mention with a trailing slash expands to the folder path", () => {
  expect(expandMentions("cek @README.md dan @output/reports/", entries)).toBe("cek @README.md dan @output/reports/");
  expect(expandMentions("isi @rule-a.md", entries)).toBe("isi @output/reports/rule-a.md");
});

test("a folder name that matches two folders is left as typed", () => {
  expect(expandMentions("buka @reports/", entries)).toBe("buka @reports/");
});

test("a file mention does not pick up a folder of the same name", () => {
  const withSame = [...entries, { name: "reports", path: "docs/reports/" }];
  expect(expandMentions("buka @reports", withSame)).toBe("buka @reports");
});

test("an e-mail address is not a mention", () => {
  expect(expandMentions("kirim ke a@rule-a.md", entries)).toBe("kirim ke a@rule-a.md");
});

test("an exact name is first, then a name that starts with the query, then shallower paths", () => {
  const items = [
    { name: "rule-a.md", path: "output/reports/rule-a.md" },
    { name: "rule.md", path: "rule.md" },
    { name: "my-rule.md", path: "docs/my-rule.md" },
  ];
  expect(rankMentions(items, "rule").map((i) => i.name)).toEqual(["rule.md", "rule-a.md", "my-rule.md"]);
});

test("with no query the root entries come first", () => {
  const items = [
    { name: "a.md", path: "output/reports/a.md" },
    { name: "ROOT.md", path: "ROOT.md" },
  ];
  expect(rankMentions(items, "").map((i) => i.name)).toEqual(["ROOT.md", "a.md"]);
});
