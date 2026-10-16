/**
 * Claude Code as a chat runtime: installed, logged in, its models (from Claude Code itself),
 * and the registry entry. No model is called: a control-only query answers accountInfo and
 * supportedModels.
 *
 *   bun test src/server/agent/cli/claude/runtime.test.ts
 */
import { beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-claude-runtime-")), "data.db");

const { createClaudeRuntime, claudeRuntime, forgetClaudeModels, parseClaudeModels } = await import("./runtime");
const { cliRuntimeFor, runtimeCapabilities } = await import("~/server/agent/runtime/registry");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-claude-bin-"));
const exe = path.join(dir, "claude");
fs.writeFileSync(exe, "#!/bin/sh\necho '2.1.296 (Claude Code)'\n", { mode: 0o755 });
const provider = (cliPath: string | null) => ({ id: "p", apiStyle: "cli", cliAgent: "claude", cliPath }) as any;

let closed = 0;
const control = (account: any, models: any[]) => () => ({
  accountInfo: async () => account,
  supportedModels: async () => models,
  close: () => {
    closed++;
  },
});

beforeEach(() => forgetClaudeModels());

test("Claude Code's model list becomes the picker's list", () => {
  expect(parseClaudeModels([{ value: "sonnet", displayName: "Sonnet", description: "x" }, { value: "opus" }])).toEqual([
    { id: "sonnet", name: "Sonnet", options: [], contextWindow: null },
    { id: "opus", name: "opus", options: [], contextWindow: null },
  ]);
});

test("probe: not installed, not logged in, and ready — and the control query is always closed", async () => {
  const runtime = createClaudeRuntime({ control: control({ email: "a@b.c", tokenSource: "claude.ai" }, [{ value: "sonnet", displayName: "Sonnet" }]) as any, version: async () => "2.1.296" });
  expect((await runtime.probe(provider(path.join(dir, "tidak-ada")))).state).toBe("not_installed");
  expect(await runtime.probe(provider(exe))).toEqual({ state: "ready", version: "2.1.296", message: "Claude Code 2.1.296 · 1 model." });
  // Ready probe: accountInfo + supportedModels = 2 closes. Logged-out probe stops after accountInfo = 1.
  expect(closed).toBe(2);

  forgetClaudeModels();
  const loggedOut = createClaudeRuntime({ control: control({}, []) as any, version: async () => "2.1.296" });
  const status = await loggedOut.probe(provider(exe));
  expect(status.state).toBe("not_ready");
  expect(status.message).toContain("login");
  expect(closed).toBe(3);
});

test("the model list is cached per binary until forced", async () => {
  let calls = 0;
  const runtime = createClaudeRuntime({
    control: (() => ({ accountInfo: async () => ({ email: "a" }), supportedModels: async () => [{ value: `m${++calls}` }], close: () => {} })) as any,
    version: async () => "2.1.296",
  });
  expect((await runtime.listModels(provider(exe))).map((m) => m.id)).toEqual(["m1"]);
  expect((await runtime.listModels(provider(exe))).map((m) => m.id)).toEqual(["m1"]);
  expect((await runtime.listModels(provider(exe), { force: true })).map((m) => m.id)).toEqual(["m2"]);
});

test("the registry runs claude providers on this runtime, without effort or model options", () => {
  expect(cliRuntimeFor({ apiStyle: "cli", cliAgent: "claude" } as any)).toBe(claudeRuntime);
  expect(runtimeCapabilities({ apiStyle: "cli", cliAgent: "claude" } as any)).toEqual({ reasoningEffort: false, modelOptions: false });
});
