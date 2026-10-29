import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-review-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, taskRuns, tasks } = await import("~/server/db/schema");
const { eq } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { buildReviewPrompt, startReview, readReview } = await import("./task-review");

beforeAll(() => {
  db.insert(projects).values({ id: "p-rev", name: "Rev", rootPath: "/tmp/none" }).run();
  db.insert(tasks).values({ id: "t-rev", projectId: "p-rev", code: "api-RV-1", title: "api-RV-1: x", status: "in_review" }).run();
  const thread = store.createThread({ projectId: "p-rev", title: "Run" });
  db.insert(taskRuns).values({ id: "run-rev", taskId: "t-rev", projectId: "p-rev", threadId: thread.id, bundlePath: "/tmp/none", state: "in_review" }).run();
});

test("the reviewer prompt asks for a read-only review in the review block format", () => {
  const text = buildReviewPrompt({ title: "Login", code: "api-RV-1", criteria: ["OTP"], changed: ["input/code/api/src/a.ts"] });
  expect(text).toContain("JANGAN mengubah berkas");
  expect(text).toContain("```onesist-review");
  expect(text).toContain("input/code/api/src/a.ts");
});

test("a review opens a read-only thread, and its findings are read back from the answer", async () => {
  const start = await startReview("run-rev", { reviewerProviderId: null });
  expect(start.ok).toBe(true);
  if (!start.ok) return;
  expect(store.getThread(start.threadId)!.permissionMode).toBe("readonly");
  expect(db.select().from(taskRuns).where(eq(taskRuns.id, "run-rev")).get()!.reviewerThreadId).toBe(start.threadId);

  const early = await readReview("run-rev", start.threadId);
  expect(early.ok).toBe(false);

  store.appendMessage({
    threadId: start.threadId,
    role: "assistant",
    parts: [{ type: "text", text: '```onesist-review\n[{"file":"lib/format.ts","line":12,"severity":"warn","message":"mirip formatCurrency"}]\n```' }],
  });
  const done = await readReview("run-rev", start.threadId);
  expect(done.ok).toBe(true);
  if (done.ok) expect(done.findings).toHaveLength(1);
});
