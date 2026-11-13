/**
 * Route-level tests for `/api/files/search` and search-index invalidation on file mutations.
 *
 *   bun test src/server/routes/files.test.ts
 */
import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDirs: string[] = [];
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-files-route-db-"));
tempDirs.push(dbDir);
process.env.SA_DB_PATH = path.join(dbDir, "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const { router } = await import("./files");
const { invalidateFileSearchIndex } = await import("~/lib/file-router");

let projectRoot = "";

beforeAll(() => {
  projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-files-route-ws-"));
  tempDirs.push(projectRoot);
  fs.mkdirSync(path.join(projectRoot, "output/specs"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, "vendor/pkg"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "output/specs/orders.md"), "# Orders API\nGET /orders\n");
  fs.writeFileSync(path.join(projectRoot, "vendor/pkg/orders.md"), "ignored vendor file\n");

  db.run(
    sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-files-test', 'Files Test', ${projectRoot})`,
  );
  db.run(
    sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-files-no-root', 'No Root', NULL)`,
  );
});

beforeEach(() => {
  invalidateFileSearchIndex();
});

afterAll(() => {
  invalidateFileSearchIndex();
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
});

async function getSearch(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  const res = await router.handle(new Request(`http://localhost:4321/api/files/search${qs ? `?${qs}` : ""}`));
  if (!res) throw new Error("route did not match");
  return { status: res.status, body: (await res.json()) as any[] };
}

test("missing or unknown projectId returns [] without falling back to defaultRoot", async () => {
  const readdirSpy = spyOn(fs.promises, "readdir");
  try {
    expect(await getSearch({})).toEqual({ status: 200, body: [] });
    expect(await getSearch({ q: "package" })).toEqual({ status: 200, body: [] });
    expect(await getSearch({ projectId: "does-not-exist", q: "orders" })).toEqual({ status: 200, body: [] });
    expect(await getSearch({ projectId: "p-files-no-root", q: "orders" })).toEqual({ status: 200, body: [] });
    expect(readdirSpy).not.toHaveBeenCalled();
  } finally {
    readdirSpy.mockRestore();
  }
});

test("empty query returns project files without reading file contents and skips ignored dirs", async () => {
  const readSpy = spyOn(fs.promises, "readFile");
  try {
    const res = await getSearch({ projectId: "p-files-test" });
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.path)).toEqual(["output/specs/orders.md"]);
    expect(readSpy).not.toHaveBeenCalled();
  } finally {
    readSpy.mockRestore();
  }
});

test("write, rename, and delete routes invalidate the search index", async () => {
  const initial = await getSearch({ projectId: "p-files-test", q: "billing" });
  expect(initial.body).toEqual([]);

  const writeRes = await router.handle(
    new Request("http://localhost:4321/api/files/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "p-files-test",
        path: "output/specs/billing.md",
        content: "# Billing\n",
      }),
    }),
  );
  expect(writeRes?.status).toBe(200);

  const afterWrite = await getSearch({ projectId: "p-files-test", q: "billing" });
  expect(afterWrite.body.map((r) => r.path)).toEqual(["output/specs/billing.md"]);

  const renameRes = await router.handle(
    new Request("http://localhost:4321/api/files/rename", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId: "p-files-test",
        path: "output/specs/billing.md",
        newName: "invoicing.md",
      }),
    }),
  );
  expect(renameRes?.status).toBe(200);

  const afterRename = await getSearch({ projectId: "p-files-test", q: "invoicing" });
  expect(afterRename.body.map((r) => r.path)).toEqual(["output/specs/invoicing.md"]);

  const delRes = await router.handle(
    new Request(
      `http://localhost:4321/api/files/delete?projectId=p-files-test&path=${encodeURIComponent("output/specs/invoicing.md")}`,
      { method: "DELETE" },
    ),
  );
  expect(delRes?.status).toBe(200);

  const afterDelete = await getSearch({ projectId: "p-files-test", q: "invoicing" });
  expect(afterDelete.body).toEqual([]);
});
