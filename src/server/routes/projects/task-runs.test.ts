import { beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-task-runs-route-")), "data.db");
process.env.SA_WORKTREES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-task-runs-wt-"));

const { db } = await import("~/server/db/client");
const { llmProviders, projects, tasks } = await import("~/server/db/schema");
const { router } = await import("./task-runs");
const { updateExecSettings } = await import("~/server/services/exec-settings");

const git = (cwd: string, args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "ignore" });

let root = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-task-runs-ws-"));
  const api = path.join(root, "input", "code", "api");
  fs.mkdirSync(api, { recursive: true });
  git(api, ["init", "-q", "-b", "main"]);
  fs.writeFileSync(path.join(api, "README.md"), "api\n");
  git(api, ["add", "."]);
  git(api, ["commit", "-q", "-m", "init"]);
  db.insert(llmProviders).values({ id: "prov-cli-r", name: "OpenCode route", apiStyle: "cli", cliAgent: "opencode" }).run();
  db.insert(projects).values({ id: "p-rr", name: "Route runs", rootPath: root }).run();
  updateExecSettings("p-rr", { execProviderId: "prov-cli-r" });
  db.insert(tasks).values({
    id: "t-rr-ready", projectId: "p-rr", code: "api-R-1", title: "api-R-1: Login", status: "todo",
    reposJson: '["input/code/api"]', filesScopeJson: '["input/code/api/README.md"]', acceptanceCriteriaJson: '["Login"]',
  }).run();
  db.insert(tasks).values({ id: "t-rr-raw", projectId: "p-rr", code: "api-R-2", title: "api-R-2: Belum", status: "todo" }).run();
});

const call = async (method: string, url: string) => {
  const res = await router.handle(new Request(`http://localhost:4321${url}`, { method }));
  if (!res) throw new Error(`route did not match: ${method} ${url}`);
  return { status: res.status, body: (await res.json()) as any };
};

test("starting a ready task returns its thread and prompt; a task that is not ready is refused", async () => {
  const ok = await call("POST", "/api/projects/p-rr/tasks/t-rr-ready/runs");
  expect(ok.status).toBe(201);
  expect(ok.body.text).toContain("```onesist-report");
  const refused = await call("POST", "/api/projects/p-rr/tasks/t-rr-raw/runs");
  expect(refused.status).toBe(409);
  expect(refused.body.error).toContain("Task belum siap");
});

test("the task-runs list shows the newest run of the task with its repo", async () => {
  const { status, body } = await call("GET", "/api/projects/p-rr/task-runs");
  expect(status).toBe(200);
  const run = body.find((r: any) => r.taskId === "t-rr-ready");
  expect(run.state).toBe("running");
  expect(run.repos[0].repo).toBe("input/code/api");
});
