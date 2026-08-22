import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogRoot, DialogTitle, Input } from "@cloudflare/kumo";
import { MagnifyingGlass, Shapes } from "@phosphor-icons/react";
import { loadManifest } from "~/lib/arch-icons/registry";
import type { IconShape } from "~/lib/arch-icons/types";

interface IconPickerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (shape: IconShape) => void;
}

export function IconPicker({ open, onOpenChange, onSelect }: IconPickerProps) {
  const [query, setQuery] = useState("");
  const [allShapes, setAllShapes] = useState<IconShape[]>([]);
  const [loading, setLoading] = useState(false);
  const [packs, setPacks] = useState<string[]>([]);
  const [activePack, setActivePack] = useState<string>("all");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadManifest()
      .then((m) => {
        setPacks(Object.keys(m.packs));
        setAllShapes(m.shapes);
      })
      .finally(() => setLoading(false));
  }, [open]);

  const shapes = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = allShapes;
    if (activePack !== "all") filtered = filtered.filter((s) => s.pack === activePack);
    if (!q) return filtered.slice(0, 80);
    const scored = filtered
      .map((s) => {
        const hay = `${s.label} ${s.category} ${s.pack} ${s.keywords.join(" ")}`.toLowerCase();
        let score = 0;
        if (s.label.toLowerCase().includes(q)) score += 10;
        if (s.category.toLowerCase().includes(q)) score += 5;
        if (hay.includes(q)) score += 1;
        return { s, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 80)
      .map((x) => x.s);
    return scored;
  }, [query, activePack, allShapes]);

  const totalHint = useMemo(() => (query ? `${shapes.length} results` : `${allShapes.filter(s=> activePack==="all" || s.pack===activePack).length} icons (showing ${shapes.length})`), [shapes.length, query, allShapes, activePack]);

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <Dialog className="max-w-3xl">
      <div className="p-5 text-kumo-default max-h-[80vh] flex flex-col">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-lg bg-kumo-brand/10 text-kumo-brand">
            <Shapes size={18} />
          </div>
          <div>
            <DialogTitle className="text-base font-semibold">Icon Library</DialogTitle>
            <p className="text-xs text-kumo-subtle">AWS · Azure · CNCF · Developer — searchable via manifest. Insert as SVG image.</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 relative">
            <MagnifyingGlass size={14} className="absolute left-2.5 top-2.5 text-kumo-subtle" />
            <Input
              placeholder="Search e.g. postgres, redis, kafka, ec2, s3..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5 mb-3 overflow-x-auto">
          <button
            onClick={() => setActivePack("all")}
            className={`px-2.5 py-1 rounded-full text-xs border ${activePack === "all" ? "bg-kumo-brand text-white border-kumo-brand" : "bg-kumo-elevated text-kumo-subtle border-kumo-line"}`}
          >
            All
          </button>
          {packs.map((p) => (
            <button
              key={p}
              onClick={() => setActivePack(p)}
              className={`px-2.5 py-1 rounded-full text-xs border capitalize ${activePack === p ? "bg-kumo-brand text-white border-kumo-brand" : "bg-kumo-elevated text-kumo-subtle border-kumo-line"}`}
            >
              {p} 
            </button>
          ))}
          <span className="text-[11px] text-kumo-subtle ml-2">{totalHint}</span>
        </div>

        <div className="flex-1 overflow-auto rounded-lg border border-kumo-line bg-kumo-base p-2">
          {loading ? (
            <div className="grid grid-cols-6 gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-20 rounded bg-kumo-elevated animate-pulse" />
              ))}
            </div>
          ) : shapes.length === 0 ? (
            <div className="py-12 text-center text-sm text-kumo-subtle">No icons. Try another keyword.</div>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {shapes.map((s) => (
                <button
                  key={s.id}
                  onClick={() => onSelect(s)}
                  className="flex flex-col items-center gap-1 p-2 rounded-lg border border-kumo-line bg-kumo-elevated hover:border-kumo-brand/40 hover:bg-kumo-brand/5 transition-colors"
                  title={`${s.label} — ${s.pack}/${s.category}`}
                >
                  <img src={`/icons/${s.file}`} alt={s.label} className="w-10 h-10 object-contain" loading="lazy" />
                  <span className="text-[11px] font-medium text-kumo-default truncate w-full text-center">{s.label}</span>
                  <span className="text-[10px] text-kumo-subtle truncate w-full text-center">{s.pack}/{s.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        </div>
      </Dialog>
    </DialogRoot>
  );
}
