import { useEffect, useState } from "react";
import { Dialog, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { DownloadSimple } from "@phosphor-icons/react";
import { AppButton } from "~/components/ui/AppButton";
import { InlineAlert } from "~/components/ui/InlineAlert";
import { EXPORT_TIMEOUT_MS, downloadFilename, reportDownloadFailure, saveBlob } from "~/lib/download";

interface ExportProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: { id: string; name: string } | null;
}

export function ExportProjectDialog({ open, onOpenChange, project }: ExportProjectDialogProps) {
  const [includeChat, setIncludeChat] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setIncludeChat(false);
    setExporting(false);
    setError("");
  }, [open]);

  const submit = async () => {
    if (!project) return;
    setExporting(true);
    setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS);
    try {
      const query = includeChat ? "?includeChat=1" : "";
      const res = await fetch(`/api/projects/${project.id}/export${query}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `Export gagal (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      saveBlob(blob, downloadFilename(res, `${project.name}.zip`));
      onOpenChange(false);
    } catch (e) {
      setError(reportDownloadFailure("export-project", e));
    } finally {
      clearTimeout(timer);
      setExporting(false);
    }
  };

  return (
    <DialogRoot
      open={open}
      onOpenChange={(next) => {
        if (exporting) return;
        onOpenChange(next);
      }}
    >
      <Dialog>
        <div className="p-5">
          <DialogTitle>Export Project</DialogTitle>
          <p className="mt-2 text-xs text-kumo-subtle">
            ZIP berisi file project, task, wiki, FSD, ERD, API spec, RTM, dan pengaturan eksekusi.
            node_modules, .git, build/cache, .env, dan database lokal tidak ikut.
          </p>

          <label className="mt-4 flex items-start gap-2.5 p-3 rounded border border-kumo-line bg-kumo-elevated/30 cursor-pointer">
            <input
              type="checkbox"
              checked={includeChat}
              onChange={(e) => setIncludeChat(e.target.checked)}
              disabled={exporting}
              className="mt-0.5 accent-kumo-brand"
            />
            <span>
              <span className="block text-xs text-kumo-default">Sertakan riwayat chat (ringkas)</span>
              <span className="mt-0.5 block text-[11px] text-kumo-subtle">
                Hanya pesan dan jawaban akhir. Tool call, reasoning, gambar, diff file, dan sesi CLI
                tidak ikut; attachment tetap ikut sebagai file di folder project.
              </span>
            </span>
          </label>

          {includeChat ? (
            <InlineAlert kind="warning" className="mt-3">
              Chat bisa memuat kode, path, dan data internal project. ZIP tidak dienkripsi, jadi
              bagikan hanya ke tujuan yang dipercaya.
            </InlineAlert>
          ) : null}

          {error ? <InlineAlert kind="error" className="mt-3">{error}</InlineAlert> : null}

          <div className="mt-5 flex items-center justify-end gap-2">
            <AppButton variant="secondary" onClick={() => onOpenChange(false)} disabled={exporting}>
              Batal
            </AppButton>
            <AppButton
              variant="primary"
              onClick={() => void submit()}
              disabled={exporting}
              icon={<DownloadSimple size={14} />}
            >
              {exporting ? "Mengekspor…" : "Export"}
            </AppButton>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
