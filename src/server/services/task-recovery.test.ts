import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-recovery-")), "data.db");

const { db } = await import("~/server/db/client");
const { chatRuns, projects, tasks, taskRuns } = await import("~/server/db/schema");
const { eq } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { recoverInterruptedRuns } = await import("~/server/agent/run-registry");

beforeAll(() => {
  db.insert(projects).values({ id: "p-rec", name: "Rec", rootPath: "/tmp/none-rec" }).run();
  db.insert(tasks).values({ id: "t-rec", projectId: "p-rec", code: "rec-1", title: "rec-1: x", status: "in_progress" }).run();
});

test("a run whose agent died with the app is failed, and its validating twin is left alone", () => {
  const waitThread = store.createThread({ projectId: "p-rec", title: "wait" });
  const valThread = store.createThread({ projectId: "p-rec", title: "val" });
  db.insert(chatRuns).values({ id: "crun-wait", threadId: waitThread.id, status: "running", stepCount: 0 }).run();
  db.insert(taskRuns).values({ id: "run-rec-wait", taskId: "t-rec", projectId: "p-rec", threadId: waitThread.id, bundlePath: "/tmp/rec", state: "waiting_input" }).run();
  db.insert(chatRuns).values({ id: "crun-val", threadId: valThread.id, status: "running", stepCount: 0 }).run();
  db.insert(taskRuns).values({ id: "run-rec-val", taskId: "t-rec", projectId: "p-rec", threadId: valThread.id, bundlePath: "/tmp/rec", state: "validating" }).run();

  recoverInterruptedRuns();

  const waiting = db.select().from(taskRuns).where(eq(taskRuns.id, "run-rec-wait")).get()!;
  expect(waiting.state).toBe("failed");
  expect(waiting.error).toBe("Aplikasi ditutup saat run berjalan.");
  expect(db.select().from(taskRuns).where(eq(taskRuns.id, "run-rec-val")).get()!.state).toBe("validating");
});
