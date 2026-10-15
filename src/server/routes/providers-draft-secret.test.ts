/**
 * The provider form sends an empty password field to mean "unchanged". Fetching the
 * model list for an edited CLI provider must then use the stored password.
 *
 *   bun test src/server/routes/providers-draft-secret.test.ts
 */
import { afterAll, beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-providers-secret-")), "data.db");

const { db } = await import("~/server/db/client");
const { llmProviders } = await import("~/server/db/schema");
const { basicAuth } = await import("~/server/agent/cli/opencode/client");
const { forgetOpenCodeModels } = await import("~/server/agent/cli/opencode/runtime");
const { router } = await import("./providers");

const fake = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  fetch(req) {
    if (req.headers.get("authorization") !== basicAuth("tersimpan")) return new Response("no", { status: 401 });
    if (new URL(req.url).pathname === "/api/model") return Response.json({ data: [{ id: "flash", providerID: "go", name: "Flash" }] });
    return new Response(null, { status: 404 });
  },
});
afterAll(() => fake.stop(true));

beforeAll(() => {
  delete process.env.SA_OPENCODE_URL;
  forgetOpenCodeModels();
  db.insert(llmProviders)
    .values({ id: "prov-secret-oc", name: "OpenCode secret", preset: "cli-opencode", apiStyle: "cli", cliAgent: "opencode", endpoint: `http://127.0.0.1:${fake.port}`, apiKey: "tersimpan", authMethod: "none" })
    .run();
});

test("an empty password in the draft means the stored one", async () => {
  const res = await router.handle(
    new Request("http://localhost:4321/api/providers/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: "prov-secret-oc", apiStyle: "cli", cliAgent: "opencode", endpoint: `http://127.0.0.1:${fake.port}`, apiKey: "", cliPath: "" }),
    }),
  );
  const body = (await res!.json()) as any;
  expect(body.supported).toBe(true);
  expect(body.models.map((m: any) => m.id)).toContain("go/flash");
});
