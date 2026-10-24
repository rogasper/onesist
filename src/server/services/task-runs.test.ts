import { beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-runs-")), "data.db");

const { db } = await import("~/server/db/client");
const { llmProviders, projects, tasks, taskRuns } = await import("~/server/db/schema");
const { eq, sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { buildRunPrompt, startTaskRun } = await import("./task-runs");
const { updateExecSettings } = await import("./exec-settings");

const git = (cwd: string, args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "ignore" });

let root = "";
let baseDir = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-runs-ws-"));
  baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-runs-wt-"));
  const api = path.join(root, "input", "code", "api");
  fs.mkdirSync(api, { recursive: true });
  git(api, ["init", "-q", "-b", "main"]);
  fs.writeFileSync(path.join(api, "README.md"), "api\n");
  git(api, ["add", "."]);
  git(api, ["commit", "-q", "-m", "init"]);
  db.insert(llmProviders).values({ id: "prov-cli", name: "OpenCode CLI", apiStyle: "cli", cliAgent: "opencode" }).run();
  db.insert(llmProviders).values({ id: "prov-native", name: "Native", apiStyle: "completions" }).run();
  db.insert(projects).values({ id: "p-run", name: "Run", rootPath: root }).run();
  updateExecSettings("p-run", { execProviderId: "prov-cli", execModel: "m-1", maxParallel: 2 });
});

function task(id: string, over: Record<string, unknown> = {}) {
  db.insert(tasks)
    .values({
      id,
      projectId: "p-run",
      code: "api-AP-1",
      title: "api-AP-1: Login",
      status: "todo",
      reposJson: '["input/code/api"]',
      filesScopeJson: '["input/code/api/README.md"]',
      acceptanceCriteriaJson: '["Login memakai OTP"]',
      ...over,
    })
    .run();
  return db.select().from(tasks).where(eq(tasks.id, id)).get()!;
}

test("the run prompt names the run folder, the repos, and the acceptance criteria", () => {
  const text = buildRunPrompt({
    title: "Login",
    code: "api-AP-1",
    description: "Buat endpoint login",
    criteria: ["Login memakai OTP"],
    scope: ["input/code/api/README.md"],
    bundlePath: "/tmp/run-x",
    repos: [{ id: "input/code/api", worktreePath: "/tmp/run-x/api", branch: "onesist/api-1" }],
    doneDependencies: ["api-AP-0"],
  });
  expect(text).toContain("/tmp/run-x");
  expect(text).toContain("Login memakai OTP");
  expect(text).toContain("api-AP-0");
  expect(text).toContain("Jangan commit");
  expect(text).toContain("```onesist-report");
});

test("a task that is not ready is refused with the missing parts", async () => {
  const t = task("t-not-ready", { acceptanceCriteriaJson: null });
  const res = await startTaskRun({ projectId: "p-run", root, task: t, baseDir });
  expect(res.ok).toBe(false);
  if (!res.ok) {
    expect(res.status).toBe(409);
    expect(res.error).toContain("acceptance criteria");
  }
});

test("a native provider is refused, because the run would work in the project root", async () => {
  updateExecSettings("p-run", { execProviderId: "prov-native" });
  const res = await startTaskRun({ projectId: "p-run", root, task: task("t-native"), baseDir });
  expect(res.ok).toBe(false);
  updateExecSettings("p-run", { execProviderId: "prov-cli" });
});

test("a ready task starts a run: worktree in the run folder, a thread there, and in progress", async () => {
  const t = task("t-ready");
  const res = await startTaskRun({ projectId: "p-run", root, task: t, baseDir });
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, res.runId)).get()!;
  expect(run.state).toBe("running");
  expect(run.bundlePath.startsWith(baseDir)).toBe(true);
  const repoRows = db.all(sql`SELECT worktree_path AS p FROM task_run_repos WHERE run_id = ${run.id}`) as { p: string }[];
  expect(repoRows).toHaveLength(1);
  expect(fs.existsSync(repoRows[0].p)).toBe(true);
  const thread = store.getThread(res.threadId)!;
  expect(thread.permissionMode).toBe("ask");
  expect(thread.workspacePath).toBe(run.bundlePath);
  expect(db.select().from(tasks).where(eq(tasks.id, t.id)).get()!.status).toBe("in_progress");
});

test("a second run of the same task is refused while the first is active", async () => {
  const t = task("t-twice");
  expect((await startTaskRun({ projectId: "p-run", root, task: t, baseDir })).ok).toBe(true);
  const again = await startTaskRun({ projectId: "p-run", root, task: t, baseDir });
  expect(again.ok).toBe(false);
  if (!again.ok) expect(again.status).toBe(409);
});

test("the parallel limit refuses a run when it is reached", async () => {
  updateExecSettings("p-run", { maxParallel: 1 });
  const res = await startTaskRun({ projectId: "p-run", root, task: task("t-parallel"), baseDir });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.error).toContain("Batas paralel");
  updateExecSettings("p-run", { maxParallel: 2 });
});
