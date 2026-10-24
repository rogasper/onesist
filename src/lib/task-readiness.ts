import type { Task } from "~/shared/types";

export type ReadinessProblem = "repo" | "scope" | "criteria";

export const PROBLEM_LABELS: Record<ReadinessProblem, string> = {
  repo: "repo",
  scope: "file scope",
  criteria: "acceptance criteria",
};

/** A stored JSON array with at least one item; anything else (missing, empty, broken) counts as none. */
function hasItems(json: string | null): boolean {
  if (!json) return false;
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) && value.length > 0;
  } catch {
    return false;
  }
}

/**
 * What a task still lacks before an agent can run it. The repo is implied when the project has
 * exactly one repo, so only a multi-repo project needs the task to name one.
 */
export function readinessProblems(task: Task, repoCount: number): ReadinessProblem[] {
  const problems: ReadinessProblem[] = [];
  if (!hasItems(task.reposJson) && repoCount !== 1) problems.push("repo");
  if (!hasItems(task.filesScopeJson)) problems.push("scope");
  if (!hasItems(task.acceptanceCriteriaJson)) problems.push("criteria");
  return problems;
}
