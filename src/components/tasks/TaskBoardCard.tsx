import { Lock } from "@phosphor-icons/react";
import { PROBLEM_LABELS, type ReadinessProblem } from "~/lib/task-readiness";
import { taskKey, type DependencyState } from "~/lib/task-board";
import type { RunSummary, Task } from "~/shared/types";

interface TaskBoardCardProps {
  task: Task;
  dependency: DependencyState;
  /** Missing readiness data. Empty when execution is off (delivery mode) or the task is ready. */
  problems: ReadinessProblem[];
  run?: RunSummary;
  onOpen: (task: Task) => void;
  onDragStart: (task: Task) => void;
  onOpenChat: (threadId: string) => void;
  onValidate: (run: RunSummary) => void;
  onReview: (run: RunSummary) => void;
  onReadReview: (run: RunSummary) => void;
  onOpenReview: (run: RunSummary) => void;
}

const RUN_BADGE: Record<RunSummary["state"], { label: string; cls: string }> = {
  queued: { label: "Antri", cls: "bg-kumo-elevated text-kumo-subtle" },
  running: { label: "Berjalan", cls: "bg-sky-500/10 text-sky-400" },
  waiting_input: { label: "Butuh jawaban", cls: "bg-amber-500/15 text-amber-400" },
  validating: { label: "Menunggu validasi", cls: "bg-violet-500/10 text-violet-400" },
  in_review: { label: "Lolos cek", cls: "bg-green-500/10 text-green-400" },
  failed: { label: "Gagal", cls: "bg-red-500/10 text-red-400" },
  approved: { label: "Disetujui", cls: "bg-green-500/10 text-green-400" },
  discarded: { label: "Dibuang", cls: "bg-kumo-elevated text-kumo-subtle" },
};

/** Validation runs when the agent is done, or again after a failed check once it is fixed. */
function canValidate(run: RunSummary): boolean {
  return run.state === "validating" || run.state === "in_review" || (run.state === "failed" && (run.error ?? "").startsWith("Cek gagal"));
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

export function TaskBoardCard({ task, dependency, problems, run, onOpen, onDragStart, onOpenChat, onValidate, onReview, onReadReview, onOpenReview }: TaskBoardCardProps) {
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
        {run && (
          <button
            type="button"
            title={run.state === "failed" ? run.error ?? undefined : undefined}
            disabled={!run.threadId}
            onClick={(e) => {
              e.stopPropagation();
              if (run.threadId) onOpenChat(run.threadId);
            }}
            className={`rounded px-1 ${RUN_BADGE[run.state].cls} disabled:cursor-default`}
          >
            {RUN_BADGE[run.state].label}
          </button>
        )}
        {run && canValidate(run) && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onValidate(run); }}
            className="rounded bg-violet-500/10 px-1 text-violet-400"
          >
            Validasi
          </button>
        )}
        {run?.state === "in_review" && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenReview(run); }}
            className="rounded bg-kumo-elevated px-1 text-kumo-subtle"
          >
            Tinjau diff
          </button>
        )}
        {run?.state === "in_review" && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onReview(run); }}
            className="rounded bg-kumo-elevated px-1 text-kumo-subtle"
          >
            Tinjau AI
          </button>
        )}
        {run?.review?.threadId && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onReadReview(run); }}
            className="rounded bg-kumo-elevated px-1 text-kumo-subtle"
          >
            {run.review.read ? `Temuan AI: ${run.review.findings.length}` : "Baca temuan AI"}
          </button>
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
