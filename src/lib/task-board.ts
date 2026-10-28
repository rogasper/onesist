import type { Task } from "~/shared/types";
import { TASK_STATUSES, normalizeStatus, type TaskStatus } from "./task-status";

export interface DependencyState {
  /** True while at least one dependency exists and is not finished. */
  locked: boolean;
  /** Dependency codes that exist and are not finished yet. */
  waitingOn: string[];
  /** Dependency codes that do not exist, or that point at the task itself. They never lock. */
  missing: string[];
}

const naturalCompare = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

/** Reads the stored dependency list. Anything that is not an array of non-empty strings reads as none. */
export function parseDependencies(json: string | null): string[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string" && v.trim() !== "");
  } catch {
    return [];
  }
}

/** The same key the importer uses: the code, or the title's prefix for tasks without one. */
export function taskKey(task: Task): string {
  return task.code ?? task.title.split(":")[0].trim();
}

export function dependencyState(task: Task, byKey: Map<string, Task>): DependencyState {
  const self = taskKey(task);
  const state: DependencyState = { locked: false, waitingOn: [], missing: [] };
  for (const dep of parseDependencies(task.dependenciesJson)) {
    const found = dep === self ? undefined : byKey.get(dep);
    if (!found) {
      state.missing.push(dep);
    } else if (!found.archived && normalizeStatus(found.status) !== "done") {
      state.waitingOn.push(dep);
    }
  }
  state.locked = state.waitingOn.length > 0;
  return state;
}

/**
 * Timeline order: phase first (tasks without a phase last), then dependencies within the
 * phase, then code. A dependency cycle is broken at its smallest code so every task is kept.
 */
export function orderTasks(tasks: Task[]): Task[] {
  const byPhase = new Map<string, Task[]>();
  for (const t of tasks) {
    const phase = t.phase ?? "";
    byPhase.set(phase, [...(byPhase.get(phase) ?? []), t]);
  }
  const phases = [...byPhase.keys()].sort((a, b) => {
    if (a === "" || b === "") return a === b ? 0 : a === "" ? 1 : -1;
    return naturalCompare(a, b);
  });
  return phases.flatMap((phase) => orderPhase(byPhase.get(phase)!));
}

function orderPhase(tasks: Task[]): Task[] {
  const keys = new Map(tasks.map((t) => [taskKey(t), t]));
  const remaining = new Map<string, Set<string>>();
  for (const t of tasks) {
    const key = taskKey(t);
    const inPhase = parseDependencies(t.dependenciesJson).filter((d) => d !== key && keys.has(d));
    remaining.set(key, new Set(inPhase));
  }

  const out: Task[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()].filter(([, deps]) => deps.size === 0).map(([key]) => key);
    const pool = ready.length > 0 ? ready : [...remaining.keys()];
    const next = pool.sort(naturalCompare)[0];
    out.push(keys.get(next)!);
    remaining.delete(next);
    for (const deps of remaining.values()) deps.delete(next);
  }
  return out;
}

export function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]> {
  const groups = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as Task[]])) as Record<TaskStatus, Task[]>;
  for (const t of tasks) groups[normalizeStatus(t.status)].push(t);
  return groups;
}
