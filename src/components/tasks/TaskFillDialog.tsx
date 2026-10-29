import { useEffect, useRef, useState } from "react";
import { Button, Dialog, DialogDescription, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { openChatTask } from "~/lib/chat-task";
import { subscribe } from "~/lib/event-stream";
import type { Task } from "~/shared/types";

interface FillProposal {
  repos: string[];
  filesScope: string[];
  acceptanceCriteria: string[];
}

interface FillPreview {
  proposal: FillProposal;
  dropped: string[];
  current: FillProposal;
}

type Phase = "idle" | "starting" | "waiting" | "preview" | "saving" | "error";

const FIELDS: { key: keyof FillProposal; label: string }[] = [
  { key: "repos", label: "Repo" },
  { key: "filesScope", label: "File scope" },
  { key: "acceptanceCriteria", label: "Acceptance criteria" },
];

function ListBlock({ items }: { items: string[] }) {
  if (items.length === 0) return <p className="text-xs text-kumo-subtle">kosong</p>;
  return (
    <ul className="max-h-32 space-y-0.5 overflow-y-auto text-xs text-kumo-default">
      {items.map((item) => (
        <li key={item} className="break-all">{item}</li>
      ))}
    </ul>
  );
}

/**
 * "Lengkapi dengan AI" for one task. The agent answers in a read-only chat; the proposal is
 * shown next to what the task has now, and only the Simpan button writes it.
 */
export function TaskFillDialog({
  projectId,
  task,
  reason,
  onClose,
  onSaved,
}: {
  projectId: string;
  task: Task | null;
  reason?: string;
  onClose: () => void;
  onSaved: (task: Task) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [threadId, setThreadId] = useState<string | null>(null);
  const [preview, setPreview] = useState<FillPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startingRef = useRef(false);

  // A different task starts from a clean dialog.
  useEffect(() => {
    setPhase("idle");
    setThreadId(null);
    setPreview(null);
    setError(null);
  }, [task?.id]);

  useEffect(() => {
    if (!threadId || !task) return;
    return subscribe("chat:run", (data) => {
      const event = data as { threadId?: string; status?: string } | null;
      if (event?.threadId !== threadId) return;
      if (event.status !== "done") {
        setPhase("error");
        setError("Lengkapi tidak selesai. Buka chat untuk melihat jawaban agen.");
        return;
      }
      void loadPreview(threadId, task.id);
    });
  }, [threadId, task?.id]);

  async function loadPreview(id: string, taskId: string) {
    const res = await fetch(`/api/projects/${projectId}/tasks/${taskId}/fill/preview?threadId=${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    const body = (await res.json().catch(() => ({}))) as FillPreview & { error?: string };
    if (!res.ok) {
      setPhase("error");
      setError(body.error ?? "Usulan gagal dibaca.");
      return;
    }
    setPreview(body);
    setPhase("preview");
  }

  const start = async () => {
    if (!task || startingRef.current) return;
    startingRef.current = true;
    setPhase("starting");
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/tasks/${task.id}/fill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as { threadId?: string; text?: string; error?: string };
      if (!res.ok || !body.threadId) throw new Error(body.error ?? `HTTP ${res.status}`);
      setThreadId(body.threadId);
      setPhase("waiting");
      openChatTask({ threadId: body.threadId, text: body.text ?? null });
    } catch (err) {
      setPhase("error");
      setError(err instanceof Error ? err.message : "Gagal memulai Lengkapi.");
    } finally {
      startingRef.current = false;
    }
  };

  const save = async () => {
    if (!task || !preview) return;
    setPhase("saving");
    setError(null);
    const res = await fetch(`/api/projects/${projectId}/tasks/${task.id}/fill/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposal: preview.proposal }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as (Task & { error?: string }) | null;
    if (!res.ok || !body) {
      setPhase("preview");
      setError(body?.error ?? "Gagal menyimpan usulan.");
      return;
    }
    onSaved(body);
    onClose();
  };

  const busy = phase === "starting" || phase === "saving";

  return (
    <DialogRoot open={!!task} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <Dialog>
        <div className="p-5 space-y-3">
          <DialogTitle>Lengkapi dengan AI{task ? ` · ${task.code ?? task.title}` : ""}</DialogTitle>
          {reason && <DialogDescription>{reason}</DialogDescription>}

          {phase === "idle" && (
            <p className="text-xs text-kumo-subtle">
              Agen membaca dokumen task dan repo, lalu mengusulkan repo, file scope, dan acceptance criteria. Belum ada yang disimpan sebelum kamu setujui.
            </p>
          )}
          {phase === "starting" && <p className="text-xs text-kumo-subtle">Memulai…</p>}
          {phase === "waiting" && (
            <p className="text-xs text-kumo-subtle">Agen sedang membaca. Usulan muncul di sini begitu jawabannya selesai.</p>
          )}
          {phase === "saving" && <p className="text-xs text-kumo-subtle">Menyimpan…</p>}

          {phase === "preview" && preview && (
            <div className="space-y-3">
              {FIELDS.map(({ key, label }) => (
                <div key={key} className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-medium text-kumo-subtle">{label} · sekarang</p>
                    <ListBlock items={preview.current[key]} />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-kumo-brand">{label} · usulan</p>
                    <ListBlock items={preview.proposal[key]} />
                  </div>
                </div>
              ))}
              {preview.dropped.length > 0 && (
                <p className="text-xs text-amber-400">Dibuang, repo tidak dikenal: {preview.dropped.join(", ")}</p>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            {phase === "waiting" && threadId && (
              <Button variant="ghost" size="sm" onClick={() => openChatTask({ threadId })}>Buka chat</Button>
            )}
            <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>Batal</Button>
            {(phase === "idle" || phase === "error") && (
              <Button variant="primary" size="sm" onClick={start}>{phase === "error" ? "Coba lagi" : "Lengkapi dengan AI"}</Button>
            )}
            {phase === "preview" && (
              <Button variant="primary" size="sm" onClick={save}>Simpan</Button>
            )}
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
