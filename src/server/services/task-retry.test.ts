import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-retry-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, tasks, taskRuns } = await import("~/server/db/schema");
const { eq } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { retryRun, buildRetryMessage } = await import("./task-retry");

beforeAll(() => {
  db.insert(projects).values({ id: "p-retry", name: "Retry", rootPath: "/tmp/none-retry" }).run();
  db.insert(tasks).values({ id: "t-retry", projectId: "p-retry", code: "r-1", title: "r-1: x", status: "in_progress" }).run();
});

test("retrying a failed check sends the failing output to the same thread and runs again", async () => {
  const thread = store.createThread({ projectId: "p-retry", title: "Run" });
  db.insert(taskRuns).values({
    id: "run-retry", taskId: "t-retry", projectId: "p-retry", threadId: thread.id, bundlePath: "/tmp/none-retry",
    state: "failed", error: "Cek gagal: typecheck (input/code/api)",
    validationJson: JSON.stringify({ ranAt: "x", passed: false, checks: [{ repo: "input/code/api", name: "typecheck", command: "tsc", ok: false, exitCode: 2, tail: "error TS2304: nama tidak ada" }], outsideScope: [], acceptance: [], reportFound: true }),
  }).run();
  const res = await retryRun("run-retry");
  expect(res.ok).toBe(true);
  expect(db.select().from(taskRuns).where(eq(taskRuns.id, "run-retry")).get()!.state).toBe("running");
});

test("a run that is not failed cannot be retried", async () => {
  db.insert(taskRuns).values({ id: "run-ok", taskId: "t-retry", projectId: "p-retry", bundlePath: "/tmp/none-retry", state: "in_review" }).run();
  expect((await retryRun("run-ok")).ok).toBe(false);
});

test("the retry message carries the failing check's output, or the reason the run stopped", () => {
  const checks = buildRetryMessage({
    error: "Cek gagal: typecheck (input/code/api)",
    validation: { ranAt: "x", passed: false, checks: [{ repo: "input/code/api", name: "typecheck", command: "tsc", ok: false, exitCode: 2, tail: "error TS2304: nama tidak ada" }], outsideScope: [], acceptance: [], reportFound: true },
  });
  expect(checks).toContain("error TS2304");
  expect(checks).toContain("exit 2");
  const stopped = buildRetryMessage({ error: "provider timeout", validation: null });
  expect(stopped).toContain("provider timeout");
});
