/**
 * Copy guard: the old positioning and stale facts never come back, and components never write
 * execution copy themselves (it lives in content.ts, where it is only "coming soon").
 *
 *   cd landing && bun test src/copy.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const read = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return read(p);
    return /\.(tsx?|css)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });

const sources = read(path.join(root, "src"));
const indexHtml = fs.readFileSync(path.join(root, "index.html"), "utf-8");
const allText = [...sources.map((p) => fs.readFileSync(p, "utf-8")), indexHtml].join("\n");
const componentsText = sources
  .filter((p) => p.includes(`${path.sep}components${path.sep}`) || p.endsWith("App.tsx"))
  .map((p) => fs.readFileSync(p, "utf-8"))
  .join("\n");

const banned = ["Planner, not executor", "not executor", "No code gen", "nothing to execute", ".msi", "bun run screenshots", "v0.1.38"];
for (const phrase of banned) test(`no "${phrase}" anywhere on the page`, () => expect(allText).not.toContain(phrase));
test("components never write execution copy themselves", () => expect(componentsText).not.toMatch(/execut/i));
test("index.html carries the new headline", () => expect(indexHtml).toContain("From FSD to handoff"));
