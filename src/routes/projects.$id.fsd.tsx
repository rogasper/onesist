import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useRef } from "react";
import { Badge, Button, Dialog, DialogDescription, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { MagnifyingGlass, Play, Stop, FloppyDisk, SealCheck, Plus, UploadSimple, Scan, PencilSimple, Trash, CopySimple, ClipboardText, CaretLeft, CaretRight, Eye, Columns, Check, CheckCircle, XCircle } from "@phosphor-icons/react";
import { FsdEditor, type EditorMode } from "~/components/fsd/FsdEditor";
import { FsdCompleteness } from "~/components/fsd/FsdCompleteness";
import { FsdUploadDialog } from "~/components/fsd/FsdUploadDialog";
import { AgentStream } from "~/components/agent/AgentStream";
import { FileTree, type FileTreeHandle } from "~/components/ui/FileTree";
import { ContextMenu } from "~/components/ui/ContextMenu";
import type { ContextMenuItem } from "~/components/ui/ContextMenu";
import { AppButton } from "~/components/ui/AppButton";
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

  // New FSD dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createError, setCreateError] = useState("");

  // File tree state
  const [fsdFiles, setFsdFiles] = useState<{ name: string; path: string; size: number }[]>([]);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; target: { kind: "file"; file: any } | { kind: "dir"; dir: string } } | null>(null);
  const [clipboard, setClipboard] = useState<{ path: string; name: string } | null>(null);
  const [fileDeleteTarget, setFileDeleteTarget] = useState<{ path: string; name: string } | null>(null);
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const fileTreeRef = useRef<FileTreeHandle>(null);

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
      const res = await fetch(`/api/projects/${id}/fsd`, { cache: "no-store" });
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

  const loadFsdFiles = useCallback(async () => {
    try {
      const res = await fetch(`/api/files/list?projectId=${id}&dir=input/fsd`, { cache: "no-store" });
      if (res.ok) setFsdFiles(await res.json());
    } catch {}
  }, [id]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  // Refresh file tree + sessions via SSE file:changed events. No polling —
  // the server file watcher now scans actual project roots, so project file
  // changes arrive as events. Debounce 400ms to coalesce burst events.
  useEffect(() => {
    let es: EventSource | null = null;
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let errorCount = 0;
    const schedule = () => {
      if (!mounted) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!mounted) return;
        void loadFsdFiles();
        void loadSessions();
      }, 400);
    };
    const init = async () => {
      try {
        const res = await fetch("/api/events/ticket", { method: "POST", cache: "no-store" });
        const d = await res.json();
        if (!mounted || !d.ticket) return;
        es = new EventSource(`/api/events?ticket=${d.ticket}`);
        es.addEventListener("file:changed", schedule);
        es.addEventListener("fsd:conversion", schedule);
        // Guard against infinite browser auto-reconnect loops: if the server
        // keeps failing (sidecar down/crash-looping), close the stream after
        // a few errors instead of letting the WebView spin reconnect requests
        // forever (that leaked hundreds of MB in the desktop app).
        es.onerror = () => {
          errorCount += 1;
          if (errorCount > 5) {
            es?.close();
            es = null;
          }
        };
      } catch {}
    };
    void init();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [loadFsdFiles, loadSessions]);

  // Reset the draft when switching to a different document
  useEffect(() => {
    setDraftContent(null);
    setDirty(false);
  }, [activeId]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    try { await fetch(`/api/projects/${id}/fsd/scan`, { method: "POST" }); await loadSessions(); } catch {}
    void loadFsdFiles();
    setScanning(false);
  }, [id, loadSessions, loadFsdFiles]);

  useEffect(() => { loadFsdFiles(); }, [loadFsdFiles]);

  // New FSD — create a Markdown template file with the given name.
  const handleCreate = useCallback(async () => {
    const raw = createName.trim();
    if (!raw) return;
    const filename = raw.toLowerCase().replace(/\.md$/i, "").replace(/[^a-z0-9_\-]+/g, "_").replace(/^_+|_+$/g, "") + ".md";
    if (filename === ".md") { setCreateError("Enter a valid document name"); return; }
    const title = raw.replace(/\.md$/i, "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const res = await fetch(`/api/projects/${id}/fsd`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, filename }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setCreateError(data.error || `Failed to create ${filename}`);
      return;
    }
    const session = await res.json();
    setSessions((p) => [session, ...p]);
    setActiveId(session.id);
    setDraftContent(session.fsdContent ?? "");
    setCreateOpen(false);
    setCreateName("");
    setCreateError("");
    void loadFsdFiles();
  }, [id, createName, loadFsdFiles]);

  const openCreate = useCallback(() => { setCreateError(""); setCreateName(""); setCreateOpen(true); }, []);

  const openMenu = useCallback((e: React.MouseEvent, target: { kind: "file"; file: any } | { kind: "dir"; dir: string }) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, target });
  }, []);

  const handleFileRename = useCallback(async (path: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === path.split("/").pop()) return;
    try {
      const res = await fetch("/api/files/rename", {
        cache: "no-store",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, path, newName: trimmed }),
      });
      if (res.ok && (await res.json()).renamed) {
        void loadFsdFiles();
        void loadSessions();
      }
    } catch {}
  }, [id, loadFsdFiles, loadSessions]);

  const handleFileDelete = useCallback(async (path: string, name: string) => {
    setFileDeleteTarget({ path, name });
  }, []);

  const confirmFileDelete = useCallback(async () => {
    if (!fileDeleteTarget) return;
    const { path, name } = fileDeleteTarget;
    // If a session owns this markdown file, delete via the session endpoint
    // (removes file from disk + session row). Otherwise plain file delete.
    const session = sessions.find((s) => s.markdownPath === path || s.sourceFilePath === path);
    if (session) {
      await fetch(`/api/projects/${id}/fsd/${session.id}`, { method: "DELETE" });
      setSessions((p) => p.filter((s) => s.id !== session.id));
      if (activeId === session.id) setActiveId(null);
    } else {
      await fetch(`/api/files/delete?projectId=${id}&path=${encodeURIComponent(path)}`, { method: "DELETE" });
    }
    void loadFsdFiles();
    setFileDeleteTarget(null);
    void loadSessions();
  }, [fileDeleteTarget, sessions, id, activeId, loadFsdFiles, loadSessions]);

  const handleFileCopy = useCallback((file: any) => setClipboard({ path: file.path, name: file.name }), []);

  const handleFilePaste = useCallback(async (targetDir: string) => {
    if (!clipboard) return;
    const sameDir = clipboard.path.startsWith(targetDir.replace(/\/$/, "") + "/");
    try {
      const res = await fetch(`/api/files/${sameDir ? "copy" : "move"}`, {
        cache: "no-store",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, source: clipboard.path, destination: targetDir }),
      });
      if (res.ok) setClipboard(null);
    } catch {}
    void loadFsdFiles();
    void loadSessions();
  }, [clipboard, id, loadFsdFiles, loadSessions]);

  const menuItems: ContextMenuItem[] = ctxMenu ? (() => {
    const t = ctxMenu.target;
    const items: ContextMenuItem[] = [];
    if (t.kind === "file") {
      items.push({ label: "Rename", icon: <PencilSimple size={12} />, onClick: () => fileTreeRef.current?.requestRename(t.file.path) });
      items.push({ label: "Delete", icon: <Trash size={12} />, danger: true, onClick: () => handleFileDelete(t.file.path, t.file.name) });
      items.push({ label: "Copy", icon: <CopySimple size={12} />, onClick: () => handleFileCopy(t.file) });
    }
    const pasteDir = t.kind === "file" ? t.file.path.slice(0, t.file.path.lastIndexOf("/") + 1) : t.dir;
    items.push({ label: "Paste", icon: <ClipboardText size={12} />, disabled: !clipboard, onClick: () => handleFilePaste(pasteDir) });
    return items;
  })() : [];

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
    fetch("/api/agent/detect", { cache: "no-store" }).then((r) => r.json()).then((data) => {
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

      {/* New FSD dialog */}
      <DialogRoot open={createOpen} onOpenChange={(open) => { if (!open) setCreateOpen(false); }}>
        <Dialog>
          <div className="p-5">
            <DialogTitle>New FSD document</DialogTitle>
            <DialogDescription>
              Create a Markdown template file in <code className="text-[11px]">input/fsd/</code> with a standard FSD template.
            </DialogDescription>
            <label className="block text-xs text-kumo-subtle mb-1 mt-4">Document name</label>
            <input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="e.g. payment_flow"
              autoFocus
              className="w-full bg-kumo-elevated/30 border border-kumo-line rounded px-3 py-2 text-sm text-kumo-default focus:border-kumo-brand focus:outline-none"
            />
            {createError && <p className="text-xs text-red-400 mt-1.5">{createError}</p>}
            <p className="text-[10px] text-kumo-subtle mt-1">
              Creates <code className="text-kumo-default">input/fsd/{createName.trim() || "…"}.md</code>
            </p>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleCreate} disabled={!createName.trim()}>Create</Button>
            </div>
          </div>
        </Dialog>
      </DialogRoot>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          items={menuItems}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {/* File delete dialog */}
      <DialogRoot open={fileDeleteTarget !== null} onOpenChange={(open) => { if (!open) setFileDeleteTarget(null); }}>
        <Dialog>
          <div className="p-5">
            <DialogTitle>Delete file</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <b>{fileDeleteTarget?.name}</b>? This cannot be undone.
              {fileDeleteTarget && sessions.some((s) => s.markdownPath === fileDeleteTarget.path || s.sourceFilePath === fileDeleteTarget.path) && (
                <span className="block mt-1">Its FSD session will also be removed.</span>
              )}
            </DialogDescription>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" size="sm" onClick={() => setFileDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={confirmFileDelete}>Delete</Button>
            </div>
          </div>
        </Dialog>
      </DialogRoot>

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
      <div className={`flex overflow-hidden transition-[width] duration-300 ease-in-out shrink-0 border-r border-kumo-line bg-kumo-elevated/30 ${explorerCollapsed ? "w-7" : "w-56"}`}>
        <button
          type="button"
          onClick={() => setExplorerCollapsed(false)}
          className={`shrink-0 flex flex-col items-center pt-3 gap-1 overflow-hidden transition-opacity duration-200 cursor-pointer hover:bg-kumo-elevated/50 text-kumo-subtle hover:text-kumo-default ${explorerCollapsed ? "w-7 opacity-100" : "w-0 opacity-0"}`}
          title="Show FSD files"
        >
          <CaretRight size={12} />
          <span className="text-[9px] -rotate-90 whitespace-nowrap text-kumo-subtle mt-1 select-none">FSD</span>
        </button>
        <div className={`flex flex-col flex-1 min-w-0 transition-opacity duration-200 ${explorerCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"}`} aria-hidden={explorerCollapsed}>
        <div className="px-3 py-2 border-b border-kumo-line shrink-0 space-y-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-kumo-subtle uppercase tracking-wider flex-1">Documents</span>
            <button
              type="button"
              onClick={() => setExplorerCollapsed(true)}
              className="text-kumo-subtle hover:text-kumo-default p-0.5 shrink-0"
              title="Hide file explorer"
            >
              <CaretLeft size={12} />
            </button>
          </div>
          <button onClick={openCreate}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-kumo-brand rounded hover:opacity-90 transition-opacity">
            <Plus size={12} />
            New FSD
          </button>
          <button onClick={() => setUploadOpen(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded border border-kumo-line text-kumo-subtle hover:text-kumo-default transition-colors">
            <UploadSimple size={12} />
            Upload document
          </button>
          <button onClick={handleScan} disabled={scanning}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-1 text-[11px] rounded border border-kumo-line text-kumo-subtle hover:text-kumo-default transition-colors disabled:opacity-50">
            <Scan size={11} className={scanning ? "animate-spin" : ""} />
            {scanning ? "Scanning…" : "Rescan files"}
          </button>
        </div>
        <FileTree
          ref={fileTreeRef}
          files={fsdFiles}
          rootDir="input/fsd"
          activePath={activeSession?.markdownPath ?? activeSession?.fsdInputPath ? `input/fsd/${activeSession.fsdInputPath}` : undefined}
          emptyText="No FSD documents — click 'New FSD' or 'Upload document' to start"
          isDisabled={(f) => !f.path.endsWith(".md")}
          onFileClick={(f) => {
            // Select the session that owns this markdown file
            const session = sessions.find((s) => s.markdownPath === f.path);
            if (session) setActiveId(session.id);
          }}
          onFileContextMenu={(e, file) => openMenu(e, { kind: "file", file })}
          onDirContextMenu={(e, dir) => openMenu(e, { kind: "dir", dir })}
          onRename={handleFileRename}
        />
        </div>
      </div>
        <div className="flex-1 flex flex-col min-w-0 gap-3">
          <div className="flex-1 rounded-lg border border-kumo-line overflow-hidden flex bg-kumo-elevated">
            {activeSession ? (
              <>
                <div className="flex-1 flex flex-col min-w-0">
                  {/* Session header — single nav: mode + status + actions */}
                  <div className="flex items-center gap-2 px-3 py-1.5 border-b border-kumo-line shrink-0 bg-kumo-elevated/30 flex-wrap">
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
                    <div className="flex items-center gap-0.5">
                      <AppButton variant="chip" size="xs" active={editorMode === "edit"} onClick={() => setEditorMode("edit")} icon={<PencilSimple size={11} />} className="px-2" title="Edit" />
                      <AppButton variant="chip" size="xs" active={editorMode === "split"} onClick={() => setEditorMode("split")} icon={<Columns size={11} />} className="px-2" title="Split view" />
                      <AppButton variant="chip" size="xs" active={editorMode === "preview"} onClick={() => setEditorMode("preview")} icon={<Eye size={11} />} className="px-2" title="Preview" />
                    </div>
                    <div className="w-px h-4 bg-kumo-line mx-1" />
                    {dirty ? (
                      <span className="flex items-center gap-1 text-[10px] text-amber-400/80">
                        <XCircle size={10} /> Unsaved
                      </span>
                    ) : saving ? (
                      <span className="flex items-center gap-1 text-[10px] text-kumo-subtle">
                        <CheckCircle size={10} className="animate-pulse" /> Saving…
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] text-green-400/70">
                        <Check size={10} /> Saved
                      </span>
                    )}
                    <button
                      onClick={() => handleSave()}
                      disabled={saving || !dirty}
                      className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border transition-colors disabled:opacity-40 ${
                        dirty ? "liquid-wash border-transparent" : "border-kumo-line text-kumo-subtle"
                      }`}
                      title="Save (Cmd/Ctrl+S)"
                    >
                      <FloppyDisk size={11} /> Save
                    </button>
                    {(activeSession.conversionStatus === "pending" || activeSession.conversionStatus === "failed") && (
                      <button
                        onClick={handleConvert}
                        className="flex items-center gap-1 px-2 py-1 text-[10px] rounded border border-kumo-line text-kumo-subtle hover:text-kumo-default transition-colors"
                        title="Convert the uploaded file to Markdown with the markitdown skill (background)"
                      >
                        <MagnifyingGlass size={11} />
                        Convert
                      </button>
                    )}
                    <button onClick={() => requestDelete(activeSession)}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-400/70 hover:text-red-400 border border-red-400/20 rounded transition-colors">
                      <Trash size={11} /> Delete
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
                    mode={editorMode}
                    onChange={(v) => { setDraftContent(v); setDirty(true); }}
                    onSave={() => handleSave()}
                    projectId={id}
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
