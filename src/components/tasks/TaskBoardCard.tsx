import { Lock } from "@phosphor-icons/react";
import { PROBLEM_LABELS, type ReadinessProblem } from "~/lib/task-readiness";
import { taskKey, type DependencyState } from "~/lib/task-board";
import type { Task } from "~/shared/types";

interface TaskBoardCardProps {
  task: Task;
  dependency: DependencyState;
  /** Missing readiness data. Empty when execution is off (delivery mode) or the task is ready. */
  problems: ReadinessProblem[];
  onOpen: (task: Task) => void;
  onDragStart: (task: Task) => void;
}

/** Length of a stored JSON array (file scope, acceptance criteria); anything else counts as none. */
function countItems(json: string | null): number {
  if (!json) return 0;
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0;
  }
}

export function TaskBoardCard({ task, dependency, problems, onOpen, onDragStart }: TaskBoardCardProps) {
  const key = taskKey(task);
  const title = task.code ? task.title.replace(`${task.code}:`, "").trim() : task.title;
  const criteria = countItems(task.acceptanceCriteriaJson);
  const manual = countItems(task.filesScopeJson) === 0 && criteria === 0;

  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen(task); }}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart(task);
      }}
      className={`cursor-grab rounded-xl border border-kumo-line/50 bg-kumo-base p-2.5 hover:border-kumo-brand/40 active:cursor-grabbing ${dependency.locked ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-1 text-[10px]">
        <span className="font-mono text-kumo-subtle">{key}</span>
        {task.critical && <span className="rounded bg-red-500/10 px-1 text-red-400">critical</span>}
        {task.risk && <span className="rounded bg-kumo-elevated px-1 text-kumo-subtle">{task.risk}</span>}
        {manual && <span className="rounded bg-kumo-elevated px-1 text-kumo-subtle">manual</span>}
      </div>
      <p className="mt-1 line-clamp-2 text-[12px] font-medium text-kumo-default">{title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-kumo-subtle">
        {dependency.locked && (
          <span className="inline-flex items-center gap-1 rounded bg-kumo-elevated px-1">
            <Lock size={10} />
            menunggu {dependency.waitingOn.join(", ")}
          </span>
        )}
        {problems.length > 0 && (
          <span className="rounded bg-amber-500/10 px-1 text-amber-400">
            Data kurang: {problems.map((p) => PROBLEM_LABELS[p]).join(", ")}
          </span>
        )}
        {dependency.missing.length > 0 && (
          <span className="rounded bg-amber-500/10 px-1 text-amber-400">
            dependensi tidak ditemukan: {dependency.missing.join(", ")}
          </span>
        )}
        <span className="ml-auto">
          {task.storyPoints != null ? `${task.storyPoints} SP` : ""}
          {criteria > 0 ? ` · AC ${criteria}` : ""}
        </span>
      </div>
      {task.assignee && <p className="mt-1 truncate text-[10px] text-kumo-subtle">{task.assignee}</p>}
    </div>
  );
}
