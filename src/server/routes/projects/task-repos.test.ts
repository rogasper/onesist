import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-task-repos-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects } = await import("~/server/db/schema");
const { router } = await import("./task-repos");

let root = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-task-repos-ws-"));
  fs.mkdirSync(path.join(root, ".git"));
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ scripts: { test: "bun test" } }));
  db.insert(projects).values({ id: "p-repos", name: "Repo", rootPath: root }).run();
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

test("GET lists the root repo with a suggestion for its checks", async () => {
  const { status, body } = await call("GET", "/api/projects/p-repos/repos");
  expect(status).toBe(200);
  expect(body.repos.map((r: any) => r.id)).toEqual(["."]);
  expect(body.repos[0].suggestedChecks).toEqual([{ name: "test", command: "npm run test" }]);
});

test("PUT saves checks for a known repo and refuses an unknown one", async () => {
  const ok = await call("PUT", "/api/projects/p-repos/repo-checks", { repoId: ".", checks: [{ name: "test", command: "bun test" }] });
  expect(ok.status).toBe(200);
  const listed = await call("GET", "/api/projects/p-repos/repos");
  expect(listed.body.repos[0].checks).toEqual([{ name: "test", command: "bun test" }]);
  expect(listed.body.repos[0].suggestedChecks).toEqual([]);

  const unknown = await call("PUT", "/api/projects/p-repos/repo-checks", { repoId: "input/code/nope", checks: [] });
  expect(unknown.status).toBe(400);
});
