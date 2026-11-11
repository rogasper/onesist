import { useEffect, useState } from "react";
import { Dialog, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { DownloadSimple } from "@phosphor-icons/react";
import { AppButton } from "~/components/ui/AppButton";
import { InlineAlert } from "~/components/ui/InlineAlert";
import {
  EXPORT_TIMEOUT_MS,
  downloadFilename,
  formatBytes,
  reportDownloadFailure,
  saveBlob,
} from "~/lib/download";
import { subscribe } from "~/lib/event-stream";

interface ExportProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: { id: string; name: string } | null;
}

interface ExportProgress {
  bytesDone: number;
  bytesTotal: number;
  filesDone: number;
  filesTotal: number;
}

export function ExportProjectDialog({ open, onOpenChange, project }: ExportProjectDialogProps) {
  const [includeChat, setIncludeChat] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<ExportProgress | null>(null);

  useEffect(() => {
    if (!open) return;
    setIncludeChat(false);
    setExporting(false);
    setError("");
    setProgress(null);
  }, [open]);

  const submit = async () => {
    if (!project) return;
    setExporting(true);
    setError("");
    setProgress(null);
    // The server reports source bytes read over the shared SSE stream; this id
    // keeps the events of another window's export out of this dialog.
    const progressId = crypto.randomUUID();
    const unsubscribe = subscribe("export:progress", (data) => {
      if (!data || data.progressId !== progressId) return;
      setProgress({
        bytesDone: Number(data.bytesDone) || 0,
        bytesTotal: Number(data.bytesTotal) || 0,
        filesDone: Number(data.filesDone) || 0,
        filesTotal: Number(data.filesTotal) || 0,
      });
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS);
    try {
      const params = new URLSearchParams();
      if (includeChat) params.set("includeChat", "1");
      params.set("progressId", progressId);
      const res = await fetch(`/api/projects/${project.id}/export?${params}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || `Export gagal (HTTP ${res.status})`);
      }
      // Totals arrive as headers, so the bar is meaningful even if the first
      // SSE events were missed while the stream was still opening.
      setProgress((current) =>
        current ?? {
          bytesDone: 0,
          bytesTotal: Number(res.headers.get("X-Export-Bytes-Total")) || 0,
          filesDone: 0,
          filesTotal: Number(res.headers.get("X-Export-Files-Total")) || 0,
        },
      );
      const blob = await res.blob();
      saveBlob(blob, downloadFilename(res, `${project.name}.zip`));
      onOpenChange(false);
    } catch (e) {
      setError(reportDownloadFailure("export-project", e));
    } finally {
      clearTimeout(timer);
      unsubscribe();
      setExporting(false);
    }
  };

  const percent =
    progress && progress.bytesTotal > 0
      ? Math.min(100, Math.round((progress.bytesDone / progress.bytesTotal) * 100))
      : 0;

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

          {exporting && progress && progress.bytesTotal > 0 ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] text-kumo-subtle">
                <span>
                  {progress.filesDone} / {progress.filesTotal} berkas
                </span>
                <span className="font-mono">
                  {formatBytes(progress.bytesDone)} / {formatBytes(progress.bytesTotal)}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-kumo-elevated overflow-hidden">
                <div
                  className="h-full rounded-full bg-kumo-brand transition-[width] duration-150"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
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
