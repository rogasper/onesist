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

test("the diff, revise, and discard routes answer for a run of the project", async () => {
  const diff = await call("GET", "/api/projects/p-rrv/task-runs/run-rrv/diff");
  expect(diff.status).toBe(200);
  expect(diff.body.repos).toEqual([]);
  const empty = await call("POST", "/api/projects/p-rrv/task-runs/run-rrv/revise");
  expect(empty.status).toBe(409);
  const missing = await call("GET", "/api/projects/p-rrv/task-runs/run-none/diff");
  expect(missing.status).toBe(404);
});

test("queued runs report their place in the queue, oldest first", async () => {
  db.insert(projects).values({ id: "p-qpos", name: "QPos", rootPath: "/tmp/none-qpos" }).run();
  db.insert(tasks).values([
    { id: "t-qa", projectId: "p-qpos", code: "q-a", title: "q-a: x", status: "in_progress" },
    { id: "t-qb", projectId: "p-qpos", code: "q-b", title: "q-b: x", status: "in_progress" },
  ]).run();
  db.insert(taskRuns).values([
    { id: "run-qb", taskId: "t-qb", projectId: "p-qpos", bundlePath: "/tmp/qb", state: "queued", createdAt: "2026-10-24T10:02:00.000Z" },
    { id: "run-qa", taskId: "t-qa", projectId: "p-qpos", bundlePath: "/tmp/qa", state: "queued", createdAt: "2026-10-24T10:01:00.000Z" },
  ]).run();
  const list = await call("GET", "/api/projects/p-qpos/task-runs");
  const byId = Object.fromEntries(list.body.map((r: any) => [r.id, r.queuePosition]));
  expect(byId["run-qa"]).toBe(1);
  expect(byId["run-qb"]).toBe(2);
});

test("the live view answers with the state and the agent's latest words", async () => {
  const res = await call("GET", "/api/projects/p-rrv/task-runs/run-rrv/live");
  expect(res.status).toBe(200);
  expect(res.body.state).toBe("running");
  expect(res.body.lastText).toBeNull();
});
