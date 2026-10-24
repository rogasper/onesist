import { useMemo, useState, type DragEvent } from "react";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { dependencyState, groupByStatus, orderTasks, taskKey } from "~/lib/task-board";
import { STATUS_LABELS, TASK_STATUSES, normalizeStatus, type TaskStatus } from "~/lib/task-status";
import type { Task } from "~/shared/types";
import { TaskBoardCard } from "./TaskBoardCard";

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
}

export function TaskBoard({ tasks, allTasks, onStatusChange, onOpenTask }: TaskBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ task: Task; status: TaskStatus; waitingOn: string[] } | null>(null);
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
    }
    onStatusChange(task.id, status);
  };

  return (
    <>
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
                    onOpen={onOpenTask}
                    onDragStart={(t) => setDraggingId(t.id)}
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
          if (pending) onStatusChange(pending.task.id, pending.status);
          setPending(null);
        }}
        confirmLabel="Pindahkan tetap"
        cancelLabel="Batal"
      >
        {pending
          ? `${taskKey(pending.task)} masih menunggu ${pending.waitingOn.join(", ")}. Tetap pindahkan ke In Progress?`
          : ""}
      </ConfirmDialog>
    </>
  );
}
