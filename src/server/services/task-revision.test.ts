import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-revision-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, tasks, taskRuns } = await import("~/server/db/schema");
const { eq } = await import("drizzle-orm");
const { buildRevisionMessage, requestRevision, discardRun } = await import("./task-revision");

beforeAll(() => {
  db.insert(projects).values({ id: "p-rev2", name: "Rev2", rootPath: "/tmp/none-rev2" }).run();
  db.insert(tasks).values({ id: "t-rev2", projectId: "p-rev2", code: "api-RV-2", title: "api-RV-2: x", status: "in_review" }).run();
  db.insert(taskRuns).values({ id: "run-rev2", taskId: "t-rev2", projectId: "p-rev2", bundlePath: "/tmp/none-rev2", state: "in_review" }).run();
  db.insert(taskRuns).values({ id: "run-run", taskId: "t-rev2", projectId: "p-rev2", bundlePath: "/tmp/none-rev2", state: "running" }).run();
});

test("the revision message names each comment and finding with its place", () => {
  const text = buildRevisionMessage({
    comments: [{ file: "input/code/api/src/a.ts", line: 12, text: "pakai helper yang ada" }],
    findings: [{ file: "lib/format.ts", line: 3, message: "duplikat formatRupiah" }],
  });
  expect(text).toContain("input/code/api/src/a.ts:12");
  expect(text).toContain("pakai helper yang ada");
  expect(text).toContain("lib/format.ts:3");
  expect(text).toContain("Jangan commit");
});

test("a revision bumps the number, moves the run back to running, and returns the message", async () => {
  const res = await requestRevision("run-rev2", {
    comments: [{ file: "a.ts", line: 1, text: "rapikan" }],
    findings: [],
  });
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.revision).toBe(2);
  expect(res.text).toContain("a.ts:1");
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, "run-rev2")).get()!;
  expect(run.state).toBe("running");
  expect(run.revision).toBe(2);
  expect(db.select().from(tasks).where(eq(tasks.id, "t-rev2")).get()!.status).toBe("in_progress");
});

test("a revision without any comment or finding is refused", async () => {
  const res = await requestRevision("run-rev2", { comments: [], findings: [] });
  expect(res.ok).toBe(false);
});

test("a run that is still running cannot be revised", async () => {
  const res = await requestRevision("run-run", { comments: [{ file: "a.ts", line: 1, text: "x" }], findings: [] });
  expect(res.ok).toBe(false);
});

test("discarding a reviewed run marks it discarded and returns the task to To Do", async () => {
  db.insert(taskRuns).values({ id: "run-disc", taskId: "t-rev2", projectId: "p-rev2", bundlePath: "/tmp/none-rev2", state: "in_review" }).run();
  const res = await discardRun("run-disc");
  expect(res.ok).toBe(true);
  expect(db.select().from(taskRuns).where(eq(taskRuns.id, "run-disc")).get()!.state).toBe("discarded");
});
