import { beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-integration-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, tasks, taskRuns, taskRunRepos } = await import("~/server/db/schema");
const { eq } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { updateExecSettings } = await import("./exec-settings");
const { approveRun } = await import("./task-integration");

const git = (cwd: string, args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "ignore" });
const out = (cwd: string, args: string[]) => execFileSync("git", args, { cwd, encoding: "utf-8" }).trim();

let root = "";
let wt = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-integration-ws-"));
  const api = path.join(root, "input", "code", "api");
  fs.mkdirSync(api, { recursive: true });
  git(api, ["init", "-q", "-b", "main"]);
  fs.writeFileSync(path.join(api, "a.txt"), "1\n");
  git(api, ["add", "."]);
  git(api, ["commit", "-q", "-m", "init"]);
  const base = out(api, ["rev-parse", "HEAD"]);
  // The run's worktree: a branch cut from main, with one change still uncommitted.
  wt = path.join(root, "run-wt");
  git(api, ["worktree", "add", "-q", "-b", "onesist/v-run", wt, "main"]);
  fs.writeFileSync(path.join(wt, "a.txt"), "2\n");

  db.insert(projects).values({ id: "p-int", name: "Int", rootPath: root }).run();
  db.insert(tasks).values({ id: "t-int", projectId: "p-int", code: "api-I-1", title: "api-I-1: Login", status: "in_review" }).run();
  const thread = store.createThread({ projectId: "p-int", title: "Run" });
  db.insert(taskRuns).values({ id: "run-int", taskId: "t-int", projectId: "p-int", threadId: thread.id, bundlePath: root, state: "in_review" }).run();
  db.insert(taskRunRepos).values({ id: "rr-int", runId: "run-int", repo: "input/code/api", worktreePath: wt, branch: "onesist/v-run", baseBranch: "main", baseCommit: base }).run();
});

test("branch mode: the leftover work is committed on the run's branch and the run is approved", async () => {
  updateExecSettings("p-int", { integration: "branch" });
  const res = await approveRun("run-int");
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.state).toBe("approved");
  const row = db.select().from(taskRunRepos).where(eq(taskRunRepos.id, "rr-int")).get()!;
  expect(row.integrated).toBe("branch");
  expect(row.commitSha).toBeTruthy();
  expect(out(wt, ["log", "-1", "--format=%s"])).toBe("api-I-1: Login");
  expect(db.select().from(taskRuns).where(eq(taskRuns.id, "run-int")).get()!.state).toBe("approved");
  expect(db.select().from(tasks).where(eq(tasks.id, "t-int")).get()!.status).toBe("done");
});

test("approving a run that is not in review is refused", async () => {
  const res = await approveRun("run-int");
  expect(res.ok).toBe(false);
});

test("merge mode: the branch is merged into the base branch of the repo", async () => {
  db.insert(tasks).values({ id: "t-int2", projectId: "p-int", code: "api-I-2", title: "api-I-2: Logout", status: "in_review" }).run();
  db.insert(taskRuns).values({ id: "run-int2", taskId: "t-int2", projectId: "p-int", bundlePath: root, state: "in_review" }).run();
  const api = path.join(root, "input", "code", "api");
  // A second branch with a commit of its own, ready to merge.
  git(api, ["worktree", "add", "-q", "-b", "onesist/v-merge", path.join(root, "merge-wt"), "main"]);
  fs.writeFileSync(path.join(root, "merge-wt", "b.txt"), "b\n");
  db.insert(taskRunRepos).values({ id: "rr-int2", runId: "run-int2", repo: "input/code/api", worktreePath: path.join(root, "merge-wt"), branch: "onesist/v-merge", baseBranch: "main", baseCommit: out(api, ["rev-parse", "main"]) }).run();
  updateExecSettings("p-int", { integration: "merge" });
  const res = await approveRun("run-int2");
  expect(res.ok).toBe(true);
  expect(out(api, ["log", "-1", "--format=%s", "main"])).toBe("api-I-2: Logout");
  expect(fs.existsSync(path.join(api, "b.txt"))).toBe(true);
  updateExecSettings("p-int", { integration: "branch" });
});
