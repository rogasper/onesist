/**
 * Antigravity as a chat runtime: whether it can be used, its models, and the registry entry.
 *
 *   bun test src/server/agent/cli/antigravity/runtime.test.ts
 */
import { beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-agy-runtime-")), "data.db");

const { antigravityRuntime, agyBinary, forgetAgyModels, parseAgyModels } = await import("./runtime");
const { cliRuntimeFor, runtimeCapabilities } = await import("~/server/agent/runtime/registry");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-agy-probe-"));
const fake = path.join(dir, "agy");
const write = (models: string, version = "1.2.2") =>
  fs.writeFileSync(
    fake,
    `#!/bin/sh
case "$1" in
  --version) echo "${version}";;
  models) printf '%b' "${models}";;
esac
`,
    { mode: 0o755 },
  );
const provider = (cliPath: string | null) => ({ id: "prov-agy", apiStyle: "cli", cliAgent: "antigravity", cliPath }) as any;

beforeEach(() => forgetAgyModels());

test("agy models output becomes the model list; the header line and blanks are skipped", () => {
  const out = "Fetching available models...\ngemini-3.8-flash-low\tGemini 3.8 Flash (Low)\nclaude-opus-5-5-high\tClaude Opus 5.5 (High)\n\nraw-id\n";
  expect(parseAgyModels(out)).toEqual([
    { id: "gemini-3.8-flash-low", name: "Gemini 3.8 Flash (Low)", options: [], contextWindow: null },
    { id: "claude-opus-5-5-high", name: "Claude Opus 5.5 (High)", options: [], contextWindow: null },
    { id: "raw-id", name: "raw-id", options: [], contextWindow: null },
  ]);
  expect(parseAgyModels("")).toEqual([]);
});

test("the binary is the provider's path, else agy on PATH", () => {
  expect(agyBinary({ cliPath: " /opt/agy " } as any)).toBe("/opt/agy");
  expect(agyBinary({ cliPath: null } as any)).toBe("agy");
});

test("probe: missing binary, not logged in (no models), and ready", async () => {
  expect((await antigravityRuntime.probe(provider(path.join(dir, "tidak-ada")))).state).toBe("not_installed");

  write("Fetching available models...\\n");
  const notReady = await antigravityRuntime.probe(provider(fake));
  expect(notReady.state).toBe("not_ready");
  expect(notReady.version).toBe("1.2.2");
  expect(notReady.message).toContain("login");

  forgetAgyModels();
  write("Fetching available models...\\ngemini-3.8-flash-low\\tGemini 3.8 Flash (Low)\\n");
  const ready = await antigravityRuntime.probe(provider(fake));
  expect(ready).toEqual({ state: "ready", version: "1.2.2", message: "Antigravity 1.2.2 · 1 model." });
});

test("the model list is cached per binary until forced", async () => {
  write("gemini-3.8-flash-low\\tA\\n");
  expect((await antigravityRuntime.listModels(provider(fake))).map((m) => m.id)).toEqual(["gemini-3.8-flash-low"]);
  write("claude-sonnet-5-5-low\\tB\\n");
  expect((await antigravityRuntime.listModels(provider(fake))).map((m) => m.id)).toEqual(["gemini-3.8-flash-low"]);
  expect((await antigravityRuntime.listModels(provider(fake), { force: true })).map((m) => m.id)).toEqual(["claude-sonnet-5-5-low"]);
});

test("the registry runs antigravity providers on this runtime, without effort or model options", () => {
  expect(cliRuntimeFor({ apiStyle: "cli", cliAgent: "antigravity" } as any)).toBe(antigravityRuntime);
  expect(runtimeCapabilities({ apiStyle: "cli", cliAgent: "antigravity" } as any)).toEqual({ reasoningEffort: false, modelOptions: false });
});
