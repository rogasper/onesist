import { expect, test } from "bun:test";
import { parseReviewFindings } from "./run-review";

const block = (json: string) => "Ini temuannya.\n\n```onesist-review\n" + json + "\n```\n";

test("findings are read from the last onesist-review block and cleaned", () => {
  const text = block('[{"file":"a.ts","line":"4","severity":"warn","message":"mirip helper"}]') +
    block('[{"file":"lib/format.ts","line":12,"severity":"error","message":"duplikat formatRupiah","suggestion":"pakai formatCurrency","relatedSymbol":"formatCurrency"},{"file":"","severity":"nope","message":""}]');
  const res = parseReviewFindings(text);
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.findings).toEqual([
    { file: "lib/format.ts", line: 12, severity: "error", message: "duplikat formatRupiah", suggestion: "pakai formatCurrency", relatedSymbol: "formatCurrency" },
  ]);
});

test("a missing or broken block is refused", () => {
  expect(parseReviewFindings("kosong").ok).toBe(false);
  expect(parseReviewFindings(block("{}")).ok).toBe(false);
});
