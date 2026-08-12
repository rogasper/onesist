import { Button, Dialog, DialogDescription, DialogRoot, DialogTitle } from "@cloudflare/kumo";

interface FileCount {
  brs: { total: number; new: number; update: number };
  frs: { total: number; new: number; update: number };
  designs: { total: number; new: number; update: number };
  tests: { total: number; new: number; update: number };
}

export interface ImportPreview {
  files: { file: string; brs: FileCount["brs"]; frs: FileCount["frs"]; designs: FileCount["designs"]; tests: FileCount["tests"] }[];
  totals: {
    brs: number;
    frs: number;
    designs: number;
    tests: number;
    unresolvedBr: number;
  };
}

interface ImportPreviewDialogProps {
  preview: ImportPreview | null;
  onClose: () => void;
  onApply: () => void;
  applying: boolean;
}

export function ImportPreviewDialog({ preview, onClose, onApply, applying }: ImportPreviewDialogProps) {
  return (
    <DialogRoot open={preview !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog>
        <div className="p-5 w-[560px] max-w-full">
          <DialogTitle>Import RTM dari output/rtm/</DialogTitle>
          <DialogDescription className="sr-only">Preview hasil parsing</DialogDescription>

          {!preview ? (
            <div className="text-xs text-kumo-subtle mt-4">Loading preview…</div>
          ) : preview.files.length === 0 ? (
            <div className="text-xs text-kumo-subtle mt-4">
              Tidak ada file markdown di <code className="text-kumo-default">output/rtm/</code>. Jalankan agent ("Agent bantu") dulu untuk membuat RTM.
            </div>
          ) : (
            <div className="mt-4 space-y-3 max-h-[40vh] overflow-y-auto">
              {preview.totals.unresolvedBr > 0 && (
                <div className="text-[11px] px-2.5 py-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  ⚠ {preview.totals.unresolvedBr} functional requirement merujuk BR yang tidak terdefinisi — FR akan masuk grup "Belum dipecah".
                </div>
              )}
              {preview.files.map((f) => (
                <div key={f.file} className="text-[11px] border border-kumo-line rounded-lg p-2.5">
                  <div className="font-mono text-kumo-default mb-1.5 truncate">{f.file}</div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <CountCell label="BR" c={f.brs} />
                    <CountCell label="FR" c={f.frs} />
                    <CountCell label="Design" c={f.designs} />
                    <CountCell label="Test" c={f.tests} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              size="sm"
              onClick={onApply}
              disabled={applying || !preview || preview.files.length === 0}
            >
              {applying ? "Mengimport…" : "Apply import"}
            </Button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}

function CountCell({ label, c }: { label: string; c: FileCount["brs"] }) {
  return (
    <div className="rounded bg-kumo-elevated/60 px-1 py-1">
      <div className="text-[10px] text-kumo-subtle uppercase tracking-wide">{label}</div>
      <div className="text-xs text-kumo-default font-medium mt-0.5">
        {c.total}
        <span className="text-green-400/80"> +{c.new}</span>
        <span className="text-kumo-subtle"> · {c.update}</span>
      </div>
    </div>
  );
}
