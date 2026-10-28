import { beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-queue-")), "data.db");

const { db } = await import("~/server/db/client");
const { llmProviders, projects, tasks, taskRuns } = await import("~/server/db/schema");
const { eq, sql } = await import("drizzle-orm");
const { startTaskRun, promoteQueued } = await import("./task-runs");
const { updateExecSettings } = await import("./exec-settings");

const git = (cwd: string, args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "ignore" });

let root = "";
let baseDir = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-queue-ws-"));
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-queue-wt-"));
  const api = path.join(root, "input", "code", "api");
  fs.mkdirSync(api, { recursive: true });
  git(api, ["init", "-q", "-b", "main"]);
  fs.writeFileSync(path.join(api, "README.md"), "api\n");
  git(api, ["add", "."]);
  git(api, ["commit", "-q", "-m", "init"]);
  db.insert(llmProviders).values({ id: "prov-q", name: "OpenCode Q", apiStyle: "cli", cliAgent: "opencode" }).run();
  db.insert(projects).values({ id: "p-q", name: "Queue", rootPath: root }).run();
  updateExecSettings("p-q", { execProviderId: "prov-q", maxParallel: 1 });
});

function task(id: string) {
  db.insert(tasks).values({
    id, projectId: "p-q", code: `q-${id}`, title: `q-${id}: x`, status: "todo",
    reposJson: '["input/code/api"]', filesScopeJson: '["input/code/api/README.md"]', acceptanceCriteriaJson: '["Selesai"]',
  }).run();
  return db.select().from(tasks).where(eq(tasks.id, id)).get()!;
}

test("when a slot frees up, the oldest queued run starts", async () => {
  const first = await startTaskRun({ projectId: "p-q", root, task: task("a"), baseDir });
  expect(first.ok && !first.queued).toBe(true);
  const second = await startTaskRun({ projectId: "p-q", root, task: task("b"), baseDir });
  expect(second.ok && second.queued).toBe(true);
  if (!second.ok) return;
  expect(db.select().from(taskRuns).where(eq(taskRuns.id, second.runId)).get()!.state).toBe("queued");

  // The first run is done with its work: it leaves the active states.
  db.update(taskRuns).set({ state: "in_review" }).where(eq(taskRuns.id, first.ok ? first.runId : "")).run();
  await promoteQueued("p-q");
  const started = db.select().from(taskRuns).where(eq(taskRuns.id, second.runId)).get()!;
  expect(started.state).toBe("running");
  expect(started.threadId).toBeTruthy();
});

test("a queued run whose task is no longer ready fails with the reason instead of starting", async () => {
  // Free every slot, then queue a run for a task that has since lost its acceptance criteria.
  db.run(sql`UPDATE task_runs SET state = 'discarded' WHERE state IN ('running', 'queued', 'waiting_input', 'validating')`);
  const stale = task("c");
  db.update(tasks).set({ acceptanceCriteriaJson: null }).where(eq(tasks.id, stale.id)).run();
  db.insert(taskRuns).values({ id: "run-stale", taskId: stale.id, projectId: "p-q", bundlePath: path.join(baseDir, "runs", "run-stale"), state: "queued", createdAt: new Date().toISOString() }).run();
  await promoteQueued("p-q");
  const row = db.select().from(taskRuns).where(eq(taskRuns.id, "run-stale")).get()!;
  expect(row.state).toBe("failed");
  expect(row.error).toContain("Task belum siap");
});
