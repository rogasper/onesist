/**
 * Regression: answering an approval.
 *   - "tolak dengan catatan": the note reaches the run as a user message, so the
 *     model reads what the user wants instead of a bare refusal
 *   - a plain denial sends nothing to the run
 *   - a thread-scoped answer remembers the rule for later calls of that kind
 *
 *   bun test src/server/agent/approval-answer.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-answer-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const reg = await import("./run-registry");
const rules = await import("./approval-rules");

beforeAll(() => {
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-ans', 'Ans', '/tmp')`);
});

function openApproval(runId: string, threadId: string, toolCallId: string, name: string, args: unknown) {
  reg.createRun({ runId, threadId, projectId: "p-ans" });
  return reg.awaitApproval(runId, { toolCallId, name, preview: "x", args });
}

test("a denial with a note puts the note in front of the model", async () => {
  const pending = openApproval("run_n1", "t-n1", "call_n1", "write_file", { path: "a.md" });
  expect(reg.resolveApproval("run_n1", "call_n1", "denied", { feedback: "pakai nama berkas lain" })).toBe(true);
  expect(await pending).toBe("denied");
  const inbox = reg.drainInjectedMessages("run_n1");
  expect(inbox.length).toBe(1);
  expect((inbox[0].parts[0] as any).text).toContain("Catatan dari user: pakai nama berkas lain");
  reg.finishRun("run_n1", "stopped");
});

test("a plain denial sends nothing to the run", async () => {
  const pending = openApproval("run_n2", "t-n2", "call_n2", "write_file", { path: "b.md" });
  reg.resolveApproval("run_n2", "call_n2", "denied");
  await pending;
  expect(reg.drainInjectedMessages("run_n2")).toEqual([]);
  reg.finishRun("run_n2", "stopped");
});

test("a thread-scoped approval remembers the rule for later calls in that thread", async () => {
  rules.resetThreadRules();
  const pending = openApproval("run_n3", "t-n3", "call_n3", "edit_file", { path: "c.md" });
  reg.resolveApproval("run_n3", "call_n3", "approved", { scope: "thread" });
  expect(await pending).toBe("approved");
  expect(rules.ruleAllows({ threadId: "t-n3", projectId: "p-ans", name: "edit_file", args: { path: "d.md" } })).toBe(true);
  expect(rules.ruleAllows({ threadId: "t-other", projectId: "p-ans", name: "edit_file", args: {} })).toBe(false);
  reg.finishRun("run_n3", "done");
});
