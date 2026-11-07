import { expect, test } from "bun:test";
import { withSuggestionsNote } from "./suggestions-note";

test("the CLI prompt gets the suggestions convention in front", () => {
  const text = withSuggestionsNote("Buat login");
  expect(text.endsWith("Buat login")).toBe(true);
  expect(text).toContain("```suggestions");
  expect(text.indexOf("Saran lanjutan")).toBe(0);
});
