import { expect, test } from "bun:test";
import type { Task } from "~/shared/types";
import { dependencyState, groupByStatus, orderTasks, parseDependencies, taskKey } from "./task-board";

function mk(code: string, opts: { status?: string; deps?: string[]; phase?: string | null; archived?: boolean } = {}): Task {
  return {
    id: code,
    projectId: "p",
    code,
    title: `${code}: judul`,
    description: null,
    status: opts.status ?? "todo",
    storyPoints: null,
    assignee: null,
    module: null,
    dependenciesJson: opts.deps ? JSON.stringify(opts.deps) : null,
    sourcePath: null,
    phase: opts.phase ?? null,
    archived: opts.archived ?? false,
    blocksJson: null,
    critical: false,
    risk: null,
    filesScopeJson: null,
    specRef: null,
    erdRef: null,
    rtmRef: null,
    acceptanceCriteriaJson: null,
    execProviderId: null,
    execModel: null,
    reposJson: null,
    createdAt: "",
    updatedAt: "",
  };
}

test("dependencies that are done or archived do not lock; the others do", () => {
  const a = mk("A", { status: "done" });
  const b = mk("B", { archived: true });
  const c = mk("C", { status: "in_review" });
  const t = mk("T", { deps: ["A", "B", "C"] });
  const by = new Map([a, b, c, t].map((x) => [taskKey(x), x]));
  expect(dependencyState(t, by)).toEqual({ locked: true, waitingOn: ["C"], missing: [] });
});

test("missing and self dependencies are reported but never lock", () => {
  const t = mk("T", { deps: ["T", "GONE"] });
  expect(dependencyState(t, new Map([["T", t]]))).toEqual({ locked: false, waitingOn: [], missing: ["T", "GONE"] });
});

test("malformed dependency json reads as none", () => {
  for (const j of ["not json", '{"a":1}', '[1, null, ""]', null]) expect(parseDependencies(j)).toEqual([]);
});

test("order is phase, then dependencies, then code", () => {
  const out = orderTasks([
    mk("P2-1", { phase: "Fase 2" }),
    mk("B", { phase: "Fase 1", deps: ["C"] }),
    mk("C", { phase: "Fase 1" }),
    mk("A10", { phase: "Fase 1" }),
    mk("A2", { phase: "Fase 1" }),
    mk("X"),
  ]);
  expect(out.map(taskKey)).toEqual(["A2", "A10", "C", "B", "P2-1", "X"]);
});

test("a dependency cycle keeps every task and terminates", () => {
  const out = orderTasks([mk("A", { deps: ["B"] }), mk("B", { deps: ["A"] }), mk("C")]);
  expect(out.map(taskKey).sort()).toEqual(["A", "B", "C"]);
});

test("grouping puts legacy statuses in todo and keeps the input order", () => {
  const g = groupByStatus([mk("A", { status: "review" }), mk("B", { status: "done" }), mk("C")]);
  expect(g.todo.map(taskKey)).toEqual(["A", "C"]);
  expect(g.done.map(taskKey)).toEqual(["B"]);
  expect(g.in_review).toEqual([]);
});
