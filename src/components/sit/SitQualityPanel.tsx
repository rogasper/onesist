import { useState } from "react";
import { ShieldCheck, Warning, WarningCircle, Info, CaretDown, CaretRight, Sparkle, MagicWand } from "@phosphor-icons/react";
import type { SitQualityIssue, SitQualitySeverity } from "~/lib/sit-parser";

export interface QualityCounts {
  errors: number;
  warnings: number;
  infos: number;
}

interface SitQualityPanelProps {
  issues: SitQualityIssue[];
  counts: QualityCounts;
  onNormalizeAll: () => void;
  onFixWithAgent: () => void;
  onNormalizeFile: (file: string) => void;
  busy?: boolean;
}

const TYPE_LABELS: Record<SitQualityIssue["type"], string> = {
  "format-not-standard": "Format non-standar (tabel)",
  "empty-tester": "Tester belum diisi",
  "missing-browser-matrix": "Browser matrix kurang",
  "short-expected": "Expected Result pendek",
  "step-without-code": "Step tanpa kode",
  "duplicate-step-code": "Kode step duplikat",
  "summary-mismatch": "Summary tidak sinkron",
};

function severityIcon(sev: SitQualitySeverity) {
  if (sev === "error") return <WarningCircle size={12} weight="fill" className="text-red-400 shrink-0" />;
  if (sev === "warning") return <Warning size={12} weight="fill" className="text-amber-400 shrink-0" />;
  return <Info size={12} className="text-kumo-subtle shrink-0" />;
}

export function SitQualityPanel({ issues, counts, onNormalizeAll, onFixWithAgent, onNormalizeFile, busy }: SitQualityPanelProps) {
  const [open, setOpen] = useState(true);
  const hasIssues = issues.length > 0;
  const issuesByFile = new Map<string, SitQualityIssue[]>();
  for (const i of issues) {
    const list = issuesByFile.get(i.file) ?? [];
    list.push(i);
    issuesByFile.set(i.file, list);
  }

  const icon = counts.errors > 0
    ? <WarningCircle size={12} weight="fill" className="text-red-400" />
    : counts.warnings > 0
    ? <Warning size={12} weight="fill" className="text-amber-400" />
    : <ShieldCheck size={12} weight="fill" className="text-green-400" />;

  const summary = counts.errors + counts.warnings + counts.infos;

  return (
    <div className={`shrink-0 rounded-lg border ${hasIssues ? "border-kumo-line/40" : "border-kumo-line/30"} bg-kumo-elevated/30`}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          onClick={() => setOpen((p) => !p)}
          className="inline-flex items-center gap-1.5 text-[11px] text-kumo-default font-medium hover:text-kumo-brand transition-colors"
        >
          {open ? <CaretDown size={11} className="text-kumo-subtle" /> : <CaretRight size={11} className="text-kumo-subtle" />}
          {icon}
          Script Quality
          {hasIssues ? (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
              counts.errors > 0 ? "bg-red-500/15 text-red-400" : counts.warnings > 0 ? "bg-amber-500/15 text-amber-400" : "bg-kumo-elevated text-kumo-subtle"
            }`}>
              {summary} issue
            </span>
          ) : (
            <span className="text-[10px] text-green-400 font-medium">bersih ✓</span>
          )}
        </button>

        <div className="ml-auto flex items-center gap-1.5">
          {hasIssues && (
            <>
              <button
                onClick={onNormalizeAll}
                disabled={busy}
                className="inline-flex items-center gap-1 px-2 h-6 rounded-full text-[10px] font-medium ring-1 ring-kumo-line/50 text-kumo-default hover:text-kumo-brand hover:ring-kumo-brand/40 transition-colors disabled:opacity-40"
                title="Konversi semua file ke format standar (cepat, tanpa agent)"
              >
                <MagicWand size={11} />
                Normalisasi
              </button>
              <button
                onClick={onFixWithAgent}
                disabled={busy}
                className="inline-flex items-center gap-1 px-2 h-6 rounded-full text-[10px] font-medium ring-1 ring-kumo-brand/40 text-kumo-brand hover:bg-kumo-brand/10 transition-colors disabled:opacity-40"
                title="Kirim feedback ke agent untuk perbaiki konten (isi tester, lengkapi expected, normalisasi)"
              >
                <Sparkle size={11} />
                Perbaiki via Agent
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      {open && (
        <div className="px-3 pb-2.5 border-t border-kumo-line/30 pt-2">
          {!hasIssues ? (
            <p className="text-[11px] text-kumo-subtle">Semua file memenuhi standar format, tester, dan browser matrix.</p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {[...issuesByFile.entries()].map(([file, list]) => (
                <div key={file} className="rounded border border-kumo-line/40 bg-kumo-recessed/30 px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10.5px] text-kumo-brand">{file}</span>
                    <span className="text-[9.5px] text-kumo-subtle">{list.length} issue</span>
                    <button
                      onClick={() => onNormalizeFile(file)}
                      disabled={busy}
                      className="ml-auto text-[10px] text-kumo-subtle hover:text-kumo-brand transition-colors disabled:opacity-40"
                      title="Normalisasi file ini ke format standar"
                    >
                      Normalisasi
                    </button>
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {list.map((i, idx) => (
                      <li key={idx} className="flex items-start gap-1.5 text-[10.5px] text-kumo-default">
                        {severityIcon(i.severity)}
                        <span className="leading-relaxed">
                          <span className="text-kumo-subtle font-medium">{TYPE_LABELS[i.type]}</span> — {i.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
