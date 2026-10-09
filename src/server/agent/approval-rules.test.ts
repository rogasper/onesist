/**
 * Regression: remembered approvals.
 *   - a bash prefix covers that command only, never a command that chains another
 *   - a thread rule covers that thread only; a project rule covers every thread of
 *     that project and survives a restart (it is stored in the settings table)
 *   - "once" remembers nothing
 *
 *   bun test src/server/agent/approval-rules.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-rules-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const rules = await import("./approval-rules");

beforeAll(() => {
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-r1', 'R1', '/tmp')`);
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-r2', 'R2', '/tmp')`);
});

test("a command prefix is its first word and a sub-command, and never a chained command", () => {
  expect(rules.commandPrefix("bun run build")).toBe("bun run");
  expect(rules.commandPrefix("git status")).toBe("git status");
  expect(rules.commandPrefix("ls")).toBe("ls");
  expect(rules.commandPrefix("rm -rf build")).toBe("rm");
  expect(rules.commandPrefix("bun run build && rm -rf ~")).toBeNull();
  expect(rules.commandPrefix("bun run $(whoami)")).toBeNull();
  expect(rules.commandPrefix("./script.sh")).toBeNull();
});

test("a bash prefix covers the same command family, not a chained one", () => {
  rules.resetThreadRules();
  expect(rules.rememberApproval({ threadId: "t-b", projectId: "p-r1", name: "bash", args: { command: "bun run build" }, scope: "thread" })).toBe(true);
  expect(rules.ruleAllows({ threadId: "t-b", projectId: "p-r1", name: "bash", args: { command: "bun run test" } })).toBe(true);
  expect(rules.ruleAllows({ threadId: "t-b", projectId: "p-r1", name: "bash", args: { command: "bun run test; rm -rf ~" } })).toBe(false);
  expect(rules.ruleAllows({ threadId: "t-b", projectId: "p-r1", name: "bash", args: { command: "bunx other" } })).toBe(false);
});

test("a thread rule covers that thread only", () => {
  rules.resetThreadRules();
  rules.rememberApproval({ threadId: "t-a", projectId: "p-r1", name: "write_file", args: {}, scope: "thread" });
  expect(rules.ruleAllows({ threadId: "t-a", projectId: "p-r1", name: "write_file", args: {} })).toBe(true);
  expect(rules.ruleAllows({ threadId: "t-other", projectId: "p-r1", name: "write_file", args: {} })).toBe(false);
});

test("a project rule covers every thread of that project, and no other project", () => {
  rules.resetThreadRules();
  rules.rememberApproval({ threadId: "t-p", projectId: "p-r1", name: "edit_file", args: {}, scope: "project" });
  expect(rules.ruleAllows({ threadId: "t-new", projectId: "p-r1", name: "edit_file", args: {} })).toBe(true);
  expect(rules.ruleAllows({ threadId: "t-new", projectId: "p-r2", name: "edit_file", args: {} })).toBe(false);
});

test("a project rule is read back from storage, so it survives a restart of the thread memory", () => {
  rules.resetThreadRules();
  expect(rules.listRules({ threadId: "t-x", projectId: "p-r1" }).project.tools).toContain("edit_file");
});

test("'once' remembers nothing", () => {
  rules.resetThreadRules();
  expect(rules.rememberApproval({ threadId: "t-o", projectId: "p-r2", name: "write_file", args: {}, scope: "once" })).toBe(false);
  expect(rules.ruleAllows({ threadId: "t-o", projectId: "p-r2", name: "write_file", args: {} })).toBe(false);
});

test("a chained command cannot be remembered as a prefix", () => {
  rules.resetThreadRules();
  expect(rules.rememberApproval({ threadId: "t-c", projectId: "p-r2", name: "bash", args: { command: "ls && rm x" }, scope: "project" })).toBe(false);
});
