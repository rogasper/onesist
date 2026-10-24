import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-run-review-route-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, taskRuns, tasks } = await import("~/server/db/schema");
const { router } = await import("./task-runs");

beforeAll(() => {
  db.insert(projects).values({ id: "p-rrv", name: "RRV", rootPath: "/tmp/none-rrv" }).run();
  db.insert(tasks).values({ id: "t-rrv", projectId: "p-rrv", code: "api-RR-1", title: "api-RR-1: x", status: "in_progress" }).run();
  db.insert(taskRuns).values({ id: "run-rrv", taskId: "t-rrv", projectId: "p-rrv", bundlePath: "/tmp/none-rrv", state: "running" }).run();
});

const call = async (method: string, url: string) => {
  const res = await router.handle(new Request(`http://localhost:4321${url}`, { method }));
  if (!res) throw new Error(`route did not match: ${method} ${url}`);
  return { status: res.status, body: (await res.json()) as any };
};

test("a run that is still running cannot be validated", async () => {
  const res = await call("POST", "/api/projects/p-rrv/task-runs/run-rrv/validate");
  expect(res.status).toBe(409);
});

test("a review opens a thread, and the list shows it on the run", async () => {
  const started = await call("POST", "/api/projects/p-rrv/task-runs/run-rrv/review");
  expect(started.status).toBe(201);
  expect(started.body.text).toContain("```onesist-review");
  const list = await call("GET", "/api/projects/p-rrv/task-runs");
  expect(list.body[0].state).toBe("running");
  expect(list.body[0].validation).toBeNull();
});
