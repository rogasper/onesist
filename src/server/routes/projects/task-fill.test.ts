import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-task-fill-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, tasks } = await import("~/server/db/schema");
const { eq } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { router } = await import("./task-fill");

let root = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-task-fill-ws-"));
  fs.mkdirSync(path.join(root, ".git"));
  db.insert(projects).values({ id: "p-fill", name: "Lengkapi", rootPath: root }).run();
  db.insert(tasks).values({ id: "t-fill", projectId: "p-fill", code: "api-AP-2", title: "api-AP-2: Login", status: "todo" }).run();
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
const taskRow = () => db.select().from(tasks).where(eq(tasks.id, "t-fill")).get()!;

let threadId = "";
test("starting Lengkapi opens a read-only thread and returns its prompt", async () => {
  const { status, body } = await call("POST", "/api/projects/p-fill/tasks/t-fill/fill");
  expect(status).toBe(201);
  threadId = body.threadId;
  expect(body.text).toContain("```onesist-fill");
  expect(store.getThread(threadId)!.permissionMode).toBe("readonly");
});

test("preview is refused until the agent has answered", async () => {
  const { status } = await call("GET", `/api/projects/p-fill/tasks/t-fill/fill/preview?threadId=${threadId}`);
  expect(status).toBe(422);
});

test("preview reads the answer, validates it, and saves nothing", async () => {
  const answer = [
    "Sudah dibaca.",
    "```onesist-fill",
    '{"repos":["."],"filesScope":["src/auth.ts","../secret"],"acceptanceCriteria":["Login memakai OTP"]}',
    "```",
  ].join("\n");
  store.appendMessage({ threadId, role: "assistant", parts: [{ type: "text", text: answer }] });
  const { status, body } = await call("GET", `/api/projects/p-fill/tasks/t-fill/fill/preview?threadId=${threadId}`);
  expect(status).toBe(200);
  expect(body.proposal.filesScope).toEqual(["src/auth.ts"]);
  expect(body.current.filesScope).toEqual([]);
  expect(taskRow().filesScopeJson).toBeNull();
});

test("apply writes the validated proposal, and an empty one leaves the task alone", async () => {
  const { status, body } = await call("POST", "/api/projects/p-fill/tasks/t-fill/fill/apply", {
    proposal: { repos: ["."], filesScope: ["src/auth.ts", "/etc/passwd"], acceptanceCriteria: ["Login memakai OTP"] },
  });
  expect(status).toBe(200);
  expect(body.filesScopeJson).toBe('["src/auth.ts"]');
  expect(taskRow().acceptanceCriteriaJson).toBe('["Login memakai OTP"]');

  await call("POST", "/api/projects/p-fill/tasks/t-fill/fill/apply", { proposal: { repos: [], filesScope: [], acceptanceCriteria: [] } });
  expect(taskRow().filesScopeJson).toBe('["src/auth.ts"]');
});

test("apply refuses a request without a proposal", async () => {
  const { status } = await call("POST", "/api/projects/p-fill/tasks/t-fill/fill/apply", {});
  expect(status).toBe(400);
});
