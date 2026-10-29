import { beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-diff-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, tasks, taskRuns, taskRunRepos } = await import("~/server/db/schema");
const { runDiff, PATCH_LIMIT } = await import("./task-diff");

const git = (cwd: string, args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "ignore" });

let wt = "";
let base = "";
beforeAll(() => {
  wt = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-diff-wt-"));
  git(wt, ["init", "-q", "-b", "main"]);
  fs.writeFileSync(path.join(wt, "a.ts"), "export const a = 1;\n");
  git(wt, ["add", "."]);
  git(wt, ["commit", "-q", "-m", "init"]);
  base = execFileSync("git", ["rev-parse", "HEAD"], { cwd: wt, encoding: "utf-8" }).trim();
  fs.writeFileSync(path.join(wt, "a.ts"), "export const a = 2;\n");
  fs.writeFileSync(path.join(wt, "new.ts"), "export const n = 1;\n");
  fs.writeFileSync(path.join(wt, "big.txt"), "x".repeat(PATCH_LIMIT + 10));
  db.insert(projects).values({ id: "p-diff", name: "Diff", rootPath: wt }).run();
  db.insert(tasks).values({ id: "t-diff", projectId: "p-diff", code: "d-1", title: "d-1: x", status: "in_review" }).run();
  db.insert(taskRuns).values({ id: "run-diff", taskId: "t-diff", projectId: "p-diff", bundlePath: wt, state: "in_review" }).run();
  db.insert(taskRunRepos).values({ id: "rr-diff", runId: "run-diff", repo: ".", worktreePath: wt, branch: "main", baseCommit: base }).run();
});

test("the diff lists changed and new files with their patches", async () => {
  const diff = await runDiff("run-diff");
  expect(diff).not.toBeNull();
  const files = diff![0].files;
  const a = files.find((f) => f.path === "a.ts")!;
  expect(a.status).toBe("modified");
  expect(a.patch).toContain("+export const a = 2;");
  const n = files.find((f) => f.path === "new.ts")!;
  expect(n.status).toBe("untracked");
  expect(n.patch).toContain("+export const n = 1;");
});

test("a very large patch is cut at the limit and marked truncated", async () => {
  const big = (await runDiff("run-diff"))![0].files.find((f) => f.path === "big.txt")!;
  expect(big.truncated).toBe(true);
  expect(big.patch.length).toBeLessThanOrEqual(PATCH_LIMIT);
});
