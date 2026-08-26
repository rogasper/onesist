import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@cloudflare/kumo";
import { LinkSimple, Plus, Robot, TrayArrowDown, Copy, DownloadSimple, CaretDown, MagnifyingGlass, Check } from "@phosphor-icons/react";
import { AppButton } from "~/components/ui/AppButton";
import { PageHeader } from "~/components/ui/PageHeader";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { Toast, type ToastMessage } from "~/components/ui/Toast";
import { AgentStream } from "~/components/agent/AgentStream";
import { ModelPickerDialog } from "~/components/agent/ModelPickerDialog";
import { RtmMatrix } from "~/components/rtm/RtmMatrix";
import { EntityDialog, RTM_PREFIX } from "~/components/rtm/EntityDialog";
import { ImportPreviewDialog, type ImportPreview } from "~/components/rtm/ImportPreviewDialog";
import type { EntityKind, RtmEntity } from "~/components/rtm/types";
import type { RtmDataset } from "~/shared/types";
import { summarizeTrace } from "~/lib/rtm-trace";

export const Route = createFileRoute("/projects/$id/rtm")({
  component: RtmPage,
});

function RtmPage() {
  const { id } = Route.useParams();
  const [data, setData] = useState<RtmDataset | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [dialog, setDialog] = useState<{ kind: EntityKind; initial: RtmEntity | null; frId: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: EntityKind; entity: RtmEntity } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genSessionId, setGenSessionId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [applying, setApplying] = useState(false);
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [fsdFiles, setFsdFiles] = useState<string[]>([]);
  const [scopesLoading, setScopesLoading] = useState(true);
  const [activeFsd, setActiveFsd] = useState<string>(() => {
    try { return sessionStorage.getItem(`onesist:rtm-fsd:${id}`) ?? "default"; } catch { return "default"; }
  });
  const [selectedFds, setSelectedFds] = useState<string[]>(() => {
    try { return JSON.parse(sessionStorage.getItem(`onesist:rtm-fds:${id}`) ?? "[]") as string[]; } catch { return []; }
  });

  const agentStorageKey = `onesist:rtm-agent:${id}`;

  const clearStoredAgent = useCallback(() => {
    try { sessionStorage.removeItem(agentStorageKey); } catch {}
  }, [agentStorageKey]);

  const showToast = useCallback((kind: "success" | "error", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    // Retry — the desktop sidecar may still be booting on first mount.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`/api/projects/${id}/rtm?fsd=${encodeURIComponent(activeFsd)}`, { cache: "no-store" });
        if (res.ok) {
          setData(await res.json());
          setLoaded(true);
          return;
        }
      } catch {}
      if (attempt < 2) await new Promise((r) => setTimeout(r, 800));
    }
    setLoaded(true);
  }, [id, activeFsd]);
  useEffect(() => { void load(); }, [load]);

  // Scopes for the RTM selector (distinct fsd in DB + RTM_*.md files) and the
  // raw FSD file list for the multiselect pills. Retry a few times — the
  // desktop sidecar may still be booting on first mount.
  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    const fetchScopes = () => {
      fetch(`/api/projects/${id}/rtm/scopes`, { cache: "no-store" })
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          if (Array.isArray(d.scopes)) setScopes(d.scopes);
          if (Array.isArray(d.files)) setFsdFiles(d.files);
          setScopesLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          attempts += 1;
          if (attempts < 3) setTimeout(fetchScopes, 800);
          else setScopesLoading(false);
        });
    };
    fetchScopes();
    return () => { cancelled = true; };
  }, [id]);

  const changeFsd = (v: string) => {
    setActiveFsd(v);
    try { sessionStorage.setItem(`onesist:rtm-fsd:${id}`, v); } catch {}
    void load();
  };

  const toggleFd = useCallback((fd: string) => {
    setSelectedFds((prev) => {
      // Empty selection means "all files". First click turns it into a real
      // selection minus the toggled one; subsequent clicks toggle membership.
      let next: string[];
      if (prev.length === 0) {
        next = fsdFiles.filter((f) => f !== fd);
      } else {
        next = prev.includes(fd) ? prev.filter((f) => f !== fd) : [...prev, fd];
      }
      try { sessionStorage.setItem(`onesist:rtm-fds:${id}`, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [id, fsdFiles]);

  const saveEntity = useCallback(async (values: Record<string, unknown>) => {
    if (!dialog) return;
    const kind = dialog.kind;
    const url = dialog.initial
      ? `/api/projects/${id}/rtm/${kind}/${dialog.initial.id}`
      : `/api/projects/${id}/rtm/${kind}`;
    setSaving(true);
    try {
      const res = await fetch(url, {
        method: dialog.initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, ...(!dialog.initial ? { fsd: activeFsd } : {}) }),
      });
      if (res.ok) {
        const saved = await res.json();
        if (!dialog.initial && dialog.frId && (kind === "design" || kind === "test")) {
          await fetch(`/api/projects/${id}/rtm/links`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ frId: dialog.frId, [kind === "design" ? "dsId" : "tcId"]: saved.id }),
          });
        }
        setDialog(null);
        showToast("success", `${RTM_PREFIX[kind]} ${saved.code} saved`);
        void load();
      } else {
        showToast("error", `Gagal menyimpan ${RTM_PREFIX[kind]}`);
      }
    } catch {
      showToast("error", `Gagal menyimpan ${RTM_PREFIX[kind]}`);
    }
    setSaving(false);
  }, [dialog, id, load, showToast, activeFsd]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const { kind, entity } = deleteTarget;
    try {
      await fetch(`/api/projects/${id}/rtm/${kind}/${entity.id}`, { method: "DELETE" });
      showToast("success", `${(entity as any).code} deleted`);
      void load();
    } catch {
      showToast("error", "Gagal menghapus");
    }
    setDeleteTarget(null);
  }, [deleteTarget, id, load, showToast]);

  /** Toggle a link: if a link for (frId, kind, id) exists → remove, else create. */
  const link = useCallback(async (frId: string, kind: "design" | "test", entityId: string | null) => {
    if (!data || !entityId) return;
    const existing = data.links.find((l) => l.frId === frId && (kind === "design" ? l.dsId : l.tcId) === entityId);
    try {
      if (existing) {
        await fetch(`/api/projects/${id}/rtm/links/${existing.id}`, { method: "DELETE" });
      } else {
        await fetch(`/api/projects/${id}/rtm/links`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frId, fsd: activeFsd, [kind === "design" ? "dsId" : "tcId"]: entityId }),
        });
      }
      void load();
    } catch {
      showToast("error", "Gagal mengubah link");
    }
  }, [data, id, load, showToast, activeFsd]);

  const previewImport = useCallback(async (open = true) => {
    try {
      const res = await fetch(`/api/projects/${id}/rtm/import/preview`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        if (open) setPreview(result);
        return result;
      }
    } catch {}
    return null;
  }, [id]);

  const applyImport = useCallback(async () => {
    setApplying(true);
    try {
      const res = await fetch(`/api/projects/${id}/rtm/import/apply`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setPreview(null);
        showToast("success", `Import selesai: +${result.inserted} baru, ${result.updated} update`);
        void load();
      } else {
        showToast("error", "Import gagal");
      }
    } catch {
      showToast("error", "Import gagal");
    }
    setApplying(false);
  }, [id, load, showToast]);

  const startAgent = useCallback(async (feedback?: string, model?: string) => {
    // If a run is active (or a finished session is parked), stop it first so
    // the new run always starts clean. For feedback, `prev` lets the server
    // resume the SAME agent session with the correction.
    const prev = genSessionId;
    if (prev) {
      await fetch("/api/agent/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: prev }),
      }).catch(() => {});
    }
    clearStoredAgent();
    setGenSessionId(null);
    setGenerating(true);
    try {
      const detectRes = await fetch("/api/agent/detect", { cache: "no-store" });
      const agents = await detectRes.json();
      const found = (agents ?? []).find((a: any) => a.found);
      const command = found?.command ?? "opencode";
      const sid = crypto.randomUUID();
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          command,
          agentName: found?.name ?? "opencode",
          mode: "rtm",
          projectId: id,
          fsd: activeFsd,
          fds: selectedFds.length > 0 ? selectedFds : undefined,
          ...(feedback ? { feedback, previousSessionId: prev } : {}),
          ...(model ? { model } : {}),
        }),
      });
      if (res.ok) {
        setGenSessionId(sid);
        try { sessionStorage.setItem(agentStorageKey, sid); } catch {}
      } else {
        setGenerating(false);
      }
    } catch {
      setGenerating(false);
    }
  }, [genSessionId, id, agentStorageKey, clearStoredAgent, activeFsd, selectedFds]);

  const handleGenerate = useCallback(() => setModelPickerOpen(true), []);
  const handleFeedback = useCallback((text: string) => { void startAgent(text); }, [startAgent]);

  const copyPrompt = useCallback(async () => {
    try {
      const fdsQuery = selectedFds.length > 0 ? `&fds=${encodeURIComponent(selectedFds.join(","))}` : "";
      const res = await fetch(`/api/agent/prompt?projectId=${encodeURIComponent(id)}&mode=rtm&fsd=${encodeURIComponent(activeFsd)}${fdsQuery}`, { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        await navigator.clipboard.writeText(d.command);
        showToast("success", `Prompt disalin (${d.agentName}) — tempel di terminal`);
      } else {
        showToast("error", "Gagal membuat prompt");
      }
    } catch {
      showToast("error", "Gagal menyalin prompt");
    }
  }, [id, showToast, activeFsd, selectedFds]);

  const exportRtm = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}/rtm/export?fsd=${encodeURIComponent(activeFsd)}`, { method: "POST" });
      if (res.ok) {
        const d = await res.json();
        showToast("success", `Exported ke ${d.path} (${d.brs} BR · ${d.frs} FR)`);
      } else {
        showToast("error", "Export gagal — pastikan project root di-set");
      }
    } catch {
      showToast("error", "Export gagal");
    }
  }, [id, showToast, activeFsd]);

  const handleAgentDone = useCallback(() => {
    setGenerating(false);
    // Keep genSessionId so the completed panel + feedback box stay visible.
    void previewImport(true);
  }, [previewImport]);

  const handleAgentError = useCallback(() => {
    setGenerating(false);
    // Keep genSessionId so the failed panel + feedback box stay visible.
  }, []);

  const handleAgentStopped = useCallback(() => {
    setGenerating(false);
    setGenSessionId(null);
    clearStoredAgent();
  }, [clearStoredAgent]);

  const handleClose = useCallback(() => {
    setGenerating(false);
    setGenSessionId(null);
    clearStoredAgent();
  }, [clearStoredAgent]);

  // Restore a running (or already-finished) agent session after a page refresh:
  // the stored sessionId survives, so AgentStream replays the buffered events.
  useEffect(() => {
    let cancelled = false;
    const stored = (() => { try { return sessionStorage.getItem(agentStorageKey); } catch { return null; } })();
    if (!stored) return;
    (async () => {
      try {
        const [statusRes, logsRes] = await Promise.all([
          fetch("/api/agent/status", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ running: [] })),
          fetch(`/api/agent/logs?sessionId=${encodeURIComponent(stored)}`, { cache: "no-store" })
            .then((r) => r.json())
            .catch(() => ({ events: [] })),
        ]);
        if (cancelled) return;
        const running = (statusRes?.running ?? []).some((a: any) => a.sessionId === stored);
        const hasEvents = Array.isArray(logsRes?.events) && logsRes.events.length > 0;
        if (running || hasEvents) {
          setGenSessionId(stored);
          setGenerating(running);
        } else {
          clearStoredAgent();
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [agentStorageKey, clearStoredAgent]);

  const summary = data ? summarizeTrace(data.frs, data.links) : null;
  const brNoFr = data ? data.brs.filter((br) => !data.frs.some((f) => f.brId === br.id)).length : 0;

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        icon={<LinkSimple size={14} className="text-kumo-brand" />}
        title="Traceability"
        help="rtm"
        badges={
          summary && summary.frCount > 0 ? (
            <Badge variant="neutral" className="text-[11px]">
              {summary.frCount} FR · {summary.brMapped}/{summary.brMapped + summary.brUnmapped} mapped · {summary.full} lengkap
              {summary.none > 0 && ` · ${summary.none} unmapped`}
            </Badge>
          ) : undefined
        }
        actions={
          <>
            <AppButton
              onClick={handleGenerate}
              variant="primary"
              size="sm"
              icon={<Robot size={12} className={generating ? "animate-pulse" : ""} />}
              className="rounded-full px-3"
              title={generating ? "Agent sedang berjalan — klik untuk stop & mulai ulang" : "Jalankan agent untuk menyusun RTM dari artifacts (output/rtm/RTM.md)"}
            >
              {generating ? "Agent berjalan…" : "Agent bantu"}
            </AppButton>
            <AppButton
              onClick={copyPrompt}
              variant="secondary"
              size="sm"
              icon={<Copy size={12} />}
              className="rounded-full px-3"
              title="Salin prompt + command untuk dijalankan manual di terminal (fallback saat Agent bantu error)"
            >
              Copy Prompt
            </AppButton>
            <AppButton
              onClick={exportRtm}
              variant="secondary"
              size="sm"
              icon={<DownloadSimple size={12} />}
              className="rounded-full px-3"
              title="Export state DB ke output/rtm/RTM.md agar agent bisa lanjut di markdown"
            >
              Export
            </AppButton>
            <AppButton
              onClick={() => void previewImport(true)}
              variant="secondary"
              size="sm"
              icon={<TrayArrowDown size={12} />}
              className="rounded-full px-3"
              title="Import dari output/rtm/*.md"
            >
              Import
            </AppButton>
            <AppButton onClick={() => setDialog({ kind: "br", initial: null, frId: null })} variant="secondary" size="sm" icon={<Plus size={12} />} className="rounded-full px-3">
              BR
            </AppButton>
            <AppButton onClick={() => setDialog({ kind: "fr", initial: null, frId: null })} variant="secondary" size="sm" icon={<Plus size={12} />} className="rounded-full px-3">
              FR
            </AppButton>
            <AppButton onClick={() => setDialog({ kind: "design", initial: null, frId: null })} variant="secondary" size="sm" icon={<Plus size={12} />} className="rounded-full px-3">
              Design
            </AppButton>
            <AppButton onClick={() => setDialog({ kind: "test", initial: null, frId: null })} variant="secondary" size="sm" icon={<Plus size={12} />} className="rounded-full px-3">
              Test
            </AppButton>
          </>
        }
        below={
          <>
            <div className="flex items-center gap-2 flex-wrap">
              <ScopePicker value={activeFsd} scopes={scopes} loading={scopesLoading} onChange={changeFsd} />
              <FdPills
                fds={fsdFiles}
                selectedFds={selectedFds}
                onToggleFd={toggleFd}
              />
              {data && summary && summary.frCount > 0 && (
                <div className="flex items-center gap-3 flex-wrap text-[11px]">
                  <GapStat label="BR belum dipecah" value={brNoFr} danger={brNoFr > 0} />
                  <GapStat label="FR tanpa Design" value={summary.testOnly + summary.none} danger={(summary.testOnly + summary.none) > 0} />
                  <GapStat label="FR tanpa Test" value={summary.designOnly + summary.none} danger={(summary.designOnly + summary.none) > 0} />
                </div>
              )}
              <span className="text-kumo-subtle ml-auto text-[11px]">Klik cell untuk menautkan design/test · klik kode untuk edit</span>
            </div>
          </>
        }
      />

      <Toast toast={toast} onClose={() => setToast(null)} />

      {genSessionId && (
        <div className="shrink-0 mb-3">
          <AgentStream sessionId={genSessionId} onDone={handleAgentDone} onError={handleAgentError} onStopped={handleAgentStopped} onFeedback={handleFeedback} onClose={handleClose} />
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        {!loaded ? (
          <div className="text-xs text-kumo-subtle">Loading…</div>
        ) : data ? (
          <RtmMatrix
            data={data}
            callbacks={{
              onEdit: (kind, entity) => setDialog({ kind, initial: entity, frId: null }),
              onDelete: (kind, entity) => setDeleteTarget({ kind, entity }),
              onLink: link,
              onCreate: (kind, frId) => setDialog({ kind, initial: null, frId }),
            }}
          />
        ) : (
          <div className="text-xs text-red-400">Gagal memuat data</div>
        )}
      </div>

      <EntityDialog
        open={dialog !== null}
        kind={dialog?.kind ?? "br"}
        initial={dialog?.initial ?? null}
        brs={data?.brs ?? []}
        onClose={() => setDialog(null)}
        onSave={saveEntity}
        onDelete={(kind, entity) => { setDialog(null); setDeleteTarget({ kind, entity }); }}
        saving={saving}
      />

      <ImportPreviewDialog
        preview={preview}
        onClose={() => setPreview(null)}
        onApply={applyImport}
        applying={applying}
      />

      <ModelPickerDialog
        open={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        onRun={(model) => { setModelPickerOpen(false); void startAgent(undefined, model); }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete"
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
      >
        Hapus <b>{(deleteTarget?.entity as any)?.code}</b> — {(deleteTarget?.entity as any)?.title}? Link yang terkait juga ikut terhapus.
      </ConfirmDialog>
    </div>
  );
}

function GapStat({ label, value, danger }: { label: string; value: number; danger: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-medium transition-colors ${
        danger
          ? "border-red-500/30 bg-red-500/10 text-red-400"
          : "border-kumo-line/60 bg-kumo-elevated text-kumo-subtle"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${danger ? "bg-red-400" : "bg-green-400"}`} />
      <span>{label}:</span>
      <span className={danger ? "text-red-400 font-bold" : "text-kumo-default"}>{value}</span>
    </span>
  );
}

/** Searchable scope (RTM) dropdown — pick which RTM scope is active. */
function ScopePicker({ value, scopes, loading, onChange }: {
  value: string;
  scopes: string[];
  loading: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const filtered = scopes.filter((s) => s.toLowerCase().includes(query));

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="h-7 inline-flex items-center gap-1.5 px-3 text-xs font-medium rounded-full border border-kumo-line/80 bg-kumo-elevated text-kumo-default hover:border-kumo-brand/50 hover:bg-kumo-elevated/80 transition-all shadow-xs"
        title="Scope RTM — satu scope = satu file RTM"
      >
        <span className="text-kumo-subtle text-[10px] uppercase tracking-wider">Scope</span>
        <span className="font-semibold">{loading ? "Memuat…" : value === "default" ? "default" : value}</span>
        <CaretDown size={11} weight="bold" className="text-kumo-subtle" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 z-30 w-60 rounded-lg border border-kumo-line bg-kumo-elevated shadow-xl p-1.5 flex flex-col max-h-80">
            <div className="flex items-center gap-1.5 px-1 pb-1.5 shrink-0">
              <MagnifyingGlass size={11} className="text-kumo-subtle shrink-0" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari scope…"
                className="w-full bg-kumo-recessed/60 border border-kumo-line rounded px-2 py-1 text-[11px] text-kumo-default placeholder:text-kumo-subtle focus:border-kumo-brand focus:outline-none"
              />
            </div>
            <div className="overflow-y-auto flex-1 min-h-0">
              {loading ? (
                <div className="px-2 py-2 text-[11px] text-kumo-subtle">Memuat…</div>
              ) : filtered.length === 0 ? (
                <div className="px-2 py-2 text-[11px] text-kumo-subtle">Tidak ada hasil untuk "{q}"</div>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { onChange(s); setOpen(false); setQ(""); }}
                    className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[11px] rounded hover:bg-kumo-tint transition-colors ${s === value ? "text-kumo-brand font-medium" : "text-kumo-default"}`}
                  >
                    <span>{s === "default" ? "default" : s}</span>
                    {s === value && <Check size={11} className="ml-auto shrink-0" />}
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Inline FSD pills (ERD-style file chips) — click to toggle which FSD files
 *  are traced into the active scope's RTM. Empty selection = all files. */
function FdPills({ fds, selectedFds, onToggleFd }: {
  fds: string[];
  selectedFds: string[];
  onToggleFd: (fd: string) => void;
}) {
  if (fds.length === 0) return null;
  return (
    <div className="flex-1 flex items-center gap-1 py-0.5 overflow-x-auto min-w-0 no-scrollbar">
      {fds.map((fd) => {
        const active = selectedFds.length === 0 || selectedFds.includes(fd);
        const label = fd.replace(/^fsd_/, "").replace(/\.(md|json|docx)$/, "");
        return (
          <AppButton
            key={fd}
            variant="chip"
            size="xs"
            active={active}
            onClick={() => onToggleFd(fd)}
            className="px-2.5 shrink-0 truncate max-w-[180px]"
            title={active ? `Hapus ${label} dari seleksi` : `Tambahkan ${label} ke seleksi`}
          >
            {label}
          </AppButton>
        );
      })}
    </div>
  );
}
