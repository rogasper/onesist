import { relTime } from "~/lib/rel-time";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Index status and reindex control (FR-I7) for the project Settings tab.
 *
 * The panel polls only while a build is running and stops as soon as it is idle:
 * a permanent poller for something that changes once per edit is exactly the kind
 * of timer this app avoids in favour of events. The progress it shows is the
 * honest count of files already processed, not an estimate.
 */
interface IndexStatus {
  status: "idle" | "running" | "error";
  done: number;
  total: number;
  lastError: string | null;
  lastRun: { mode: "full" | "incremental"; changed: number; removed: number } | null;
  stats: { files: number; chunks: number; symbols: number; bytes: number; lastIndexedAt: string | null };
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Missing timestamp means "never" here, not "just now" (shared `relTime`). */
function whenLabel(iso: string | null): string {
  return relTime(iso, "belum pernah");
}

export function IndexPanel({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<IndexStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/index?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as IndexStatus);
    } catch {
      /* status is informational; a failed poll must not throw into the page */
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (status?.status !== "running") {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }
    timer.current = setInterval(() => void load(), 700);
    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [status?.status, load]);

  async function reindex() {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/chat/index?projectId=${encodeURIComponent(projectId)}`, { method: "POST", cache: "no-store" });
      const body = await res.json();
      if (!res.ok) {
        setNote(body?.error ?? `HTTP ${res.status}`);
        return;
      }
      setNote(`Selesai: ${body.files} berkas dalam ${body.durationMs} ms.`);
      await load();
    } catch (err: any) {
      setNote(err?.message ?? "Reindex gagal.");
    } finally {
      setBusy(false);
    }
  }

  const stats = status?.stats;

  return (
    <div className="grid gap-2">
      <p className="text-sm text-kumo-subtle">
        Index dipakai tool <span className="font-mono text-kumo-default">code_search</span> untuk mencari simbol, isi berkas, dan nama berkas tanpa
        membaca semuanya. Dibangun otomatis saat pencarian pertama, lalu diperbarui per berkas setiap kali ada perubahan.
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl ring ring-kumo-line px-3 py-2 text-sm">
        <span className="text-kumo-default">
          <strong>{stats?.files ?? 0}</strong> berkas
        </span>
        <span className="text-kumo-subtle">
          <strong className="text-kumo-default">{stats?.chunks ?? 0}</strong> bagian
        </span>
        <span className="text-kumo-subtle">
          <strong className="text-kumo-default">{stats?.symbols ?? 0}</strong> simbol
        </span>
        <span className="text-kumo-subtle">{humanBytes(stats?.bytes ?? 0)}</span>
        <span className="text-kumo-subtle">index terakhir: {whenLabel(stats?.lastIndexedAt ?? null)}</span>
        <button
          onClick={reindex}
          disabled={busy || status?.status === "running"}
          className="ml-auto rounded-lg px-2.5 py-1 text-sm ring ring-kumo-line hover:bg-kumo-elevated text-kumo-brand disabled:opacity-40"
        >
          {status?.status === "running" ? `Mengindeks ${status.done}/${status.total}…` : "Reindex sekarang"}
        </button>
      </div>

      {status?.lastRun ? (
        <p className="text-xs text-kumo-subtle">
          Pass terakhir: {status.lastRun.mode === "full" ? "penuh" : "inkremental"}
          {status.lastRun.mode === "incremental"
            ? ` · ${status.lastRun.changed} diperbarui, ${status.lastRun.removed} dihapus`
            : ` · ${status.lastRun.changed} berkas`}
        </p>
      ) : null}
      {status?.lastError ? <p className="text-sm text-red-400">Error terakhir: {status.lastError}</p> : null}
      {note ? <p className="text-sm text-kumo-subtle">{note}</p> : null}
    </div>
  );
}
