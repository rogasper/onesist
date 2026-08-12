import { useEffect, useState } from "react";
import { Button, Dialog, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { Folder, FolderOpen, ArrowUp } from "@phosphor-icons/react";

interface FolderBrowserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (path: string) => void;
}

/** Web folder browser (Windows) — server lists directories, no native dialog. */
export function FolderBrowserDialog({ open, onOpenChange, onSelect }: FolderBrowserDialogProps) {
  const [dirPath, setDirPath] = useState("");
  const [dirParent, setDirParent] = useState<string | null>(null);
  const [dirRoots, setDirRoots] = useState<{ name: string; path: string }[]>([]);
  const [dirEntries, setDirEntries] = useState<{ name: string; path: string }[]>([]);
  const [dirLoading, setDirLoading] = useState(false);
  const [dirError, setDirError] = useState("");

  const loadDirs = async (p: string) => {
    setDirLoading(true);
    setDirError("");
    try {
      const res = await fetch("/api/helpers/list-dirs", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
      const data = await res.json();
      if (!res.ok) { setDirError(data.error || "Failed to list folders"); return; }
      setDirPath(data.path ?? "");
      setDirParent(data.parent ?? null);
      setDirRoots(data.roots ?? []);
      setDirEntries(data.entries ?? []);
    } catch (e: any) {
      setDirError(e?.message || "Failed to list folders");
    } finally {
      setDirLoading(false);
    }
  };

  useEffect(() => {
    if (open) loadDirs("");
  }, [open]);

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <Dialog>
        <div className="p-5 w-[480px] max-w-full">
          <DialogTitle>Select Project Folder</DialogTitle>
          <div className="mt-3 flex items-center gap-2">
            <span
              className="flex-1 text-[11px] font-mono text-kumo-subtle truncate px-2 py-1.5 border border-kumo-line rounded bg-kumo-elevated/30"
              title={dirPath}
            >
              {dirPath || "Pilih drive / folder"}
            </span>
            <button
              onClick={() => dirParent && loadDirs(dirParent)}
              disabled={!dirParent || dirLoading}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded bg-kumo-elevated border border-kumo-line text-kumo-default hover:bg-kumo-elevated/80 transition-colors disabled:opacity-40 shrink-0"
            >
              <ArrowUp size={12} />
              Up
            </button>
          </div>
          <div className="mt-3 max-h-72 overflow-y-auto border border-kumo-line rounded bg-kumo-elevated/20">
            {dirLoading ? (
              <div className="p-4 text-xs text-kumo-subtle">Loading folders…</div>
            ) : dirError ? (
              <div className="p-4 text-xs text-red-400">{dirError}</div>
            ) : (
              <div>
                {dirRoots.map((r) => (
                  <button
                    key={r.path}
                    onClick={() => loadDirs(r.path)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-kumo-default hover:bg-kumo-brand/10 transition-colors text-left"
                  >
                    <FolderOpen size={13} className="text-kumo-brand shrink-0" />
                    <span className="font-medium">{r.name}</span>
                  </button>
                ))}
                {dirEntries.map((e) => (
                  <button
                    key={e.path}
                    onClick={() => loadDirs(e.path)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-kumo-default hover:bg-kumo-brand/10 transition-colors text-left"
                  >
                    <Folder size={13} className="text-kumo-subtle shrink-0" />
                    <span className="truncate">{e.name}</span>
                  </button>
                ))}
                {dirRoots.length === 0 && dirEntries.length === 0 && (
                  <div className="p-4 text-xs text-kumo-subtle">Tidak ada subfolder</div>
                )}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!dirPath}
              onClick={() => { if (dirPath) onSelect(dirPath); }}
            >
              Select This Folder
            </Button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
