/**
 * A Generate button asks the server for a task: a new chat thread and the prompt to send in it.
 *
 *   bun test src/server/routes/projects/agent-tasks.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-agent-tasks-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { router } = await import("./agent-tasks");

let root = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-agent-tasks-ws-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-agent-tasks', 'Tugas', ${root})`);
});

const post = async (projectId: string, body: unknown) => {
  const res = await router.handle(
    new Request(`http://localhost:4321/api/projects/${projectId}/agent-tasks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  if (!res) throw new Error("route did not match");
  return { status: res.status, body: (await res.json()) as any };
};

test("an OpenAPI task creates an agent thread that asks before writing, and returns its prompt", async () => {
  const { status, body } = await post("p-agent-tasks", { mode: "openapi" });
  expect(status).toBe(201);
  expect(body.title).toBe("Generate OpenAPI");
  expect(body.text).toContain("output/spec/openapi.yaml");
  expect(body.text).toContain(root);
  const thread = store.getThread(body.threadId)!;
  expect(thread.projectId).toBe("p-agent-tasks");
  expect(thread.title).toBe("Generate OpenAPI");
  expect(thread.mode).toBe("agent");
  expect(thread.permissionMode).toBe("ask");
});

test("an RTM task carries its scope into the title and the prompt", async () => {
  const { status, body } = await post("p-agent-tasks", { mode: "rtm", fsd: "FSD-Klaim", fds: ["fd_a.md", "", 3] });
  expect(status).toBe(201);
  expect(body.title).toBe("Generate RTM · FSD-Klaim");
  expect(body.text).toContain("FSD-Klaim");
});

test("a SIT task is created too", async () => {
  const { status, body } = await post("p-agent-tasks", { mode: "sit" });
  expect(status).toBe(201);
  expect(body.title).toBe("Generate SIT");
});

test("an unknown mode is refused and creates nothing", async () => {
  const before = store.listThreads("p-agent-tasks").length;
  const { status, body } = await post("p-agent-tasks", { mode: "generate" });
  expect(status).toBe(400);
  expect(body.error).toBe("Mode tugas tidak dikenal.");
  expect(store.listThreads("p-agent-tasks").length).toBe(before);
});

test("an unknown project is 404", async () => {
  expect((await post("tidak-ada", { mode: "openapi" })).status).toBe(404);
});
