/**
 * Which logo a provider shows: its own brand mark for each preset; a custom endpoint
 * falls back to the mark of the protocol it speaks; unknown providers have none.
 *
 *   bun test src/lib/provider-logo.test.ts
 */
import { expect, test } from "bun:test";
import { ANTHROPIC_LOGO, OPENAI_LOGO, OPENCODE_LOGO, providerLogo } from "./provider-logo";

test("the OpenCode CLI provider shows the OpenCode logo", () => {
  expect(providerLogo({ apiStyle: "cli", cliAgent: "opencode", preset: "cli-opencode" })).toBe(OPENCODE_LOGO);
  expect(providerLogo({ apiStyle: "cli", cliAgent: "opencode", preset: null })).toBe(OPENCODE_LOGO);
});

test("each preset shows its own brand, not OpenAI's", () => {
  expect(providerLogo({ apiStyle: "completions", preset: "openai" })).toBe(OPENAI_LOGO);
  expect(providerLogo({ apiStyle: "anthropic-messages", preset: "anthropic" })).toBe(ANTHROPIC_LOGO);
  expect(providerLogo({ apiStyle: "completions", preset: "deepseek" })).toBe("/icons/brand/deepseek.svg");
  expect(providerLogo({ apiStyle: "completions", preset: "gemini" })).toBe("/icons/brand/googlegemini.svg");
  expect(providerLogo({ apiStyle: "cli", cliAgent: "claude", preset: "cli-claude" })).toBe("/images/claude.png");
  expect(providerLogo({ apiStyle: "cli", cliAgent: "codex", preset: "cli-codex" })).toBe("/images/codex.png");
});

test("a custom OpenAI-compatible or Responses endpoint shows the OpenAI mark, an Anthropic-compatible one Anthropic's", () => {
  expect(providerLogo({ apiStyle: "completions", preset: "custom-openai" })).toBe(OPENAI_LOGO);
  expect(providerLogo({ apiStyle: "responses", preset: "custom-responses" })).toBe(OPENAI_LOGO);
  expect(providerLogo({ apiStyle: "anthropic-messages", preset: "custom-anthropic" })).toBe(ANTHROPIC_LOGO);
});

test("Groq, Zhipu and xAI show their own marks, not their protocol's", () => {
  expect(providerLogo({ apiStyle: "completions", preset: "groq" })).toBe("/icons/brand/groq.png");
  expect(providerLogo({ apiStyle: "completions", preset: "zhipu" })).toBe("/icons/brand/zhipu.png");
  expect(providerLogo({ apiStyle: "completions", preset: "xai" })).toBe("/icons/brand/xai.png");
});

test("a preset without a mark shows none, not its protocol's", () => {
  expect(providerLogo({ apiStyle: "completions", preset: "tidak-ada" })).toBeNull();
});

test("a provider with no preset id falls back to its protocol, and none without one", () => {
  expect(providerLogo({ apiStyle: "completions", preset: null })).toBe(OPENAI_LOGO);
  expect(providerLogo({ apiStyle: null, preset: null })).toBeNull();
});
