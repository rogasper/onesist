/**
 * Which logo a provider shows: OpenCode for the OpenCode CLI, the OpenAI mark for every
 * OpenAI-compatible endpoint (completions or responses style). Other providers have none.
 *
 *   bun test src/lib/provider-logo.test.ts
 */
import { expect, test } from "bun:test";
import { OPENAI_LOGO, OPENCODE_LOGO, providerLogo } from "./provider-logo";

test("the OpenCode CLI provider shows the OpenCode logo", () => {
  expect(providerLogo({ apiStyle: "cli", cliAgent: "opencode", preset: "cli-opencode" })).toBe(OPENCODE_LOGO);
  expect(providerLogo({ apiStyle: "cli", cliAgent: "opencode", preset: null })).toBe(OPENCODE_LOGO);
});

test("every OpenAI-compatible provider, custom or preset, shows the OpenAI logo", () => {
  expect(providerLogo({ apiStyle: "completions", preset: "custom-openai" })).toBe(OPENAI_LOGO);
  expect(providerLogo({ apiStyle: "completions", preset: "openai" })).toBe(OPENAI_LOGO);
  expect(providerLogo({ apiStyle: "responses", preset: "custom-openai" })).toBe(OPENAI_LOGO);
});

test("other providers have no logo, and other CLI agents do not get OpenCode's", () => {
  expect(providerLogo({ apiStyle: "anthropic-messages", preset: "anthropic" })).toBeNull();
  expect(providerLogo({ apiStyle: "cli", cliAgent: "claude", preset: "cli-claude" })).toBeNull();
  expect(providerLogo({ apiStyle: null, preset: null })).toBeNull();
});
