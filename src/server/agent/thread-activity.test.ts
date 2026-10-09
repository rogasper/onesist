/**
 * Regression: the thread list shows a run going, and what it waits for, only while the
 * run is still running.
 *
 *   bun test src/server/agent/thread-activity.test.ts
 */
import { expect, test } from "bun:test";
import { threadActivityOf } from "./thread-activity";

const run = (threadId: string, status: string, approvals = 0, questions = 0) => ({
  threadId,
  status,
  pending: new Map(Array.from({ length: approvals }, (_, i) => [String(i), {}])),
  questions: new Map(Array.from({ length: questions }, (_, i) => [String(i), {}])),
});

test("a running thread shows what it waits for; a finished run is not shown", () => {
  const map = threadActivityOf([run("thr_a", "running", 1, 2), run("thr_b", "done", 3, 0)]);
  expect(map.get("thr_a")).toEqual({ running: true, pendingApprovals: 1, pendingQuestions: 2 });
  expect(map.has("thr_b")).toBe(false);
  expect(map.has("thr_c")).toBe(false);
});
