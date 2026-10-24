/**
 * Task routes: the in_review status, the execution fields, re-import, and project delete.
 *
 *   bun test src/server/routes/projects/tasks.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-tasks-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, tasks, projectExecSettings } = await import("~/server/db/schema");
const { sql, eq } = await import("drizzle-orm");
const { router: tasksRouter } = await import("./tasks");
const { router: projectsRouter } = await import("./index");

let root = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-tasks-ws-"));
  fs.mkdirSync(path.join(root, "output", "task"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "output", "task", "task_api.md"),
    "# Task API\n\n## Task AP-1: Buat endpoint login\n\n- Story Points: 3\n\nDeskripsi endpoint login.\n",
  );
  db.insert(projects).values({ id: "p-tasks", name: "Tugas", rootPath: root }).run();
  db.insert(tasks).values({ id: "t1", projectId: "p-tasks", code: "api-AP-1", title: "api-AP-1: Buat endpoint login", status: "todo" }).run();
});

const call = async (r: typeof tasksRouter | typeof projectsRouter, method: string, url: string, body?: unknown) => {
  const res = await r.handle(
    new Request(`http://localhost:4321${url}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  if (!res) throw new Error(`route did not match: ${method} ${url}`);
  return { status: res.status, body: (await res.json()) as any };
};

const put = (taskId: string, body: unknown) => call(tasksRouter, "PUT", `/api/projects/p-tasks/tasks/${taskId}`, body);

test("PUT accepts in_review and the execution fields", async () => {
  const res = await put("t1", {
    status: "in_review",
    execProviderId: "prov-1",
    execModel: "m-1",
    reposJson: '["input/code/api"]',
  });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe("in_review");
  expect(res.body.execModel).toBe("m-1");
  expect(res.body.reposJson).toBe('["input/code/api"]');
});

test("PUT and bulk reject an unknown status with an Indonesian message", async () => {
  const bad = await put("t1", { status: "review" });
  expect(bad.status).toBe(400);
  expect(bad.body.error).toBe("Status tidak dikenal");
  const bulk = await call(tasksRouter, "POST", "/api/projects/p-tasks/tasks/bulk", { ids: ["t1"], patch: { status: "blocked" } });
  expect(bulk.status).toBe(400);
});

test("re-import keeps status and the execution fields of an existing task", async () => {
  const res = await call(tasksRouter, "POST", "/api/projects/p-tasks/tasks/import", {});
  expect(res.status).toBe(200);
  const row = db.select().from(tasks).where(eq(tasks.id, "t1")).get()!;
  expect(row.status).toBe("in_review");
  expect(row.execModel).toBe("m-1");
  expect(row.reposJson).toBe('["input/code/api"]');
});

test("deleting a project removes its execution settings before the project row", async () => {
  db.insert(projects).values({ id: "p-del", name: "Hapus", rootPath: root }).run();
  db.run(sql`INSERT INTO project_exec_settings (project_id, task_mode) VALUES ('p-del', 'delivery')`);
  const res = await call(projectsRouter, "DELETE", "/api/projects/p-del");
  expect(res.status).toBe(200);
  expect(db.select().from(projectExecSettings).where(eq(projectExecSettings.projectId, "p-del")).all()).toHaveLength(0);
});
