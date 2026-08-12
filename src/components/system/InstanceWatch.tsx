import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, Trash, X, ArrowsClockwise } from "@phosphor-icons/react";

interface InstanceInfo {
  pid: number;
  ppid: number;
  role: string;
  rssMB: number | null;
  startedAt: string | null;
  command: string;
  selfTree: boolean;
}

const ROLE_LABEL: Record<string, string> = {
  "dev-server": "Dev Server (vite)",
  "dev-wrapper": "Dev Wrapper (bun run dev)",
  "terminal-server": "Terminal Server",
  "desktop-server": "Desktop Sidecar",
  other: "Proses lain",
};

export function InstanceWatch() {
  const [instances, setInstances] = useState<InstanceInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [confirmPid, setConfirmPid] = useState<number | null>(null);
  const [confirmRestartPid, setConfirmRestartPid] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/system/instances", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        setInstances(Array.isArray(d.instances) ? d.instances : []);
        setError(null);
      }
    } catch {}
  }, []);

  // Quiet background poll (every 60s) just to keep the badge fresh. The heavy
  // work (opencode/agents) is unrelated — don't spam /api/system/instances.
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60000);
    return () => clearInterval(t);
  }, [load]);

  // While the panel is open, refresh faster so kill results reflect quickly.
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, [open, load]);

  const others = instances.filter((i) => !i.selfTree);

  const doKill = useCallback(async (pid: number) => {
    setBusy(true);
    try {
      const res = await fetch("/api/system/instances/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d?.error ?? "Gagal menghentikan proses");
      }
    } catch {
      setError("Gagal menghentikan proses");
    }
    setBusy(false);
    setConfirmPid(null);
    void load();
    setTimeout(() => setError(null), 4000);
  }, [load]);

  // Killing the terminal-server makes the vite plugin respawn it automatically.
  const doRestartTerminal = useCallback(async (pid: number) => {
    setBusy(true);
    try {
      await fetch("/api/system/instances/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pid }),
      });
    } catch {}
    setBusy(false);
    setConfirmRestartPid(null);
    void load();
  }, [load]);

  const relativeTime = (startedAt: string | null) => {
    if (!startedAt) return "";
    const t = new Date(startedAt.replace(/\s+/g, " ")).getTime();
    if (Number.isNaN(t)) return "";
    const secs = Math.max(0, Math.floor((Date.now() - t) / 1000));
    if (secs < 60) return `${secs}s`;
    if (secs < 3600) return `${Math.floor(secs / 60)}m`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
    return `${Math.floor(secs / 86400)}d`;
  };

  return (
    <div className="fixed right-3 bottom-3 z-50">
      {open ? (
        <div className="mb-2 w-[360px] max-w-[calc(100vw-2rem)] rounded-xl border border-kumo-line bg-kumo-elevated shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-kumo-line bg-kumo-elevated/60">
            <Cpu size={13} className="text-kumo-brand" />
            <span className="text-xs font-medium text-kumo-default">Server Instances</span>
            <span className="text-[10px] text-kumo-subtle">
              {instances.length} terdeteksi{others.length > 0 ? ` · ${others.length} bukan ini` : ""}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => { setRefreshing(true); void load().finally(() => setRefreshing(false)); }}
                className="p-1 rounded text-kumo-subtle hover:text-kumo-default transition-colors"
                title="Refresh"
              >
                <ArrowsClockwise size={12} className={refreshing ? "animate-spin" : ""} />
              </button>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded text-kumo-subtle hover:text-kumo-default transition-colors"
                title="Tutup"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
            {error && (
              <div className="px-2 py-1.5 text-[11px] text-red-400 bg-red-500/10 rounded">{error}</div>
            )}
            {instances.length === 0 && (
              <div className="px-2 py-3 text-[11px] text-kumo-subtle text-center">Tidak ada instance terdeteksi.</div>
            )}
            {instances.map((i) => {
              const isSelf = i.selfTree;
              const isConfirming = confirmPid === i.pid;
              return (
                <div key={i.pid} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[11px] ${
                  isSelf ? "border-green-500/25 bg-green-500/5" : "border-kumo-line/40 bg-kumo-elevated/40"
                }`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-mono text-kumo-default`}>PID {i.pid}</span>
                      {isSelf && <span className="text-[9px] px-1 py-px rounded-full bg-green-500/15 text-green-400">ini</span>}
                      <span className="text-kumo-subtle">{relativeTime(i.startedAt)}</span>
                      {i.rssMB != null && <span className="text-kumo-subtle">{i.rssMB}MB</span>}
                    </div>
                    <div className="text-kumo-subtle truncate mt-0.5">{ROLE_LABEL[i.role] ?? i.role}</div>
                  </div>
                  {!isSelf && (
                    isConfirming ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => void doKill(i.pid)}
                          disabled={busy}
                          className="px-2 py-1 text-[10px] font-medium rounded-full bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors disabled:opacity-50"
                        >
                          {busy ? "…" : "Yakin?"}
                        </button>
                        <button
                          onClick={() => setConfirmPid(null)}
                          className="px-2 py-1 text-[10px] rounded-full border border-kumo-line text-kumo-subtle hover:text-kumo-default transition-colors"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmPid(i.pid)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                        title="Kill instance ini"
                      >
                        <Trash size={10} /> Kill
                      </button>
                    )
                  )}
                  {i.role === "terminal-server" && (
                    confirmRestartPid === i.pid ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => void doRestartTerminal(i.pid)}
                          disabled={busy}
                          className="px-2 py-1 text-[10px] font-medium rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 hover:bg-amber-500/25 transition-colors disabled:opacity-50"
                        >
                          {busy ? "…" : "Yakin?"}
                        </button>
                        <button
                          onClick={() => setConfirmRestartPid(null)}
                          className="px-2 py-1 text-[10px] rounded-full border border-kumo-line text-kumo-subtle hover:text-kumo-default transition-colors"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmRestartPid(i.pid)}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-full border border-amber-500/30 text-amber-400 hover:bg-amber-500/10 transition-colors shrink-0"
                        title="Restart terminal server (auto respawn)"
                      >
                        <ArrowsClockwise size={10} /> Restart
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
          {others.length > 0 ? (
            <div className="px-3 py-1.5 border-t border-kumo-line/60 text-[10px] text-kumo-subtle">
              Instance lama makan ~100–200MB per proses. Kill untuk membersihkan.
            </div>
          ) : instances.length > 0 ? (
            <div className="px-3 py-1.5 border-t border-kumo-line/60 text-[10px] text-green-400/70">
              Tidak ada instance basi — semua server aktif.
            </div>
          ) : null}
        </div>
      ) : (
        <button
          onClick={() => { setOpen(true); void load(); }}
          className="relative flex items-center justify-center size-9 rounded-full border border-kumo-line/60 bg-kumo-elevated/80 backdrop-blur text-kumo-subtle hover:text-kumo-default hover:border-kumo-line shadow-lg transition-colors"
          title="Server instances"
        >
          <Cpu size={16} />
          {others.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {others.length}
            </span>
          )}
        </button>
      )}
    </div>
  );
}
