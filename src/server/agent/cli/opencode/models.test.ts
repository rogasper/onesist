/**
 * The model picker lists OpenCode's own models as provider/model ids.
 *
 *   bun test src/server/agent/cli/opencode/models.test.ts
 */
import { afterAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-oc-models-")), "data.db");

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(req) {
    if (new URL(req.url).pathname === "/api/model") {
      return Response.json({ data: [{ id: "gemini-4", providerID: "opencode-go", name: "Gemini 4" }] });
    }
    return new Response(null, { status: 404 });
  },
});
afterAll(() => {
  server.stop(true);
  delete process.env.SA_OPENCODE_URL;
});
process.env.SA_OPENCODE_URL = `http://127.0.0.1:${server.port}`;

const { discoverModels } = await import("~/server/agent/config");

test("OpenCode models are listed as provider/model with their names", async () => {
  const result = await discoverModels({ apiStyle: "cli", cliAgent: "opencode", cliPath: null, model: null, modelsJson: null, endpoint: "" } as any);
  expect(result.supported).toBe(true);
  expect(result.models).toContainEqual(expect.objectContaining({ id: "opencode-go/gemini-4", displayName: "Gemini 4" }));
});

test("other CLI agents still have no model list", async () => {
  const result = await discoverModels({ apiStyle: "cli", cliAgent: "pi", cliPath: null, model: null, modelsJson: null, endpoint: "" } as any);
  expect(result.supported).toBe(false);
});
