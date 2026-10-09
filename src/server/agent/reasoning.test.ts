/**
 * Regression: the reasoning effort a thread asks for reaches only the providers that
 * have a control for it, in the shape each one expects.
 *
 *   bun test src/server/agent/reasoning.test.ts
 */
import { expect, test } from "bun:test";
import { parseReasoningLevel, reasoningProviderOptions, supportsReasoningEffort } from "./reasoning";

test("only a known level is accepted; anything else means the provider default", () => {
  expect(parseReasoningLevel("high")).toBe("high");
  expect(parseReasoningLevel("default")).toBeNull();
  expect(parseReasoningLevel("ultra")).toBeNull();
  expect(parseReasoningLevel(undefined)).toBeNull();
});

test("the chat-completions style has no reasoning control and sends nothing", () => {
  expect(supportsReasoningEffort("completions")).toBe(false);
  expect(reasoningProviderOptions({ apiStyle: "completions", level: "high", maxOutputTokens: 8000 })).toBeUndefined();
});

test("OpenAI Responses gets its reasoning effort", () => {
  expect(reasoningProviderOptions({ apiStyle: "responses", level: "medium", maxOutputTokens: 8000 })).toEqual({
    openai: { reasoningEffort: "medium" },
  });
});

test("Anthropic gets a thinking budget that leaves room for the answer", () => {
  expect(reasoningProviderOptions({ apiStyle: "anthropic-messages", level: "high", maxOutputTokens: 64000 })).toEqual({
    anthropic: { thinking: { type: "enabled", budgetTokens: 16384 } },
  });
  // The budget never reaches the output ceiling: 8192 - 1024 room is the most it gets.
  expect(reasoningProviderOptions({ apiStyle: "anthropic-messages", level: "high", maxOutputTokens: 8192 })).toEqual({
    anthropic: { thinking: { type: "enabled", budgetTokens: 7168 } },
  });
});

test("no level means no options, and a budget under the minimum is dropped", () => {
  expect(reasoningProviderOptions({ apiStyle: "anthropic-messages", level: null, maxOutputTokens: 8000 })).toBeUndefined();
  expect(reasoningProviderOptions({ apiStyle: "anthropic-messages", level: "low", maxOutputTokens: 2000 })).toBeUndefined();
});
