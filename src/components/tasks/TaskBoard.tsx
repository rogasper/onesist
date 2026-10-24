import { useMemo, useState, type DragEvent } from "react";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { dependencyState, groupByStatus, orderTasks, taskKey } from "~/lib/task-board";
import { STATUS_LABELS, TASK_STATUSES, normalizeStatus, type TaskStatus } from "~/lib/task-status";
import { PROBLEM_LABELS, readinessProblems, type ReadinessProblem } from "~/lib/task-readiness";
import type { RunSummary, Task } from "~/shared/types";
import { TaskBoardCard } from "./TaskBoardCard";
import { TaskFillDialog } from "./TaskFillDialog";

const COLUMN_DOT: Record<TaskStatus, string> = {
  todo: "bg-blue-400",
  in_progress: "bg-amber-400",
  in_review: "bg-sky-400",
  done: "bg-green-400",
};

interface TaskBoardProps {
  /** The tasks to show, after the filters. */
  tasks: Task[];
  /** Every task of the project, so dependencies are judged on the whole plan, not the filtered view. */
  allTasks: Task[];
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onOpenTask: (task: Task) => void;
  /** Off in delivery mode: no readiness chips, no blocked drags, no fill. */
  executionEnabled: boolean;
  repoCount: number;
  projectId: string;
  onFilled: (task: Task) => void;
  /** Runs by task id. A card in In Progress shows its run's state. */
  runs: Record<string, RunSummary>;
  /** Starts the task's run; the board does not change the status itself in execution mode. */
  onStartRun: (task: Task) => void;
  onOpenChat: (threadId: string) => void;
  /** The last start error, shown above the board until the next start. */
  runError: string | null;
  onValidate: (run: RunSummary) => void;
  onReview: (run: RunSummary) => void;
  onReadReview: (run: RunSummary) => void;
}

export function TaskBoard({
  tasks,
  allTasks,
  onStatusChange,
  onOpenTask,
  executionEnabled,
  repoCount,
  projectId,
  onFilled,
  runs,
  onStartRun,
  onOpenChat,
  runError,
  onValidate,
  onReview,
  onReadReview,
}: TaskBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ task: Task; status: TaskStatus; waitingOn: string[] } | null>(null);
  const [fill, setFill] = useState<{ task: Task; problems: ReadinessProblem[] } | null>(null);
  const byKey = useMemo(() => new Map(allTasks.map((t) => [taskKey(t), t])), [allTasks]);
  const groups = useMemo(() => groupByStatus(orderTasks(tasks)), [tasks]);

  const drop = (status: TaskStatus, e: DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    const task = allTasks.find((t) => t.id === id);
    if (!task || normalizeStatus(task.status) === status) return;
    if (status === "in_progress") {
      const dependency = dependencyState(task, byKey);
      if (dependency.locked) {
        setPending({ task, status, waitingOn: dependency.waitingOn });
        return;
      }
      const problems = executionEnabled ? readinessProblems(task, repoCount) : [];
      if (problems.length > 0) {
        setFill({ task, problems });
        return;
      }
      if (executionEnabled) {
        onStartRun(task);
        return;
      }
    }
    onStatusChange(task.id, status);
  };

  return (
    <>
      {runError && <p className="px-3 pt-3 text-xs text-red-400">{runError}</p>}
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {TASK_STATUSES.map((status) => {
          const list = groups[status];
          return (
            <section
              key={status}
              aria-label={STATUS_LABELS[status]}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
              onDrop={(e) => drop(status, e)}
              className="flex min-w-[240px] flex-1 flex-col rounded-2xl bg-kumo-elevated/40 p-2.5"
            >
              <header className="mb-2 flex items-center justify-between px-1 text-xs font-medium text-kumo-default">
                <span className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${COLUMN_DOT[status]}`} />
                  {STATUS_LABELS[status]}
                </span>
                <span className="text-kumo-subtle">{list.length}</span>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto">
                {list.map((task) => (
                  <TaskBoardCard
                    key={task.id}
                    task={task}
                    dependency={dependencyState(task, byKey)}
                    problems={executionEnabled ? readinessProblems(task, repoCount) : []}
                    run={runs[task.id]}
                    onOpen={onOpenTask}
                    onDragStart={(t) => setDraggingId(t.id)}
                    onOpenChat={onOpenChat}
                    onValidate={onValidate}
                    onReview={onReview}
                    onReadReview={onReadReview}
                  />
                ))}
                {list.length === 0 && <p className="px-1 py-6 text-center text-[11px] text-kumo-subtle">Kosong</p>}
              </div>
            </section>
          );
        })}
      </div>
      <ConfirmDialog
        open={pending !== null}
        title="Dependensi belum selesai"
        onOpenChange={(open) => { if (!open) setPending(null); }}
        onConfirm={() => {
          if (pending) {
            if (executionEnabled && pending.status === "in_progress") onStartRun(pending.task);
            else onStatusChange(pending.task.id, pending.status);
          }
          setPending(null);
        }}
        confirmLabel="Pindahkan tetap"
        cancelLabel="Batal"
      >
        {pending
          ? `${taskKey(pending.task)} masih menunggu ${pending.waitingOn.join(", ")}. Tetap pindahkan ke In Progress?`
          : ""}
      </ConfirmDialog>
      <TaskFillDialog
        projectId={projectId}
        task={fill?.task ?? null}
        reason={fill ? `Belum ada ${fill.problems.map((p) => PROBLEM_LABELS[p]).join(", ")}. Geseran dibatalkan.` : undefined}
        onClose={() => setFill(null)}
        onSaved={onFilled}
      />
    </>
  );
}
