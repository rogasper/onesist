import { useEffect, useState } from "react";
import { Button, Dialog, DialogDescription, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { MagnifyingGlass, Check } from "@phosphor-icons/react";

interface ModelPickerDialogProps {
  open: boolean;
  agentName?: string;
  onClose: () => void;
  onRun: (model: string | undefined) => void;
  running?: boolean;
}

// Agents whose CLI exposes a selectable model list (`<cli> models`).
const MODEL_LIST_AGENTS = new Set(["opencode", "antigravity"]);

/** Popup before an agent run: pick the model (opencode `opencode models`,
 *  antigravity `agy models`); claude/codex have no model list — just run with
 *  default. */
export function ModelPickerDialog({ open, agentName, onClose, onRun, running }: ModelPickerDialogProps) {
  const [agent, setAgent] = useState(agentName ?? "opencode");
  const [models, setModels] = useState<string[]>([]);
  const [supported, setSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelected("");
    setQ("");
    setLoading(true);
    // Resolve the actual CLI (mirrors what the run endpoint uses).
    fetch("/api/agent/detect", { cache: "no-store" })
      .then((r) => r.json())
      .then((agents) => {
        const found = (agents ?? []).find((a: any) => a.found);
        if (found) setAgent(found.name);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSelected("");
    if (!MODEL_LIST_AGENTS.has(agent)) {
      setModels([]);
      setSupported(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/agent/models?agent=${encodeURIComponent(agent)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setModels(Array.isArray(d.models) ? d.models : []);
        setSupported(!!d.supported);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, agent]);

  const run = () => {
    onRun(selected || undefined);
  };

  const query = q.trim().toLowerCase();
  const filtered = models.filter((m) => m.toLowerCase().includes(query));

  return (
    <DialogRoot open={open} onOpenChange={(o) => { if (!o && !running) onClose(); }}>
      <Dialog>
        <div className="p-5 w-[460px] max-w-full">
          <DialogTitle>Jalankan agent ({agent})</DialogTitle>
          <DialogDescription className="sr-only">Pilih model sebelum run</DialogDescription>

          <div className="mt-4">
            {loading ? (
              <div className="flex items-center gap-2 text-[11px] text-kumo-subtle px-1 py-2">
                <span className="w-2.5 h-2.5 border-2 border-kumo-subtle border-t-transparent rounded-full animate-spin" />
                Memuat daftar model…
              </div>
            ) : supported ? (
              <>
                <div className="flex items-center gap-1.5 px-1 pb-1.5">
                  <MagnifyingGlass size={11} className="text-kumo-subtle shrink-0" />
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Cari model…"
                    className="w-full bg-kumo-recessed/60 border border-kumo-line rounded px-2 py-1.5 text-[11px] text-kumo-default placeholder:text-kumo-subtle focus:border-kumo-brand focus:outline-none"
                  />
                </div>
                <div className="overflow-y-auto max-h-52 flex-1 min-h-0 border border-kumo-line/50 rounded-lg p-1">
                  {filtered.length === 0 ? (
                    <div className="px-2 py-2 text-[11px] text-kumo-subtle">Tidak ada hasil untuk "{q}"</div>
                  ) : (
                    filtered.map((m) => (
                      <button
                        key={m}
                        onClick={() => setSelected(m === selected ? "" : m)}
                        className={`w-full flex items-center gap-1.5 px-2 py-1.5 text-left text-[11px] rounded hover:bg-kumo-tint transition-colors ${m === selected ? "text-kumo-brand font-medium" : "text-kumo-default"}`}
                      >
                        <span className="truncate font-mono">{m}</span>
                        {m === selected && <Check size={11} className="ml-auto shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="text-[11px] text-kumo-subtle">
                {MODEL_LIST_AGENTS.has(agent)
                  ? "Gagal mengambil daftar model."
                  : `Agent ${agent} tidak menyediakan daftar model — akan pakai model default.`}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 mt-6">
            <span className="text-[10px] text-kumo-subtle truncate">{selected || "Model default"}</span>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={onClose} disabled={running}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={run} disabled={running}>
                {running ? "Running…" : "Run"}
              </Button>
            </div>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
