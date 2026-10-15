/**
 * The provider routes the composer and the settings read: a CLI runtime's status, the
 * options of one model, and what an API provider answers there.
 *
 *   bun test src/server/routes/providers-runtime.test.ts
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-providers-runtime-")), "data.db");

const { db } = await import("~/server/db/client");
const { llmProviders } = await import("~/server/db/schema");
const { basicAuth } = await import("~/server/agent/cli/opencode/client");
const { forgetOpenCodeModels } = await import("~/server/agent/cli/opencode/runtime");
const { router } = await import("./providers");

const fake = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(req) {
    if (req.headers.get("authorization") !== basicAuth("pw-routes")) return new Response("no", { status: 401 });
    const p = new URL(req.url).pathname;
    if (p === "/api/info") return Response.json({ version: "2.0.29" });
    if (p === "/api/model") return Response.json({ data: [{ id: "flash", providerID: "go", name: "Flash", variants: [{ id: "low" }, { id: "max" }] }] });
    return new Response(null, { status: 404 });
  },
});
afterAll(() => fake.stop(true));

beforeAll(() => {
  delete process.env.SA_OPENCODE_URL;
  forgetOpenCodeModels();
  db.insert(llmProviders)
    .values([
      { id: "prov-rt-oc", name: "OpenCode rt", preset: "cli-opencode", apiStyle: "cli", cliAgent: "opencode", endpoint: `http://127.0.0.1:${fake.port}`, apiKey: "pw-routes", authMethod: "none" },
      { id: "prov-rt-api", name: "API rt", preset: "deepseek", apiStyle: "completions", endpoint: "https://api.contoh.test/v1", model: "x", authMethod: "bearer" },
    ])
    .run();
});

const get = async (p: string) => {
  const res = await router.handle(new Request(`http://localhost:4321/api/${p}`));
  if (!res) throw new Error("route did not match");
  return { status: res.status, body: (await res.json()) as any };
};

test("a CLI provider's status comes from its runtime", async () => {
  const { status, body } = await get("providers/prov-rt-oc/status");
  expect(status).toBe(200);
  expect(body.status).toEqual(expect.objectContaining({ state: "ready", version: "2.0.29" }));
});

test("an API provider is reported ready without probing anything", async () => {
  const { body } = await get("providers/prov-rt-api/status");
  expect(body.status.state).toBe("ready");
});

test("an unknown provider is 404", async () => {
  expect((await get("providers/tidak-ada/status")).status).toBe(404);
});

test("the options of one model come back as descriptors", async () => {
  const { body } = await get(`providers/prov-rt-oc/model-options?model=${encodeURIComponent("go/flash")}`);
  expect(body.options).toEqual([
    { id: "variant", label: "Tingkat berpikir", type: "select", choices: [{ value: "low", label: "Rendah" }, { value: "max", label: "Maksimal" }] },
  ]);
});

test("an unknown model, a missing model and an API provider have no options", async () => {
  expect((await get("providers/prov-rt-oc/model-options?model=go%2Ftidak-ada")).body.options).toEqual([]);
  expect((await get("providers/prov-rt-oc/model-options")).body.options).toEqual([]);
  expect((await get("providers/prov-rt-api/model-options?model=x")).body.options).toEqual([]);
});
