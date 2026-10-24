import { beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-validation-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, tasks, taskRuns, taskRunRepos, chatMessages } = await import("~/server/db/schema");
const { eq } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { runCommand, validateRun } = await import("./task-validation");

const git = (cwd: string, args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "ignore" });

let root = "";
let wt = "";
let baseCommit = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-validation-ws-"));
  wt = path.join(root, "input", "code", "api");
  fs.mkdirSync(wt, { recursive: true });
  git(wt, ["init", "-q", "-b", "main"]);
  fs.writeFileSync(path.join(wt, "README.md"), "api\n");
  git(wt, ["add", "."]);
  git(wt, ["commit", "-q", "-m", "init"]);
  baseCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: wt, encoding: "utf-8" }).trim();
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".agents", "onesist-worktree.json"),
    JSON.stringify({ checks: { "input/code/api": [{ name: "marker", command: "test -f ok.txt" }] } }),
  );
  db.insert(projects).values({ id: "p-val", name: "Val", rootPath: root }).run();
  db.insert(tasks).values({
    id: "t-val", projectId: "p-val", code: "api-V-1", title: "api-V-1: x", status: "in_progress",
    filesScopeJson: '["input/code/api/src"]', acceptanceCriteriaJson: '["Login memakai OTP"]',
  }).run();
});

function seedRun(id: string, state: string, error: string | null = null) {
  const thread = store.createThread({ projectId: "p-val", title: "Run" });
  db.insert(taskRuns).values({ id, taskId: "t-val", projectId: "p-val", threadId: thread.id, bundlePath: root, state, error }).run();
  db.insert(taskRunRepos).values({ id: `rr-${id}`, runId: id, repo: "input/code/api", worktreePath: wt, branch: "main", baseCommit }).run();
  return thread.id;
}

test("a command is run in its folder, with its exit code and output tail", async () => {
  const ok = await runCommand(wt, "echo hi", 5_000);
  expect(ok.ok).toBe(true);
  expect(ok.tail).toContain("hi");
  const bad = await runCommand(wt, "exit 3", 5_000);
  expect(bad.ok).toBe(false);
  expect(bad.exitCode).toBe(3);
});

test("a command that runs too long is stopped and counts as failed", async () => {
  const slow = await runCommand(wt, "sleep 5", 200);
  expect(slow.ok).toBe(false);
});

test("a run whose checks pass moves to in_review and its task with it", async () => {
  const threadId = seedRun("run-pass", "validating");
  store.appendMessage({
    threadId,
    role: "assistant",
    parts: [{ type: "text", text: '```onesist-report\n{"summary":"ok","acceptance":[{"criterion":"Login memakai OTP","met":true,"evidence":["src/a.ts:1"]}],"notes":"","questionsAsked":[]}\n```' }],
  });
  fs.writeFileSync(path.join(wt, "ok.txt"), "x");
  fs.mkdirSync(path.join(wt, "src"), { recursive: true });
  fs.writeFileSync(path.join(wt, "src", "a.ts"), "export {};\n");
  fs.writeFileSync(path.join(wt, "stray.txt"), "y");
  const res = await validateRun("run-pass");
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.validation.passed).toBe(true);
  expect(res.validation.outsideScope.sort()).toEqual(["input/code/api/ok.txt", "input/code/api/stray.txt"]);
  expect(db.select().from(taskRuns).where(eq(taskRuns.id, "run-pass")).get()!.state).toBe("in_review");
  expect(db.select().from(tasks).where(eq(tasks.id, "t-val")).get()!.status).toBe("in_review");
  expect(execFileSync("git", ["log", "-1", "--format=%s"], { cwd: wt, encoding: "utf-8" }).trim()).toBe("api-V-1: revisi 1");
});

test("a failing check fails the run and names the check", async () => {
  seedRun("run-fail", "validating");
  fs.rmSync(path.join(wt, "ok.txt"), { force: true });
  const res = await validateRun("run-fail");
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.validation.passed).toBe(false);
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, "run-fail")).get()!;
  expect(run.state).toBe("failed");
  expect(run.error).toBe("Cek gagal: marker (input/code/api)");
});

test("a run that is already in review is not validated again", async () => {
  const res = await validateRun("run-pass");
  expect(res.ok).toBe(false);
});
