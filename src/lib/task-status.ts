/**
 * The task statuses shared by the server and the board. `done` is the stored value
 * behind the "Completed" column, so existing data and exports keep working.
 */
export const TASK_STATUSES = ["todo", "in_progress", "in_review", "done"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Completed",
};

export function isTaskStatus(v: unknown): v is TaskStatus {
  return typeof v === "string" && (TASK_STATUSES as readonly string[]).includes(v);
}

/** Anything unknown (legacy values, nulls) reads as To Do so the card stays visible. */
export function normalizeStatus(v: unknown): TaskStatus {
  return isTaskStatus(v) ? v : "todo";
}
