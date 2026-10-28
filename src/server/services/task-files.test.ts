import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-files-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, tasks, taskRuns, taskRunRepos } = await import("~/server/db/schema");
const { readRunFile, writeRunFile } = await import("./task-files");

let wt = "";
beforeAll(() => {
  wt = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-files-wt-"));
  fs.writeFileSync(path.join(wt, "a.ts"), "export const a = 1;\n");
  db.insert(projects).values({ id: "p-files", name: "Files", rootPath: wt }).run();
  db.insert(tasks).values({ id: "t-files", projectId: "p-files", code: "f-1", title: "f-1: x", status: "in_review" }).run();
  db.insert(taskRuns).values({ id: "run-files", taskId: "t-files", projectId: "p-files", bundlePath: wt, state: "in_review" }).run();
  db.insert(taskRunRepos).values({ id: "rr-files", runId: "run-files", repo: ".", worktreePath: wt }).run();
});

test("a file of the run's worktree can be read and written", async () => {
  expect((await readRunFile("run-files", ".", "a.ts"))).toEqual({ ok: true, content: "export const a = 1;\n" });
  const wrote = await writeRunFile("run-files", ".", "a.ts", "export const a = 2;\n");
  expect(wrote.ok).toBe(true);
  expect(fs.readFileSync(path.join(wt, "a.ts"), "utf-8")).toBe("export const a = 2;\n");
});

test("paths that leave the worktree are refused", async () => {
  expect((await readRunFile("run-files", ".", "../secret")).ok).toBe(false);
  expect((await writeRunFile("run-files", ".", "/etc/hosts", "x")).ok).toBe(false);
  expect((await readRunFile("run-files", "input/code/other", "a.ts")).ok).toBe(false);
});
