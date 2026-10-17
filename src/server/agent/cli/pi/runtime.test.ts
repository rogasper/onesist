/**
 * Pi as a chat runtime: whether it can be used, its models as provider/model ids, and the
 * registry entry.
 *
 *   bun test src/server/agent/cli/pi/runtime.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-pi-runtime-")), "data.db");

const { piRuntime, parsePiModels, piBinary } = await import("./runtime");
const { cliRuntimeFor, runtimeCapabilities } = await import("~/server/agent/runtime/registry");

test("get_available_models becomes provider/model ids for the picker", () => {
  expect(parsePiModels({ models: [{ provider: "anthropic", id: "claude-sonnet", name: "Claude Sonnet", contextWindow: 200000 }, { provider: "openai", id: "gpt-x" }] })).toEqual([
    { id: "anthropic/claude-sonnet", name: "Claude Sonnet", options: [], contextWindow: 200000 },
    { id: "openai/gpt-x", name: "gpt-x", options: [], contextWindow: null },
  ]);
  expect(parsePiModels({})).toEqual([]);
});

test("the binary is the provider's path, else pi on PATH", () => {
  expect(piBinary({ cliPath: " /opt/pi " } as any)).toBe("/opt/pi");
  expect(piBinary({ cliPath: null } as any)).toBe("pi");
});

test("a missing binary is not installed; the registry gives this runtime, without effort or model options", async () => {
  const status = await piRuntime.probe({ id: "p", apiStyle: "cli", cliAgent: "pi", cliPath: path.join(os.tmpdir(), "tidak-ada-pi") } as any);
  expect(status.state).toBe("not_installed");
  expect(cliRuntimeFor({ apiStyle: "cli", cliAgent: "pi" } as any)).toBe(piRuntime);
  expect(runtimeCapabilities({ apiStyle: "cli", cliAgent: "pi" } as any)).toEqual({ reasoningEffort: false, modelOptions: false });
});
