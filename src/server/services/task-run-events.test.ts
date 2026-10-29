import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-run-events-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, tasks, taskRuns } = await import("~/server/db/schema");
const { eq } = await import("drizzle-orm");
const { applyRunEvent } = await import("./task-runs");

beforeAll(() => {
  db.insert(projects).values({ id: "p-ev", name: "Ev" }).run();
  db.insert(tasks).values({ id: "t-ev", projectId: "p-ev", code: "ev-1", title: "ev-1: x", status: "in_progress" }).run();
  db.insert(taskRuns).values({ id: "run-ev", taskId: "t-ev", projectId: "p-ev", threadId: "thr-ev", bundlePath: "/tmp/x", state: "running" }).run();
});

const stateOf = () => db.select().from(taskRuns).where(eq(taskRuns.id, "run-ev")).get()!.state;

test("a question pauses the run and its answer resumes it", () => {
  applyRunEvent("chat:question", { threadId: "thr-ev", runId: "r", questionId: "q", questions: [] });
  expect(stateOf()).toBe("waiting_input");
  applyRunEvent("chat:question-resolved", { threadId: "thr-ev", questionId: "q" });
  expect(stateOf()).toBe("running");
});

test("events for other threads are ignored", () => {
  applyRunEvent("chat:question", { threadId: "thr-other", runId: "r", questionId: "q", questions: [] });
  expect(stateOf()).toBe("running");
});

test("a finished turn hands the run to validation", () => {
  applyRunEvent("chat:run", { threadId: "thr-ev", status: "done", error: null });
  expect(stateOf()).toBe("validating");
});

test("an interrupted or failed chat run marks the run failed with the reason", () => {
  db.update(taskRuns).set({ state: "running", error: null }).where(eq(taskRuns.id, "run-ev")).run();
  applyRunEvent("chat:run", { threadId: "thr-ev", status: "error", error: "provider timeout" });
  const row = db.select().from(taskRuns).where(eq(taskRuns.id, "run-ev")).get()!;
  expect(row.state).toBe("failed");
  expect(row.error).toBe("provider timeout");
});
