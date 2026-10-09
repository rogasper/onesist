/**
 * Regression: ask_user.
 *   - the answers come back to the tool, matched to the questions by position
 *   - a run that ends first drops the question: the tool gets no answers and does
 *     not wait forever
 *   - the tool exists only where a user can answer (the main agent, not subagents)
 *
 *   bun test src/server/agent/ask-user.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-ask-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const reg = await import("./run-registry");
const { buildTools } = await import("./tools");

beforeAll(() => {
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-ask', 'Ask', '/tmp')`);
});

const questions = [
  { question: "Format apa?", options: ["Markdown", "DBML"] },
  { question: "Nama modul?" },
];

test("answers reach the tool in the order the questions were asked", async () => {
  reg.createRun({ runId: "run_a1", threadId: "t-a1", projectId: "p-ask" });
  const tools: any = buildTools({
    projectId: "p-ask",
    root: "/tmp",
    threadId: "t-a1",
    includeMutating: false,
    askUser: (qs) => reg.awaitQuestion("run_a1", qs),
  });
  const pending = tools.ask_user.execute({ questions });
  await new Promise((r) => setTimeout(r, 10));
  const [open] = reg.listPendingQuestions("run_a1");
  expect(open.questions.length).toBe(2);
  expect(reg.resolveQuestion("run_a1", open.questionId, ["DBML", "modul-x"])).toBe(true);
  expect(await pending).toBe("Format apa? → DBML\nNama modul? → modul-x");
  reg.finishRun("run_a1", "done");
});

test("a run that ends first drops the question, and the tool says so", async () => {
  reg.createRun({ runId: "run_a2", threadId: "t-a2", projectId: "p-ask" });
  const tools: any = buildTools({
    projectId: "p-ask",
    root: "/tmp",
    threadId: "t-a2",
    includeMutating: false,
    askUser: (qs) => reg.awaitQuestion("run_a2", qs),
  });
  const pending = tools.ask_user.execute({ questions });
  await new Promise((r) => setTimeout(r, 10));
  reg.stopRun("run_a2");
  expect(await pending).toContain("Tidak ada jawaban dari user");
  expect(reg.listPendingQuestions("run_a2")).toEqual([]);
});

test("a question for a run that is not active gets no answer at once", async () => {
  expect(await reg.awaitQuestion("run_missing", questions)).toBeNull();
});

test("the tool is absent where no user can answer", () => {
  const tools: any = buildTools({ projectId: "p-ask", root: "/tmp", threadId: "t-x", includeMutating: false });
  expect(tools.ask_user).toBeUndefined();
});

test("options given as objects are accepted and shown by their label", async () => {
  reg.createRun({ runId: "run_a3", threadId: "t-a3", projectId: "p-ask" });
  let seen: unknown = null;
  const tools: any = buildTools({
    projectId: "p-ask",
    root: "/tmp",
    threadId: "t-a3",
    includeMutating: false,
    askUser: async (qs) => {
      seen = qs;
      return ["Markdown"];
    },
  });
  const out = await tools.ask_user.execute({
    questions: [{ question: "Format?", options: [{ label: "Markdown", description: "Dokumen .md" }, { label: "DBML" }] }],
  });
  expect(out).toBe("Format? → Markdown");
  expect(seen).toEqual([{ question: "Format?", options: ["Markdown", "DBML"] }]);
  reg.finishRun("run_a3", "done");
});
