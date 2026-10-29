import { expect, test } from "bun:test";
import { TASK_STATUSES, isTaskStatus, normalizeStatus, STATUS_LABELS } from "./task-status";

test("the four statuses keep done as the stored value for Completed", () => {
  expect(TASK_STATUSES).toEqual(["todo", "in_progress", "in_review", "done"]);
  expect(STATUS_LABELS.done).toBe("Completed");
  expect(STATUS_LABELS.in_review).toBe("In Review");
});

test("unknown or legacy statuses fall back to todo", () => {
  for (const v of [null, undefined, "", "review", "blocked", 3]) expect(normalizeStatus(v)).toBe("todo");
  expect(normalizeStatus("in_review")).toBe("in_review");
  expect(isTaskStatus("done")).toBe(true);
  expect(isTaskStatus("review")).toBe(false);
});
