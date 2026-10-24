import { useEffect, useMemo, useState } from "react";
import { Button, Dialog, DialogDescription, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { annotateDiff } from "~/lib/diff-lines";
import { openChatTask } from "~/lib/chat-task";
import type { RunSummary } from "~/shared/types";

interface DiffFile {
  path: string;
  status: string;
  patch: string;
  truncated: boolean;
}
interface RepoDiff {
  repo: string;
  files: DiffFile[];
}
interface Comment {
  file: string;
  line: number | null;
  text: string;
}

/** The file's path from the project root, the form comments and findings use. */
const fullPath = (repo: string, path: string) => (repo === "." ? path : `${repo}/${path}`);

/**
 * Reviews a run that is in review: its diff per file, the AI findings the user can send back,
 * and comments on single lines. Revising sends them to the run's thread; nothing is applied here.
 */
export function TaskReviewDialog({
  projectId,
  run,
  onClose,
  onChanged,
}: {
  projectId: string;
  run: RunSummary | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [repos, setRepos] = useState<RepoDiff[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [target, setTarget] = useState<{ file: string; line: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [chosen, setChosen] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!run) return;
    setComments([]);
    setTarget(null);
    setChosen(new Set());
    setError(null);
    fetch(`/api/projects/${projectId}/task-runs/${run.id}/diff`, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as { repos: RepoDiff[] }) : { repos: [] }))
      .then((data) => {
        setRepos(data.repos);
        const first = data.repos.find((r) => r.files.length > 0);
        setSelected(first ? `${first.repo}:${first.files[0].path}` : null);
      })
      .catch(() => setError("Diff belum bisa dibaca."));
  }, [projectId, run?.id]);

  const files = useMemo(
    () => repos.flatMap((r) => r.files.map((f) => ({ key: `${r.repo}:${f.path}`, full: fullPath(r.repo, f.path), ...f }))),
    [repos],
  );
  const current = files.find((f) => f.key === selected) ?? null;
  const lines = useMemo(() => (current ? annotateDiff(current.patch) : []), [current]);
  const findings = run?.review?.findings as { file: string; line: number | null; severity: string; message: string }[] | undefined;

  if (!run) return null;

  const addComment = () => {
    if (!target || !draft.trim()) return;
    setComments((prev) => [...prev, { file: target.file, line: target.line, text: draft.trim() }]);
    setDraft("");
    setTarget(null);
  };

  const sendRevision = async () => {
    setBusy(true);
    setError(null);
    const picked = (findings ?? []).filter((_, i) => chosen.has(i)).map((f) => ({ file: f.file, line: f.line, message: f.message }));
    const res = await fetch(`/api/projects/${projectId}/task-runs/${run.id}/revise`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comments, findings: picked }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as { threadId?: string | null; text?: string; error?: string };
    setBusy(false);
    if (!res.ok || !body.threadId) {
      setError(body.error ?? "Revisi gagal dikirim.");
      return;
    }
    openChatTask({ threadId: body.threadId, text: body.text ?? null });
    onChanged();
    onClose();
  };

  const discard = async () => {
    setConfirmDiscard(false);
    const res = await fetch(`/api/projects/${projectId}/task-runs/${run.id}/discard`, { method: "POST", cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Run gagal dibuang.");
      return;
    }
    onChanged();
    onClose();
  };

  const revisionCount = comments.length + chosen.size;

  return (
    <>
      <DialogRoot open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
        <Dialog>
          <div className="flex max-h-[85vh] w-[min(1100px,92vw)] flex-col gap-3 p-5">
            <DialogTitle>Tinjau · revisi {run.revision}</DialogTitle>
            <DialogDescription>Komentar dan temuan yang dipilih dikirim ke thread agen sebagai revisi berikutnya.</DialogDescription>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex min-h-0 flex-1 gap-3">
              <div className="w-64 shrink-0 overflow-y-auto rounded-lg border border-kumo-line/50 p-2">
                {files.length === 0 && <p className="text-xs text-kumo-subtle">Tidak ada perubahan.</p>}
                {files.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => { setSelected(f.key); setTarget(null); }}
                    className={`block w-full truncate rounded px-2 py-1 text-left text-[11px] ${selected === f.key ? "bg-kumo-elevated text-kumo-default" : "text-kumo-subtle hover:bg-kumo-elevated/60"}`}
                    title={f.full}
                  >
                    {f.status === "untracked" ? "+ " : ""}{f.full}
                    {comments.some((c) => c.file === f.full) && <span className="ml-1 text-amber-400">●</span>}
                  </button>
                ))}
              </div>

              <div className="min-w-0 flex-1 overflow-auto rounded-lg border border-kumo-line/50 bg-kumo-base font-mono text-[11px]">
                {current?.truncated && <p className="p-2 text-amber-400">Patch dipotong karena terlalu panjang.</p>}
                {lines.map((l, i) => {
                  const clickable = l.newLine !== null && current;
                  const cls = l.kind === "add" ? "bg-green-500/10" : l.kind === "del" ? "bg-red-500/10" : l.kind === "hunk" ? "text-kumo-brand" : l.kind === "meta" ? "text-kumo-subtle" : "";
                  return (
                    <div key={i}>
                      <div className={`flex ${cls}`}>
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={() => current && l.newLine !== null && setTarget({ file: current.full, line: l.newLine })}
                          className="w-12 shrink-0 select-none px-2 text-right text-kumo-subtle disabled:opacity-40"
                        >
                          {l.newLine ?? ""}
                        </button>
                        <span className="whitespace-pre pr-3">{l.text}</span>
                      </div>
                      {target && current && l.newLine === target.line && target.file === current.full && (
                        <div className="flex gap-2 bg-kumo-elevated/60 p-2">
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={2}
                            placeholder={`Komentar untuk ${target.file}:${target.line}`}
                            className="flex-1 rounded border border-kumo-line/50 bg-kumo-base p-1 text-xs"
                          />
                          <Button variant="primary" size="sm" onClick={addComment} disabled={!draft.trim()}>Simpan</Button>
                          <Button variant="ghost" size="sm" onClick={() => setTarget(null)}>Batal</Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="max-h-32 overflow-y-auto rounded-lg border border-kumo-line/50 p-2 text-xs">
                <p className="mb-1 font-medium text-kumo-subtle">Komentar ({comments.length})</p>
                {comments.length === 0 && <p className="text-kumo-subtle">Klik nomor baris di diff untuk menulis komentar.</p>}
                {comments.map((c, i) => (
                  <p key={i} className="truncate text-kumo-default" title={c.text}>
                    <span className="text-kumo-subtle">{c.file}:{c.line}</span> {c.text}
                  </p>
                ))}
              </div>
              <div className="max-h-32 overflow-y-auto rounded-lg border border-kumo-line/50 p-2 text-xs">
                <p className="mb-1 font-medium text-kumo-subtle">Temuan AI</p>
                {!run.review?.threadId && <p className="text-kumo-subtle">Belum ada tinjauan AI.</p>}
                {run.review?.threadId && !run.review.read && <p className="text-kumo-subtle">Baca temuan AI dari kartu dulu.</p>}
                {(findings ?? []).map((f, i) => (
                  <label key={i} className="flex items-start gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={chosen.has(i)}
                      onChange={(e) => setChosen((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(i);
                        else next.delete(i);
                        return next;
                      })}
                    />
                    <span className="text-kumo-default"><span className="text-kumo-subtle">{f.file}{f.line ? `:${f.line}` : ""} [{f.severity}]</span> {f.message}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfirmDiscard(true)} disabled={busy}>Buang run</Button>
              <Button variant="ghost" size="sm" disabled title="Belum tersedia di tahap ini">Edit sendiri</Button>
              <Button variant="ghost" size="sm" disabled title="Tersedia setelah tahap PR">Setujui</Button>
              <Button variant="primary" size="sm" onClick={sendRevision} disabled={busy || revisionCount === 0}>
                Minta revisi{revisionCount > 0 ? ` (${revisionCount})` : ""}
              </Button>
            </div>
          </div>
        </Dialog>
      </DialogRoot>
      <ConfirmDialog
        open={confirmDiscard}
        title="Buang run ini?"
        onOpenChange={(open) => { if (!open) setConfirmDiscard(false); }}
        onConfirm={discard}
        confirmLabel="Buang"
        cancelLabel="Batal"
      >
        Task kembali ke To Do. Worktree dan branch tetap ada di disk.
      </ConfirmDialog>
    </>
  );
}
