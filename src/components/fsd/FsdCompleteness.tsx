import { CheckCircle, CircleDashed, WarningCircle } from "@phosphor-icons/react";
import type { CompletenessResult } from "~/lib/fsd-completeness";

export function FsdCompleteness({ result }: { result: CompletenessResult | null }) {
  if (!result) return null;
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="text-[10px] text-kumo-subtle uppercase tracking-wider mb-2">Completeness</div>
      <div className="mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-semibold text-kumo-default">{result.score}%</span>
          <span className="text-[10px] text-kumo-subtle">required sections</span>
        </div>
        <div className="h-1.5 rounded bg-kumo-elevated mt-1 overflow-hidden">
          <div className={`h-full rounded transition-all ${result.score >= 80 ? "bg-green-500/70" : result.score >= 50 ? "bg-amber-500/70" : "bg-red-500/70"}`} style={{ width: `${result.score}%` }} />
        </div>
      </div>
      <div className="space-y-1">
        {result.required.map((r) => (
          <div key={r.heading} className="flex items-center gap-1.5 text-xs">
            {r.present ? (
              <CheckCircle size={12} className="text-green-400 shrink-0" />
            ) : (
              <CircleDashed size={12} className="text-red-400/70 shrink-0" />
            )}
            <span className={r.present ? "text-kumo-subtle" : "text-kumo-default"}>{r.label}</span>
            {!r.present && <span className="text-[9px] text-red-400/70">missing</span>}
          </div>
        ))}
      </div>
      {result.warnings.length > 0 && (
        <div className="mt-3 pt-2 border-t border-kumo-line">
          <div className="text-[10px] text-kumo-subtle uppercase tracking-wider mb-1.5">Review</div>
          <div className="space-y-1">
            {result.warnings.map((w) => (
              <div key={w} className="flex items-center gap-1.5 text-[10px] text-kumo-subtle">
                <WarningCircle size={10} className="text-amber-400/80 shrink-0" />
                {w}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
