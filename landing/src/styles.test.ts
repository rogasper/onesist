/**
 * The glass highlight (`.specular::before`) is a decoration: it must sit under the card's
 * content, or its white sheen washes the text out.
 *
 *   cd landing && bun test src/styles.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.join(import.meta.dir, "styles.css"), "utf-8");

test("card content is stacked above the specular highlight", () => {
  const rule = css.match(/\.specular\s*>\s*\*\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(rule).toMatch(/position:\s*relative/);
  expect(rule).toMatch(/z-index:\s*1/);
});
test("the page wrapper clips sideways without becoming a scroll container (keeps the nav sticky)", () => {
  const app = fs.readFileSync(path.join(import.meta.dir, "App.tsx"), "utf-8");
  expect(app).not.toMatch(/overflow-(x-)?(hidden|auto|scroll)/);
  expect(app).toContain("overflow-x-clip");
});
test("the highlight itself stays at the bottom layer", () => {
  const rule = css.match(/\.specular::before\s*\{([^}]*)\}/)?.[1] ?? "";
  expect(rule).toMatch(/z-index:\s*0/);
});
