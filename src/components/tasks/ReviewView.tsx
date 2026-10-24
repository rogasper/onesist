import { useEffect, useState } from "react";
import { useTaskRuns } from "~/lib/use-task-runs";
import { subscribeReviewPane, takePendingReviewRun } from "~/lib/review-pane";
import { TaskReviewPanel } from "./TaskReviewDialog";
import type { RunSummary } from "~/shared/types";

const WAITING: RunSummary["state"][] = ["validating", "in_review", "failed"];
const LABEL: Record<string, string> = { validating: "Menunggu validasi", in_review: "Lolos cek", failed: "Gagal" };

/**
 * The review pane: the project's runs that are waiting for a decision, and the review of the one
 * picked. The same panel as the board's dialog.
 */
export function ReviewView({ projectId }: { projectId: string }) {
  const { runs, reload } = useTaskRuns(projectId);
  const waiting = Object.values(runs).filter((r) => WAITING.includes(r.state));
  const [picked, setPicked] = useState<string | null>(null);
  // A card's "Buka penuh" picks the run here, whether the pane was already open or opens now.
  useEffect(() => {
    const requested = takePendingReviewRun();
    if (requested) setPicked(requested);
    return subscribeReviewPane((runId) => setPicked(runId));
  }, []);
  const selected = waiting.find((r) => r.id === picked) ?? waiting[0] ?? null;

  const [maximized, setMaximized] = useState(false);

  if (waiting.length === 0) {
    return <div className="flex flex-1 items-center justify-center p-6 text-sm text-kumo-subtle">Tidak ada run yang menunggu tinjauan.</div>;
  }
  return (
    <div className={maximized ? "fixed inset-0 z-50 flex bg-kumo-base" : "relative flex min-h-0 flex-1"}>
      <button
        type="button"
        onClick={() => setMaximized((m) => !m)}
        className="absolute right-3 top-3 z-10 rounded-full bg-kumo-elevated px-2 py-0.5 text-[11px] text-kumo-default"
      >
        {maximized ? "⤡ Kecil" : "⛶ Layar penuh"}
      </button>
      <div className="w-56 shrink-0 space-y-1 overflow-y-auto border-r border-kumo-line/50 p-2">
        {waiting.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setPicked(r.id)}
            className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs ${selected?.id === r.id ? "bg-kumo-elevated text-kumo-default" : "text-kumo-subtle hover:bg-kumo-elevated/60"}`}
          >
            <span className="block truncate">Revisi {r.revision}</span>
            <span className="text-[10px]">{LABEL[r.state] ?? r.state}</span>
          </button>
        ))}
      </div>
      <div className="min-w-0 flex-1 overflow-y-auto">
        <TaskReviewPanel projectId={projectId} run={selected} onClose={() => setPicked(null)} onChanged={reload} />
      </div>
    </div>
  );
}
