import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Badge, Button, Dialog, DialogDescription, DialogRoot, DialogTitle, Input } from "@cloudflare/kumo";
import { Cube, PaintBrushBroad, Plus, Trash, Sparkle, GitBranch } from "@phosphor-icons/react";
import { ExcalidrawCanvas } from "~/components/canvas/ExcalidrawCanvas";
import { EmptyState } from "~/components/ui/EmptyState";
import { ListSkeleton } from "~/components/ui/Skeleton";
import { PageHeader } from "~/components/ui/PageHeader";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { useFileList, useFileContent, useFileWatch } from "~/lib/use-file-data";
import { AppButton } from "~/components/ui/AppButton";

export const Route = createFileRoute("/projects/$id/canvas")({
  component: CanvasPage,
});

function CanvasPage() {
  const { id } = Route.useParams();
  const { files, loading: filesLoading, refresh: refreshFileList } = useFileList("output/sketches", id);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = useState<{ path: string; text: string } | null>(null);
  const [contentLoading, setContentLoading] = useState(false);

  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [newFileName, setNewFileName] = useState("");
  const [newFileTemplate, setNewFileTemplate] = useState<"blank" | "flowchart" | "mobile" | "web">("blank");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Filter out hidden files / dotfiles (.gitkeep, etc)
  const sketchFiles = (files || []).filter(
    (f) =>
      !f.name.startsWith(".") &&
      (f.ext === ".json" || f.ext === ".excalidraw" || f.name.includes(".excalidraw."))
  );

  // Fetch content strictly for the selected file
  const fetchActiveContent = useCallback(async (filePath: string) => {
    setContentLoading(true);
    try {
      const res = await fetch(
        `/api/files/read?path=${encodeURIComponent(filePath)}&projectId=${encodeURIComponent(id)}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const d = await res.json();
        setActiveFileContent({ path: filePath, text: d.content ?? "" });
      }
    } catch (err) {
      console.error("Failed to read sketch file:", err);
    } finally {
      setContentLoading(false);
    }
  }, [id]);

  // When selectedFile changes, clear old content immediately and fetch new file
  useEffect(() => {
    if (!selectedFile) {
      setActiveFileContent(null);
      return;
    }
    setActiveFileContent(null);
    fetchActiveContent(selectedFile);
  }, [selectedFile, fetchActiveContent]);

  // Auto-select first file if available
  useEffect(() => {
    if (sketchFiles.length > 0 && (!selectedFile || !sketchFiles.some((f) => f.path === selectedFile))) {
      setSelectedFile(sketchFiles[0].path);
    }
  }, [sketchFiles, selectedFile]);

  // Live file watch
  useFileWatch("sketch", (path) => {
    refreshFileList();
    if (path === selectedFile) {
      fetchActiveContent(selectedFile);
    }
  });

  // Handle Save
  const handleSave = useCallback(
    async (content: string): Promise<boolean> => {
      if (!selectedFile) return false;
      try {
        const res = await fetch("/api/files/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: id,
            path: selectedFile,
            content,
          }),
        });
        if (res.ok) {
          setActiveFileContent({ path: selectedFile, text: content });
          return true;
        }
      } catch (e) {
        console.error("Save failed:", e);
      }
      return false;
    },
    [selectedFile, id]
  );

  // Handle Create New Sketch
  const handleCreateSketch = async () => {
    if (!newFileName.trim()) return;
    const sanitized = newFileName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const targetPath = `output/sketches/${sanitized}.excalidraw.json`;

    let initialJson = JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "https://onesist.internal",
      elements: [],
      appState: { viewBackgroundColor: "#ffffff", currentItemFontFamily: 1 },
      files: {},
    }, null, 2);

    try {
      const res = await fetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          path: targetPath,
          content: initialJson,
        }),
      });

      if (res.ok) {
        setIsNewDialogOpen(false);
        setNewFileName("");
        refreshFileList();
        setSelectedFile(targetPath);
      }
    } catch (e) {
      console.error("Create sketch failed:", e);
    }
  };

  // Handle Delete Sketch
  const handleDeleteSketch = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(
        `/api/files/delete?projectId=${encodeURIComponent(id)}&path=${encodeURIComponent(deleteTarget)}`,
        { method: "DELETE" }
      );

      if (res.ok) {
        const remaining = files.filter((f) => f.path !== deleteTarget);
        if (selectedFile === deleteTarget) {
          setSelectedFile(remaining[0]?.path ?? null);
        }
        setDeleteTarget(null);
        refreshFileList();
      }
    } catch (e) {
      console.error("Delete sketch failed:", e);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        icon={<Cube size={14} className="text-kumo-brand" />}
        title="Sketch & Wireframe Canvas"
        help="canvas"
        badges={sketchFiles.length > 0 ? <Badge variant="neutral" className="text-[11px]">{sketchFiles.length} sketches</Badge> : undefined}
        actions={
          <div className="flex items-center gap-2 overflow-x-auto min-w-0">
            <AppButton
              variant="secondary"
              size="sm"
              onClick={() => setIsNewDialogOpen(true)}
              icon={<Plus size={12} />}
              className="px-2.5 shrink-0"
            >
              New Sketch
            </AppButton>
            <div className="flex items-center gap-1.5 py-1 px-1 overflow-x-auto min-w-0">
              {sketchFiles.map((f) => {
                const isActive = selectedFile === f.path;
                return (
                  <div
                    key={f.path}
                    className={`flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-md border text-xs transition-colors shrink-0 ${
                      isActive
                        ? "border-kumo-brand/50 bg-kumo-brand/10 text-kumo-default font-medium shadow-sm"
                        : "border-kumo-line bg-kumo-elevated/60 text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedFile(f.path)}
                      className="truncate max-w-[160px] text-left focus:outline-none"
                      title={f.name}
                    >
                      {f.name.replace(/\.(excalidraw\.json|excalidraw|json|mmd)$/, "")}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(f.path);
                      }}
                      title="Delete sketch"
                      className="p-1 rounded text-kumo-subtle hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        }
      />

      {/* Main Area */}
      {filesLoading ? (
        <div className="flex items-center justify-center flex-1">
          <ListSkeleton rows={4} className="w-full max-w-xs px-4" />
        </div>
      ) : sketchFiles.length === 0 || !selectedFile ? (
        <EmptyState
          icon={<PaintBrushBroad size={28} />}
          title="No sketches found"
          description="Create a new sketch or ask the agent terminal to generate a wireframe / flow diagram in output/sketches/."
          action={
            <AppButton
              variant="primary"
              size="sm"
              onClick={() => setIsNewDialogOpen(true)}
              icon={<Plus size={14} />}
            >
              Create First Sketch
            </AppButton>
          }
          className="flex-1"
        />
      ) : !activeFileContent || activeFileContent.path !== selectedFile ? (
        <div className="flex-1 min-h-0 bg-kumo-base overflow-hidden rounded-xl border border-kumo-line flex items-center justify-center">
          <ListSkeleton rows={4} className="w-full max-w-xs px-4" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 bg-kumo-base overflow-hidden rounded-xl border border-kumo-line relative">
          <ExcalidrawCanvas
            key={selectedFile}
            initialContent={activeFileContent.text}
            fileName={selectedFile.split("/").pop() || "sketch.excalidraw.json"}
            projectId={id}
            onSave={handleSave}
          />
        </div>
      )}

      {/* Create New Sketch Dialog */}
      <DialogRoot open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <Dialog className="max-w-md">
          <div className="p-5 text-kumo-default">
            <div className="flex items-center gap-2 mb-1">
              <PaintBrushBroad size={18} className="text-kumo-brand" />
              <DialogTitle className="text-base font-semibold">Create New Sketch</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-kumo-subtle mb-4">
              Add a new Excalidraw canvas sketch for UI wireframing or architecture diagrams.
            </DialogDescription>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-kumo-subtle block mb-1.5 font-medium">Sketch Name</label>
                <Input
                  placeholder="e.g. checkout_wireframe or auth_flow"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreateSketch();
                  }}
                  autoFocus
                />
                <span className="text-[11px] text-kumo-subtle mt-1.5 block">
                  Saved to: <code className="text-kumo-brand">output/sketches/{newFileName.trim() ? newFileName.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "_") : "<name>"}.excalidraw.json</code>
                </span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setIsNewDialogOpen(false)}>
                Cancel
              </Button>
              <AppButton
                variant="primary"
                size="sm"
                onClick={handleCreateSketch}
                disabled={!newFileName.trim()}
              >
                Create Sketch
              </AppButton>
            </div>
          </div>
        </Dialog>
      </DialogRoot>

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete Sketch File"
        onConfirm={handleDeleteSketch}
        confirmLabel="Delete File"
      >
        Are you sure you want to delete <code className="text-kumo-brand">{deleteTarget}</code>? This action cannot be undone.
      </ConfirmDialog>
    </div>
  );
}
