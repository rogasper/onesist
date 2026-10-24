import { expect, test } from "bun:test";
import type { Task } from "~/shared/types";
import { PROBLEM_LABELS, readinessProblems } from "./task-readiness";

function task(over: Partial<Task> = {}): Task {
  return {
    id: "t", projectId: "p", code: "AP-1", title: "AP-1: x", description: null, status: "todo",
    storyPoints: null, assignee: null, module: null, dependenciesJson: null, sourcePath: null,
    phase: null, archived: false, blocksJson: null, critical: false, risk: null,
    filesScopeJson: '["input/code/api/src/a.ts"]', specRef: null, erdRef: null, rtmRef: null,
    acceptanceCriteriaJson: '["Login memakai OTP"]', execProviderId: null, execModel: null,
    reposJson: '["input/code/api"]', createdAt: "", updatedAt: "", ...over,
  };
}

test("a complete task has no problems", () => {
  expect(readinessProblems(task(), 3)).toEqual([]);
});

test("a missing repo is a problem only when the project has more than one repo", () => {
  expect(readinessProblems(task({ reposJson: null }), 2)).toEqual(["repo"]);
  expect(readinessProblems(task({ reposJson: null }), 1)).toEqual([]);
});

test("empty or broken scope and criteria are problems", () => {
  expect(readinessProblems(task({ filesScopeJson: null, acceptanceCriteriaJson: "[]" }), 1)).toEqual(["scope", "criteria"]);
  expect(readinessProblems(task({ filesScopeJson: "{", acceptanceCriteriaJson: "not json" }), 1)).toEqual(["scope", "criteria"]);
});

test("every problem has a readable label", () => {
  expect(PROBLEM_LABELS.scope).toBe("file scope");
  expect(PROBLEM_LABELS.criteria).toBe("acceptance criteria");
});
