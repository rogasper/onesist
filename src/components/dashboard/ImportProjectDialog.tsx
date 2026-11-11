import { useState } from "react";
import { Dialog, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { FolderOpen, UploadSimple } from "@phosphor-icons/react";
import { AppButton } from "~/components/ui/AppButton";
import { InlineAlert } from "~/components/ui/InlineAlert";
import { isDesktopShell } from "~/lib/run-notification";

interface ImportProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (projectId: string) => void;
}

export function ImportProjectDialog({ open, onOpenChange, onImported }: ImportProjectDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [destPath, setDestPath] = useState("");
  const [browsing, setBrowsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setFile(null);
    setDestPath("");
    setBrowsing(false);
    setImporting(false);
    setError("");
  };

  const chooseFolder = async () => {
    setBrowsing(true);
    setError("");
    try {
      if (isDesktopShell()) {
        const { invoke } = await import("@tauri-apps/api/core");
        const picked = await invoke<string | null>("pick_folder");
        if (picked) setDestPath(picked);
      } else {
        const res = await fetch("/api/helpers/choose-folder", { method: "POST", cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (data.error) throw new Error(data.error);
        if (data.path) setDestPath(data.path);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuka folder picker");
    } finally {
      setBrowsing(false);
    }
  };

  const submit = async () => {
    if (!file || !destPath.trim()) return;
    setImporting(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("destPath", destPath.trim());
      const res = await fetch("/api/projects/import", { method: "POST", body: form, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A body over Bun's request limit is rejected before the route runs: an
        // empty 413 with no JSON, which used to surface as a bare "Import gagal".
        const message =
          (data as { error?: string }).error ||
          (res.status === 413
            ? "ZIP terlalu besar untuk diunggah ke server lokal ini. Batas export/import 500 MB."
            : `Import gagal (HTTP ${res.status})`);
        throw new Error(message);
      }
      reset();
      onOpenChange(false);
      onImported(data.projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import gagal");
      setImporting(false);
    }
  };

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (importing) return;
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <Dialog>
        <div className="p-5">
          <DialogTitle>Import Project</DialogTitle>
          <p className="mt-2 text-xs text-kumo-subtle">
            Pilih ZIP hasil export Onesist. File project, task, wiki, FSD, ERD, API spec, dan RTM dipulihkan sebagai project baru.
          </p>

          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-xs text-kumo-subtle mb-1.5">File ZIP</label>
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-xs text-kumo-default file:mr-3 file:rounded file:border-0 file:bg-kumo-elevated file:px-3 file:py-1.5 file:text-xs file:text-kumo-default hover:file:bg-kumo-elevated/80"
              />
              {file ? (
                <p className="mt-1 text-[11px] text-kumo-subtle">
                  {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
                </p>
              ) : null}
            </div>

            <div>
              <label className="block text-xs text-kumo-subtle mb-1.5">Folder tujuan</label>
              <div className="flex gap-2">
                <input
                  value={destPath}
                  onChange={(e) => setDestPath(e.target.value)}
                  placeholder="Folder kosong untuk project baru"
                  className="flex-1 bg-kumo-elevated/30 border border-kumo-line rounded px-3 py-2 text-xs text-kumo-default focus:border-kumo-brand focus:outline-none"
                />
                <button
                  type="button"
                  onClick={chooseFolder}
                  disabled={browsing || importing}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs rounded bg-kumo-elevated border border-kumo-line text-kumo-default hover:bg-kumo-elevated/80 transition-colors disabled:opacity-50 shrink-0"
                >
                  <FolderOpen size={12} />
                  {browsing ? "…" : "Pilih"}
                </button>
              </div>
              <p className="mt-1 text-[10px] text-kumo-subtle">
                Folder harus kosong atau belum ada. node_modules, .git, build/cache, .env, dan database lokal tidak ikut di ZIP.
              </p>
            </div>

            {error ? <InlineAlert kind="error">{error}</InlineAlert> : null}
          </div>

          <div className="mt-5 flex items-center justify-end gap-2">
            <AppButton
              variant="secondary"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={importing}
            >
              Batal
            </AppButton>
            <AppButton
              variant="primary"
              onClick={() => void submit()}
              disabled={!file || !destPath.trim() || importing}
              icon={<UploadSimple size={14} />}
            >
              {importing ? "Mengimpor…" : "Import"}
            </AppButton>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
