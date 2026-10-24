import { useEffect, useState } from "react";
import { STATUS_LABELS, normalizeStatus } from "~/lib/task-status";
import type { RunSummary, Task } from "~/shared/types";

type Tab = "summary" | "live";

interface LiveState {
  state: RunSummary["state"];
  revision: number;
  error: string | null;
  lastText: string | null;
}

interface DrawerProps {
  projectId: string;
  task: Task;
  run: RunSummary | undefined;
  onClose: () => void;
  onOpenDetail: (task: Task) => void;
  onOpenChat: (threadId: string) => void;
  onValidate: (run: RunSummary) => void;
  onReview: (run: RunSummary) => void;
  onOpenReview: (run: RunSummary) => void;
  onRetry: (run: RunSummary) => void;
}

/**
 * The drawer a card opens: what the run is doing and where it stands. Answers to the agent's
 * questions and edits still go through the chat and the detail view, which is where they live.
 */
export function TaskRunDrawer(props: DrawerProps) {
  const { projectId, task, run, onClose, onOpenDetail, onOpenChat, onValidate, onReview, onOpenReview, onRetry } = props;
  const [tab, setTab] = useState<Tab>("summary");
  const [live, setLive] = useState<LiveState | null>(null);

  // The Live tab reads the agent's latest words when it opens, and again when the run changes state.
  useEffect(() => {
    if (tab !== "live" || !run) return;
    fetch(`/api/projects/${projectId}/task-runs/${run.id}/live`, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as LiveState) : null))
      .then(setLive)
      .catch(() => setLive(null));
  }, [tab, projectId, run?.id, run?.state, run?.revision]);

  const pr = run?.repos.find((r) => r.prUrl);
  const validation = run?.validation ?? null;
  const canValidate = run && (run.state === "validating" || run.state === "in_review" || (run.state === "failed" && (run.error ?? "").startsWith("Cek gagal")));

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-[min(440px,100vw)] flex-col border-l border-kumo-line/50 bg-kumo-base shadow-xl">
      <div className="flex items-start justify-between gap-2 border-b border-kumo-line/50 p-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] text-kumo-subtle">{task.code}</p>
          <p className="truncate text-sm font-medium text-kumo-default">{task.title.replace(`${task.code ?? ""}:`, "").trim()}</p>
          <p className="text-[11px] text-kumo-subtle">Kolom: {STATUS_LABELS[normalizeStatus(task.status)]}{run ? ` · revisi ${run.revision}` : ""}</p>
        </div>
        <button type="button" onClick={onClose} className="text-kumo-subtle hover:text-kumo-default" aria-label="Tutup">✕</button>
      </div>

      <div className="flex gap-1 border-b border-kumo-line/50 px-4 py-2 text-xs">
        {(["summary", "live"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 ${tab === t ? "bg-kumo-elevated font-medium text-kumo-default" : "text-kumo-subtle"}`}
          >
            {t === "summary" ? "Ringkasan" : "Live"}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 text-xs text-kumo-default">
        {!run && <p className="text-kumo-subtle">Belum ada run untuk task ini.</p>}

        {run && tab === "summary" && (
          <>
            <p>Status run: <span className="font-medium">{run.state}</span>{run.error ? ` · ${run.error}` : ""}</p>
            {run.repos.map((r) => (
              <p key={r.repo} className="text-kumo-subtle">
                {r.repo}{r.branch ? ` · ${r.branch}` : ""}
              </p>
            ))}
            {pr && pr.prUrl && (
              <p>PR: <a href={pr.prUrl} target="_blank" rel="noreferrer" className="text-violet-400 underline">{pr.prUrl}</a>{pr.prState ? ` (${pr.prState.toLowerCase()})` : ""}</p>
            )}
            {validation && (
              <div className="space-y-1 rounded-lg border border-kumo-line/50 p-2">
                <p className="font-medium">Cek {validation.passed ? "lolos" : "gagal"}</p>
                {validation.checks.map((c, i) => (
                  <p key={i} className={c.ok ? "text-green-400" : "text-red-400"}>{c.ok ? "✓" : "✗"} {c.name} ({c.repo})</p>
                ))}
                {validation.outsideScope.length > 0 && (
                  <p className="text-amber-400">Di luar scope: {validation.outsideScope.join(", ")}</p>
                )}
                {validation.acceptance.map((a, i) => (
                  <p key={i} className="text-kumo-subtle">{a.status === "met" ? "✓" : "○"} {a.criterion}</p>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              {run.threadId && <button type="button" onClick={() => onOpenChat(run.threadId!)} className="rounded-full bg-kumo-elevated px-3 py-1">Buka chat</button>}
              {canValidate && <button type="button" onClick={() => onValidate(run)} className="rounded-full bg-kumo-elevated px-3 py-1">Validasi</button>}
              {run.state === "in_review" && <button type="button" onClick={() => onOpenReview(run)} className="rounded-full bg-kumo-elevated px-3 py-1">Tinjau diff</button>}
              {run.state === "in_review" && <button type="button" onClick={() => onReview(run)} className="rounded-full bg-kumo-elevated px-3 py-1">Tinjau AI</button>}
              {run.state === "failed" && run.threadId && <button type="button" onClick={() => onRetry(run)} className="rounded-full bg-kumo-elevated px-3 py-1">Ulangi</button>}
              <button type="button" onClick={() => onOpenDetail(task)} className="rounded-full bg-kumo-elevated px-3 py-1">Detail task</button>
            </div>
          </>
        )}

        {run && tab === "live" && (
          <>
            {!live && <p className="text-kumo-subtle">Memuat…</p>}
            {live && (
              <>
                <p>Status: <span className="font-medium">{live.state}</span></p>
                {live.state === "waiting_input" && run.threadId && (
                  <button type="button" onClick={() => onOpenChat(run.threadId!)} className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-400">Jawab di chat</button>
                )}
                {live.error && <p className="text-red-400">{live.error}</p>}
                <p className="text-[11px] text-kumo-subtle">Kata-kata terakhir agen</p>
                <pre className="whitespace-pre-wrap rounded-lg border border-kumo-line/50 bg-kumo-elevated/40 p-2 font-sans text-[11px]">
                  {live.lastText ?? "Belum ada jawaban dari agen."}
                </pre>
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
