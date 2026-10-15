/**
 * Which runtime runs a provider, and which composer controls it gets.
 *
 *   bun test src/server/agent/runtime/registry.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The registry reaches the store through the OpenCode turn: never let it open the real data.db.
process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-runtime-registry-")), "data.db");

const { cliRuntimeFor, runtimeCapabilities } = await import("./registry");

test("native providers have no CLI runtime; reasoning effort follows the API style", () => {
  expect(cliRuntimeFor({ apiStyle: "completions", cliAgent: null })).toBeNull();
  expect(runtimeCapabilities({ apiStyle: "completions", cliAgent: null })).toEqual({ reasoningEffort: false, modelOptions: false });
  expect(runtimeCapabilities({ apiStyle: "anthropic-messages", cliAgent: null })).toEqual({ reasoningEffort: true, modelOptions: false });
  expect(runtimeCapabilities({ apiStyle: "responses", cliAgent: null })).toEqual({ reasoningEffort: true, modelOptions: false });
});

test("an OpenCode provider runs on the OpenCode runtime, with model options", () => {
  expect(cliRuntimeFor({ apiStyle: "cli", cliAgent: "opencode" })?.id).toBe("opencode");
  expect(runtimeCapabilities({ apiStyle: "cli", cliAgent: "opencode" })).toEqual({ reasoningEffort: false, modelOptions: true });
});

test("a CLI agent without a runtime gets none, and no controls", () => {
  expect(cliRuntimeFor({ apiStyle: "cli", cliAgent: "claude" })).toBeNull();
  expect(runtimeCapabilities({ apiStyle: "cli", cliAgent: "claude" })).toEqual({ reasoningEffort: false, modelOptions: false });
});
