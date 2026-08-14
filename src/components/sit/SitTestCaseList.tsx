import { CaretRight, ArrowRight } from "@phosphor-icons/react";
import { SitStatusBadge, SitStatusDot } from "./SitStatusBadge";
import type { SitFileEntry } from "~/shared/sit-types";

interface SitTestCaseListProps {
  entries: SitFileEntry[];
  onSelect: (entry: SitFileEntry) => void;
}

export function SitTestCaseList({ entries, onSelect }: SitTestCaseListProps) {
  if (entries.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-kumo-subtle text-xs italic min-h-32">
        No test cases match the current filters
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto rounded-lg glass-panel">
      <table className="w-full border-collapse text-[11px]">
        <thead className="sticky top-0 z-10 bg-kumo-elevated/90 backdrop-blur">
          <tr className="text-left text-[10px] uppercase tracking-wider text-kumo-subtle">
            <th className="px-3 py-2.5 font-medium w-14">TC</th>
            <th className="px-3 py-2.5 font-medium">Modul / Domain</th>
            <th className="px-3 py-2.5 font-medium text-center w-16">Steps</th>
            <th className="px-3 py-2.5 font-medium text-center w-24">Pass / Fail</th>
            <th className="px-3 py-2.5 font-medium w-44">Progress</th>
            <th className="px-3 py-2.5 font-medium w-28">Status</th>
            <th className="px-3 py-2.5 font-medium w-28">PIC</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => {
            const progressPct = e.stepCount > 0
              ? Math.round(((e.passedSteps + e.failedSteps) / e.stepCount) * 100)
              : 0;
            const passPct = e.stepCount > 0 ? Math.round((e.passedSteps / e.stepCount) * 100) : 0;
            const done = e.passedSteps + e.failedSteps;
            return (
              <tr
                key={e.filename}
                onClick={() => onSelect(e)}
                className="group border-t border-kumo-line/30 border-l-2 border-l-transparent hover:border-l-kumo-brand hover:bg-gradient-to-r hover:from-kumo-tint/60 hover:to-transparent cursor-pointer transition-all duration-150"
              >
                <td className="px-3 py-3">
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-kumo-brand">
                    <SitStatusDot status={e.metadata.status} />
                    {e.metadata.tcId}
                  </span>
                </td>
                <td className="px-3 py-3 text-kumo-default">
                  <span className="block line-clamp-1 max-w-[360px] font-medium group-hover:text-kumo-brand transition-colors">{e.metadata.title}</span>
                  <span className="block text-[9.5px] text-kumo-subtle mt-0.5">
                    {done > 0 ? `${done}/${e.stepCount} diuji` : `${e.stepCount} step belum diuji`}
                  </span>
                </td>
                <td className="px-3 py-3 text-center font-mono text-kumo-default">{e.stepCount}</td>
                <td className="px-3 py-3 text-center whitespace-nowrap">
                  <span className="font-mono text-green-400">{e.passedSteps}</span>
                  <span className="text-kumo-line mx-0.5">/</span>
                  <span className={`font-mono ${e.failedSteps > 0 ? "text-red-400" : "text-kumo-subtle"}`}>{e.failedSteps}</span>
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-kumo-recessed/60 rounded-full overflow-hidden flex">
                      {e.passedSteps > 0 && <div className="h-full bg-green-400/70" style={{ width: `${passPct}%` }} />}
                      {e.failedSteps > 0 && <div className="h-full bg-red-400/70" style={{ width: `${progressPct - passPct}%` }} />}
                    </div>
                    <span className="text-[10px] text-kumo-subtle shrink-0 w-9 text-right font-mono">{progressPct}%</span>
                  </div>
                </td>
                <td className="px-3 py-3"><SitStatusBadge status={e.metadata.status} /></td>
                <td className="px-3 py-3">
                  {e.metadata.tester ? (
                    <span className="inline-flex items-center gap-1.5 text-kumo-subtle">
                      <span className="w-4 h-4 rounded-full bg-kumo-elevated ring-1 ring-kumo-line/50 inline-flex items-center justify-center text-[8px] font-mono text-kumo-subtle">
                        {e.metadata.tester.slice(0, 1).toUpperCase()}
                      </span>
                      {e.metadata.tester}
                    </span>
                  ) : <span className="text-kumo-subtle">—</span>}
                </td>
                <td className="pr-3 text-kumo-line group-hover:text-kumo-brand transition-all group-hover:translate-x-0.5">
                  <ArrowRight size={12} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
