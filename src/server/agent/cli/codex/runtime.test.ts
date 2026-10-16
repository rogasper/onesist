/**
 * Codex as a chat runtime: whether it can be used, its models, and the registry entry.
 *
 *   bun test src/server/agent/cli/codex/runtime.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-codex-runtime-")), "data.db");

const { codexRuntime, parseCodexModels } = await import("./runtime");
const { cliRuntimeFor, runtimeCapabilities } = await import("~/server/agent/runtime/registry");
const { stopCodexServers } = await import("./server");

test("model/list becomes the model picker's list", () => {
  expect(parseCodexModels({ data: [{ id: "gpt-x", displayName: "GPT X" }, { id: "gpt-y" }] })).toEqual([
    { id: "gpt-x", name: "GPT X", options: [], contextWindow: null },
    { id: "gpt-y", name: "gpt-y", options: [], contextWindow: null },
  ]);
  expect(parseCodexModels({})).toEqual([]);
});

test("a missing binary is not installed; the registry gives this runtime, without effort or model options", async () => {
  const provider = { id: "p", apiStyle: "cli", cliAgent: "codex", cliPath: path.join(os.tmpdir(), "tidak-ada-codex") } as any;
  const status = await codexRuntime.probe(provider);
  expect(status.state).toBe("not_installed");
  expect(cliRuntimeFor({ apiStyle: "cli", cliAgent: "codex" } as any)).toBe(codexRuntime);
  expect(runtimeCapabilities({ apiStyle: "cli", cliAgent: "codex" } as any)).toEqual({ reasoningEffort: false, modelOptions: false });
  stopCodexServers();
});
