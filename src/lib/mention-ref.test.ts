/**
 * Regression: a `#` reference is written and read the same way on both sides.
 *
 *   bun test src/lib/mention-ref.test.ts
 */
import { expect, test } from "bun:test";
import { refSlug, refTokens } from "./mention-ref";
import { supportsReasoningEffort, parseReasoningLevel } from "./reasoning-level";

test("a label becomes one word for the composer", () => {
  expect(refSlug("  Login   pengguna ")).toBe("Login_pengguna");
  expect(refSlug("GET /api/tasks")).toBe("GET_/api/tasks");
});

test("the tokens in a message are read where a word starts", () => {
  const found = refTokens("lihat #task:T-12_Login dan #erd:users, tapi bukan a#task:x");
  expect(found.map((t) => t.token)).toEqual(["#task:T-12_Login", "#erd:users,"]);
  expect(found[0]).toEqual({ kind: "task", slug: "T-12_Login", token: "#task:T-12_Login" });
});

test("an unknown kind is not a reference", () => {
  expect(refTokens("#foo:bar")).toEqual([]);
});

test("only the styles with a reasoning control offer the setting", () => {
  expect(supportsReasoningEffort("responses")).toBe(true);
  expect(supportsReasoningEffort("anthropic-messages")).toBe(true);
  expect(supportsReasoningEffort("completions")).toBe(false);
  expect(parseReasoningLevel("medium")).toBe("medium");
  expect(parseReasoningLevel("max")).toBeNull();
});
