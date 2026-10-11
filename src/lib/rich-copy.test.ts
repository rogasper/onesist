/**
 * Regression: a task copied for Jira or Monday keeps its structure as HTML, and its plain-text
 * version has no markdown syntax left in it.
 *
 *   bun test src/lib/rich-copy.test.ts
 */
import { expect, test } from "bun:test";
import { htmlToPlainText, markdownToHtml } from "./rich-copy";

test("headings, bold, and inline code become HTML elements", () => {
  const html = markdownToHtml("## Langkah\n\n**Penting** pakai `npm`.");
  expect(html).toContain("<h2>Langkah</h2>");
  expect(html).toContain("<strong>Penting</strong>");
  expect(html).toContain("<code>npm</code>");
});

test("a GFM table keeps its grid", () => {
  const html = markdownToHtml("| A | B |\n|---|---|\n| 1 | 2 |");
  expect(html).toContain('border="1"');
  expect(html).toContain("<th");
  expect(html).toContain("<td");
});

test("an image becomes its name in brackets, not a link to a local file", () => {
  const html = markdownToHtml("![Frame login](input/assets/login.png)");
  expect(html).toContain("[Gambar: Frame login]");
  expect(html).not.toContain("<img");
});

test("a mermaid block stays as code", () => {
  const html = markdownToHtml("```mermaid\ngraph TD\nA-->B\n```");
  expect(html).toContain("<pre>");
  expect(html).toContain("graph TD");
});

test("plain text has no markdown syntax left", () => {
  const text = htmlToPlainText(markdownToHtml("# Judul\n\n**tebal** dan `kode`\n\n| A | B |\n|---|---|\n| 1 | 2 |"));
  expect(text).not.toMatch(/[#*|`]/);
  expect(text).toContain("Judul");
  expect(text).toContain("tebal dan kode");
});

test("ordered and bulleted lists are numbered and bulleted, nested lists are indented", () => {
  const text = htmlToPlainText(markdownToHtml("1. satu\n2. dua\n\n- a\n  - b"));
  expect(text).toContain("1. satu");
  expect(text).toContain("2. dua");
  expect(text).toContain("- a");
  expect(text).toMatch(/\n {2}- b/);
});

test("entities are decoded in plain text", () => {
  expect(htmlToPlainText("<p>A &amp; B &lt;C&gt; &quot;q&quot; it&#x27;s</p>")).toBe('A & B <C> "q" it\'s');
});

test("each block element starts its own line", () => {
  expect(htmlToPlainText("<p>satu</p><p>dua</p>")).toBe("satu\ndua");
});
