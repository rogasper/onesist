/**
 * The OpenCode runtime against a fake `opencode serve` reached through the provider's
 * own Server URL: status, models with their variant option, the model cache, and the
 * failures a person meets first (no binary, unreachable server, not logged in).
 *
 *   bun test src/server/agent/cli/opencode/runtime.test.ts
 */
import { afterAll, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The runtime reaches the store through the OpenCode turn: never let it open the real data.db.
process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-oc-runtime-")), "data.db");

const { basicAuth } = await import("./client");
const { forgetOpenCodeModels, opencodeRuntime, variantDescriptor } = await import("./runtime");

let models: any[] = [];
let modelCalls = 0;
const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(req) {
    if (req.headers.get("authorization") !== basicAuth("pw-runtime")) return new Response("no", { status: 401 });
    const p = new URL(req.url).pathname;
    if (p === "/api/info") return Response.json({ version: "2.0.29" });
    if (p === "/api/model") {
      modelCalls++;
      return Response.json({ data: models });
    }
    return new Response(null, { status: 404 });
  },
});
afterAll(() => server.stop(true));

const provider = (over: Record<string, unknown> = {}): any => ({
  apiStyle: "cli", cliAgent: "opencode", cliPath: null,
  endpoint: `http://127.0.0.1:${server.port}`, apiKey: "pw-runtime", model: null, ...over,
});

beforeEach(() => {
  delete process.env.SA_OPENCODE_URL;
  delete process.env.SA_OPENCODE_PASSWORD;
  forgetOpenCodeModels();
  modelCalls = 0;
  models = [
    { id: "flash", providerID: "go", name: "Flash", variants: [{ id: "low" }, { id: "high" }, { id: "turbo" }] },
    { id: "plain", providerID: "go", name: "Plain" },
  ];
});

test("variants become one select option, labelled in Indonesian, unknown ids kept as they are", () => {
  expect(variantDescriptor([])).toBeNull();
  expect(variantDescriptor(["low", "high", "turbo"])).toEqual({
    id: "variant", label: "Tingkat berpikir", type: "select",
    choices: [{ value: "low", label: "Rendah" }, { value: "high", label: "Tinggi" }, { value: "turbo", label: "turbo" }],
  });
});

test("models are listed as provider/model with their options", async () => {
  expect(await opencodeRuntime.listModels(provider())).toEqual([
    { id: "go/flash", name: "Flash", options: [variantDescriptor(["low", "high", "turbo"])!] },
    { id: "go/plain", name: "Plain", options: [] },
  ]);
});

test("the model list is cached; force asks again", async () => {
  await opencodeRuntime.listModels(provider());
  await opencodeRuntime.listModels(provider());
  expect(modelCalls).toBe(1);
  await opencodeRuntime.listModels(provider(), { force: true });
  expect(modelCalls).toBe(2);
});

test("a reachable server with models is ready and says which version", async () => {
  const status = await opencodeRuntime.probe(provider());
  expect(status.state).toBe("ready");
  expect(status.version).toBe("2.0.29");
  expect(status.message).toContain("2 model");
});

test("a server without models is not ready and says how to log in", async () => {
  models = [];
  const status = await opencodeRuntime.probe(provider());
  expect(status.state).toBe("not_ready");
  expect(status.message).toContain("opencode auth");
});

test("a missing binary is not installed, without starting anything", async () => {
  const status = await opencodeRuntime.probe(provider({ endpoint: null, apiKey: null, cliPath: path.join(os.tmpdir(), "tidak-ada", "opencode") }));
  expect(status).toEqual(expect.objectContaining({ state: "not_installed", version: null }));
  expect(status.message).toContain("OpenCode tidak ditemukan");
});

test("an unreachable server URL fails quickly with a clear message", async () => {
  const started = Date.now();
  const status = await opencodeRuntime.probe(provider({ endpoint: "http://127.0.0.1:9" }));
  expect(status.state).toBe("error");
  expect(status.message).toContain("Tidak bisa menghubungi OpenCode");
  expect(Date.now() - started).toBeLessThan(6_000);
});

test("a wrong password is an error, and the password never shows in the message", async () => {
  const status = await opencodeRuntime.probe(provider({ apiKey: "salah-rahasia" }));
  expect(status.state).toBe("error");
  expect(status.message).not.toContain("salah-rahasia");
});
