import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@cloudflare/kumo";
import { LinkSimple, Plus, Robot, TrayArrowDown } from "@phosphor-icons/react";
import { AppButton } from "~/components/ui/AppButton";
import { PageHeader } from "~/components/ui/PageHeader";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { AgentStream } from "~/components/agent/AgentStream";
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
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const agentStorageKey = `onesist:rtm-agent:${id}`;

  const clearStoredAgent = useCallback(() => {
    try { sessionStorage.removeItem(agentStorageKey); } catch {}
  }, [agentStorageKey]);

  const showToast = useCallback((kind: "success" | "error", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}/rtm`, { cache: "no-store" });
      if (res.ok) {
        setData(await res.json());
        setLoaded(true);
      }
    } catch {}
  }, [id]);

  useEffect(() => { void load(); }, [load]);

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
        body: JSON.stringify(values),
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
  }, [dialog, id, load, showToast]);

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
          body: JSON.stringify({ frId, [kind === "design" ? "dsId" : "tcId"]: entityId }),
        });
      }
      void load();
    } catch {
      showToast("error", "Gagal mengubah link");
    }
  }, [data, id, load, showToast]);

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

  const startAgent = useCallback(async (feedback?: string) => {
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
          ...(feedback ? { feedback, previousSessionId: prev } : {}),
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
  }, [genSessionId, id, agentStorageKey, clearStoredAgent]);

  const handleGenerate = useCallback(() => { void startAgent(); }, [startAgent]);
  const handleFeedback = useCallback((text: string) => { void startAgent(text); }, [startAgent]);

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
        badges={
          <>
            {summary && summary.frCount > 0 && (
              <>
                <Badge variant="neutral" className="text-[11px]">{summary.frCount} FR</Badge>
                <Badge variant="neutral" className="text-[11px]">{summary.brMapped}/{summary.brMapped + summary.brUnmapped} FR → BR</Badge>
                <Badge variant="neutral" className="text-[11px] text-green-400/80">{summary.full} lengkap</Badge>
                <Badge variant="neutral" className="text-[11px] text-amber-400/80">{summary.designOnly + summary.testOnly} parsial</Badge>
                <Badge variant="neutral" className="text-[11px] text-red-400/80">{summary.none} belum ditracing</Badge>
              </>
            )}
          </>
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
            {data && summary && summary.frCount > 0 && (
              <div className="flex items-center gap-3 flex-wrap text-[11px]">
                <GapStat label="BR belum dipecah" value={brNoFr} danger={brNoFr > 0} />
                <GapStat label="FR tanpa Design" value={summary.testOnly + summary.none} danger={(summary.testOnly + summary.none) > 0} />
                <GapStat label="FR tanpa Test" value={summary.designOnly + summary.none} danger={(summary.designOnly + summary.none) > 0} />
                <span className="text-kumo-subtle ml-auto">Klik cell untuk menautkan design/test · klik kode untuk edit</span>
              </div>
            )}
          </>
        }
      />

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-3 py-2 rounded-lg border text-xs shadow-lg ${
          toast.kind === "success"
            ? "border-green-500/40 bg-green-500/15 text-green-400"
            : "border-red-500/40 bg-red-500/15 text-red-400"
        }`}>
          {toast.text}
        </div>
      )}

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
        saving={saving}
      />

      <ImportPreviewDialog
        preview={preview}
        onClose={() => setPreview(null)}
        onApply={applyImport}
        applying={applying}
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
    <span className="inline-flex items-center gap-1">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${danger ? "bg-red-400" : "bg-green-400"}`} />
      <span className="text-kumo-subtle">{label}:</span>
      <span className={danger ? "text-red-400 font-medium" : "text-kumo-default"}>{value}</span>
    </span>
  );
}
