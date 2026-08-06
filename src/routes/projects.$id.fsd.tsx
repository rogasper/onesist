import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useRef } from "react";
import { Badge, Button, Dialog, DialogDescription, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { MagnifyingGlass, Play, Stop, FloppyDisk, SealCheck } from "@phosphor-icons/react";
import { FsdSidebar } from "~/components/fsd/FsdSidebar";
import { FsdEditor, type EditorMode } from "~/components/fsd/FsdEditor";
import { FsdCompleteness } from "~/components/fsd/FsdCompleteness";
import { FsdUploadDialog } from "~/components/fsd/FsdUploadDialog";
import { AgentStream } from "~/components/agent/AgentStream";
import { useFsdConversion } from "~/lib/use-file-data";
import type { CompletenessResult } from "~/lib/fsd-completeness";

interface FsdSession {
  id: string;
  projectId: string;
  fsdInputPath: string | null;
  fsdContent: string | null;
  mode: string;
  status: string;
  artifactsJson: string | null;
  agentOutput: string | null;
  title: string | null;
  sourceType: string | null;
  sourceFilePath: string | null;
  markdownPath: string | null;
  completenessJson: string | null;
  contentHash: string | null;
  conversionStatus: string | null;
  conversionError: string | null;
  createdAt: string;
  updatedAt: string;
}

export const Route = createFileRoute("/projects/$id/fsd")({
  component: FsdPage,
});

function FsdPage() {
  const { id } = Route.useParams();
  const [sessions, setSessions] = useState<FsdSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [agentName, setAgentName] = useState<string>("opencode");
  const [agentCommand, setAgentCommand] = useState<string>("opencode");
  const [running, setRunning] = useState(false);
  const [showStream, setShowStream] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [draftContent, setDraftContent] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const initialSelectDone = useRef(false);

  // Background conversion notifications
  useFsdConversion((data) => {
    if (data.status === "converted") {
      void fetch(`/api/projects/${id}/fsd/scan`, { method: "POST" }).then(() => loadSessions());
    } else {
      loadSessions();
    }
    setToast(
      data.status === "converted"
        ? { kind: "success", text: "Conversion complete — document is ready to edit" }
        : data.status === "converting"
          ? null
          : { kind: "error", text: `Conversion failed: ${data.error ?? "unknown error"}` },
    );
    if (data.status !== "converting") setTimeout(() => setToast(null), 6000);
  });

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;
  const editorContent = draftContent ?? activeSession?.fsdContent ?? "";

  const loadSessions = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${id}/fsd`);
      if (res.ok) {
        const list = await res.json();
        setSessions(list);
        if (!initialSelectDone.current && list.length > 0) {
          setActiveId(list[0].id);
          initialSelectDone.current = true;
        }
        setLoaded(true);
      }
    } catch {}
  }, [id]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Reset the draft when switching to a different document
  useEffect(() => {
    setDraftContent(null);
    setDirty(false);
  }, [activeId]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    try { await fetch(`/api/projects/${id}/fsd/scan`, { method: "POST" }); await loadSessions(); } catch {}
    setScanning(false);
  }, [id, loadSessions]);

  const handleCreate = useCallback(() => {
    const title = window.prompt("FSD title", "New Feature FSD");
    if (!title?.trim()) return;
    fetch(`/api/projects/${id}/fsd`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim() }),
    }).then((r) => r.ok ? r.json() : null).then((session) => {
      if (session) {
        setSessions((p) => [session, ...p]);
        setActiveId(session.id);
        setDraftContent(session.fsdContent ?? "");
      }
    });
  }, [id]);

  const handleDelete = useCallback(async (sessionId: string) => {
    const res = await fetch(`/api/projects/${id}/fsd/${sessionId}`, { method: "DELETE" });
    if (res.ok) { setSessions((p) => p.filter((s) => s.id !== sessionId)); if (activeId === sessionId) setActiveId(null); }
  }, [id, activeId]);

  const [deleteTarget, setDeleteTarget] = useState<FsdSession | null>(null);

  const requestDelete = useCallback((session: FsdSession) => {
    setDeleteTarget(session);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    await handleDelete(deleteTarget.id);
    setDeleteTarget(null);
  }, [deleteTarget, handleDelete]);

  const handleSave = useCallback(async (statusOverride?: string) => {
    if (!activeSession) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}/fsd/${activeSession.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editorContent,
          ...(statusOverride ? { status: statusOverride } : {}),
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSessions((p) => p.map((s) => (s.id === updated.id ? updated : s)));
        setDirty(false);
      }
    } catch {}
    setSaving(false);
  }, [id, activeSession, editorContent]);

  const handleReady = useCallback(async () => {
    if (!activeSession) return;
    const res = await fetch(`/api/projects/${id}/fsd/${activeSession.id}/ready`, { method: "POST" });
    if (res.ok) {
      const updated = await res.json();
      setSessions((p) => p.map((s) => (s.id === updated.id ? updated : s)));
    }
  }, [id, activeSession]);

  const handleConvert = useCallback(async () => {
    if (!activeSession) return;
    const res = await fetch(`/api/projects/${id}/fsd/${activeSession.id}/convert`, { method: "POST" });
    if (res.ok) {
      setSessions((p) => p.map((s) => (s.id === activeSession.id ? { ...s, conversionStatus: "converting" } : s)));
    }
  }, [id, activeSession]);

  const handleUploaded = useCallback((result: any) => {
    setUploadOpen(false);
    setToast({
      kind: "success",
      text: result.conversionStarted ? "Conversion started in the background" : "Markdown file uploaded",
    });
    void handleScan();
    setTimeout(() => setToast(null), 5000);
  }, [handleScan]);

  // Load agents
  const agentPickerCalled = useRef(false);
  if (!agentPickerCalled.current) {
    agentPickerCalled.current = true;
    fetch("/api/agent/detect").then((r) => r.json()).then((data) => {
      const found = data.find((a: any) => a.found);
      if (found) { setAgentName(found.name); setAgentCommand(found.command); }
    }).catch(() => {});
  }

  let artifacts: Record<string, string[]> = {};
  try {
    if (activeSession?.artifactsJson) artifacts = JSON.parse(activeSession.artifactsJson);
  } catch {}

  const artifactCount = (artifacts.spec?.length ?? 0) + (artifacts.erd?.length ?? 0) + (artifacts.task?.length ?? 0);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 70px)" }}>
      <div className="mb-3 shrink-0">
        <div className="text-xs text-kumo-subtle mb-1">
          <Link to="/projects/$id" params={{ id }} className="text-kumo-subtle hover:text-kumo-default no-underline">Projects</Link>
          <span className="mx-1.5 text-kumo-subtle">/</span>
          <span className="text-kumo-subtle">FSD Analyzer</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded bg-kumo-elevated p-1"><MagnifyingGlass size={14} className="text-kumo-brand" /></div>
          <h1 className="text-lg text-kumo-default">FSD Analyzer</h1>
          {sessions.length > 0 && <Badge variant="neutral" className="text-[11px]">{sessions.length} documents</Badge>}
          {activeSession?.status === "ready" && <Badge variant="neutral" className="text-[11px] text-green-400/80">ready for analysis</Badge>}
          {activeSession?.conversionStatus === "failed" && <Badge variant="neutral" className="text-[11px] text-red-400/80">conversion failed</Badge>}
          {activeSession && (
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => handleReady()}
                disabled={activeSession.status === "ready"}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-full border transition-all disabled:opacity-40 ${
                  activeSession.status === "ready"
                    ? "border-green-500/40 text-green-400 bg-green-500/10"
                    : "border-kumo-line/50 text-kumo-subtle hover:text-kumo-default hover:bg-white/5"
                }`}
                title="Mark as ready for analysis"
              >
                <SealCheck size={12} />
                {activeSession.status === "ready" ? "Ready" : "Mark Ready"}
              </button>
            </div>
          )}
        </div>
        {!loaded && <div className="text-xs text-kumo-subtle mt-1 ml-9">Loading documents...</div>}
      </div>

      {uploadOpen && <FsdUploadDialog projectId={id} onClose={() => setUploadOpen(false)} onUploaded={handleUploaded} />}

      <DialogRoot open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <Dialog>
          <div className="p-5">
            <DialogTitle>Delete FSD document</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <b>{deleteTarget?.title ?? "this document"}</b>?
              {deleteTarget?.sourceFilePath && (
                <span className="block mt-1">The uploaded source file <code className="text-[10px]">{deleteTarget.sourceFilePath}</code> will also be removed from disk.</span>
              )}
              {dirty && <span className="block mt-1 text-amber-400/90">There are unsaved edits in the editor — they will be lost.</span>}
              {running && <span className="block mt-1 text-amber-400/90">Analysis is currently running for this project.</span>}
              <span className="block mt-1 text-kumo-subtle">This action cannot be undone.</span>
            </DialogDescription>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete}>Delete</Button>
            </div>
          </div>
        </Dialog>
      </DialogRoot>

      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-3 py-2 rounded-lg border text-xs shadow-lg ${
          toast.kind === "success"
            ? "border-green-500/40 bg-green-500/15 text-green-400"
            : "border-red-500/40 bg-red-500/15 text-red-400"
        }`}>
          {toast.text}
        </div>
      )}

      <div className="flex flex-1 min-h-0 gap-3">
        <div className="w-56 shrink-0 glass-container overflow-y-auto">
          <FsdSidebar
            sessions={sessions}
            activeId={activeId}
            search={search}
            onSearchChange={setSearch}
            onSelect={setActiveId}
            onScan={handleScan}
            onCreate={handleCreate}
            onUpload={() => setUploadOpen(true)}
            scanning={scanning}
          />
        </div>
        <div className="flex-1 flex flex-col min-w-0 gap-3">
          <div className="flex-1 rounded-lg border border-kumo-line overflow-hidden flex bg-kumo-elevated">
            {activeSession ? (
              <>
                <div className="flex-1 flex flex-col min-w-0">
                  {/* Session header */}
                  <div className="flex items-center gap-2 px-4 py-2 border-b border-kumo-line shrink-0">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-kumo-default truncate">
                        {activeSession.title ?? activeSession.fsdInputPath ?? "FSD Document"}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          activeSession.status === "completed" ? "text-green-400 bg-green-500/15"
                          : activeSession.status === "ready" ? "text-green-400 bg-green-500/15"
                          : activeSession.status === "analyzing" ? "text-amber-400 bg-amber-500/15"
                          : "text-kumo-subtle bg-kumo-elevated/60"
                        }`}>{activeSession.status}</span>
                        {activeSession.sourceType && <span className="text-[10px] text-kumo-subtle">src: {activeSession.sourceType}</span>}
                        {activeSession.conversionStatus === "converting" && (
                          <span className="text-[10px] text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded animate-pulse">converting…</span>
                        )}
                        {activeSession.conversionError && <span className="text-[10px] text-red-400/80" title={activeSession.conversionError}>conversion error</span>}
                        {artifactCount > 0 && <span className="text-[10px] text-kumo-subtle">{artifactCount} artifacts</span>}
                      </div>
                    </div>
                    {dirty && (
                      <button onClick={() => handleSave()}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] rounded liquid-wash border-transparent font-medium"
                        title="Save (Cmd/Ctrl+S)">
                        <FloppyDisk size={11} /> Save
                      </button>
                    )}
                    {(activeSession.conversionStatus === "pending" || activeSession.conversionStatus === "failed") && (
                      <button
                        onClick={handleConvert}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-kumo-line text-kumo-subtle hover:text-kumo-default transition-colors"
                        title="Convert the uploaded file to Markdown with the markitdown skill (background)"
                      >
                        <MagnifyingGlass size={11} />
                        Convert to Markdown
                      </button>
                    )}
                    <button onClick={() => requestDelete(activeSession)}
                      className="text-[10px] text-red-400/70 hover:text-red-400 px-2 py-1 border border-red-400/20 rounded transition-colors">
                      Delete
                    </button>
                  </div>
                  {/* Artifacts row */}
                  {artifactCount > 0 && (
                    <div className="px-4 py-1.5 border-b border-kumo-line/50 shrink-0 flex items-center gap-2 flex-wrap">
                      <span className="text-[9px] text-kumo-subtle uppercase tracking-wider">Artifacts:</span>
                      {[...(artifacts.spec ?? []), ...(artifacts.erd ?? []), ...(artifacts.task ?? [])].map((f) => (
                        <span key={f} className="text-[9px] text-kumo-subtle font-mono bg-kumo-elevated/60 px-1.5 py-0.5 rounded">{f}</span>
                      ))}
                    </div>
                  )}
                  <FsdEditor
                    content={editorContent}
                    dirty={dirty}
                    saving={saving}
                    mode={editorMode}
                    onModeChange={setEditorMode}
                    onChange={(v) => { setDraftContent(v); setDirty(true); }}
                    onSave={() => handleSave()}
                  />
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-kumo-subtle">
                {loaded ? (sessions.length === 0 ? "No FSD documents — click 'New FSD' or 'Upload document' to start" : "Select a document from the sidebar") : "Loading..."}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
