/**
 * Per-project execution settings: defaults, partial updates, validation, and the 404 for unknown projects.
 *
 *   bun test src/server/routes/projects/exec-settings.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-exec-settings-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects } = await import("~/server/db/schema");
const { router } = await import("./exec-settings");

beforeAll(() => {
  db.insert(projects).values({ id: "p-exec", name: "Eksekusi" }).run();
});

const call = async (method: string, url: string, body?: unknown) => {
  const res = await router.handle(
    new Request(`http://localhost:4321${url}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  if (!res) throw new Error(`route did not match: ${method} ${url}`);
  return { status: res.status, body: (await res.json()) as any };
};
const get = (id: string) => call("GET", `/api/projects/${id}/exec-settings`);
const put = (id: string, body: unknown) => call("PUT", `/api/projects/${id}/exec-settings`, body);

test("a project without a row gets the defaults", async () => {
  const { status, body } = await get("p-exec");
  expect(status).toBe(200);
  expect(body).toEqual({
    taskMode: "execution",
    execProviderId: null,
    execModel: null,
    reviewerProviderId: null,
    reviewerModel: null,
    maxParallel: 2,
    integration: "pr",
    baseBranches: {},
  });
});

test("PUT stores a partial patch and returns the merged settings", async () => {
  const { status, body } = await put("p-exec", { taskMode: "delivery", maxParallel: 3 });
  expect(status).toBe(200);
  expect(body.taskMode).toBe("delivery");
  expect(body.maxParallel).toBe(3);
  expect(body.integration).toBe("pr");
  expect((await get("p-exec")).body.taskMode).toBe("delivery");
});

test("PUT stores base branches per repo", async () => {
  const { body } = await put("p-exec", { baseBranches: { "input/code/api": "develop" } });
  expect(body.baseBranches).toEqual({ "input/code/api": "develop" });
});

test("PUT rejects invalid values with an Indonesian message", async () => {
  const mode = await put("p-exec", { taskMode: "auto" });
  expect(mode.status).toBe(400);
  expect(typeof mode.body.error).toBe("string");
  expect((await put("p-exec", { maxParallel: 0 })).body.error).toBe("Batas paralel harus 1–8");
  expect((await put("p-exec", { maxParallel: 9 })).status).toBe(400);
  expect((await put("p-exec", { integration: "push" })).status).toBe(400);
});

test("an unknown project is 404", async () => {
  expect((await get("nope")).status).toBe(404);
});
