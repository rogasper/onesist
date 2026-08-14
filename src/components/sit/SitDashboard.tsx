import { useMemo, useState } from "react";
import { CheckCircle, XCircle, ListChecks, Gauge, Stack } from "@phosphor-icons/react";
import { SitFilterBar } from "./SitFilterBar";
import { SitTestCaseList } from "./SitTestCaseList";
import { SitQualityPanel, type QualityCounts } from "./SitQualityPanel";
import type { SitQualityIssue } from "~/lib/sit-parser";
import type { SitDataset, SitFileEntry } from "~/shared/sit-types";

interface SitDashboardProps {
  data: SitDataset;
  onSelect: (entry: SitFileEntry) => void;
  issues?: SitQualityIssue[];
  qualityCounts?: QualityCounts;
  qualityBusy?: boolean;
  onNormalizeAll?: () => void;
  onFixWithAgent?: () => void;
  onNormalizeFile?: (file: string) => void;
}

/** Cockpit metric tile — hairline dividers, mono numbers, one semantic accent. */
function MetricTile({ label, value, Icon, tone = "default" }: {
  label: string;
  value: string | number;
  Icon: typeof Gauge;
  tone?: "default" | "green" | "red" | "brand";
}) {
  const iconCls = tone === "green" ? "text-green-400"
    : tone === "red" ? "text-red-400"
    : tone === "brand" ? "text-kumo-brand"
    : "text-kumo-subtle";
  const valCls = tone === "green" ? "text-green-400"
    : tone === "red" ? "text-red-400"
    : tone === "brand" ? "text-kumo-brand"
    : "text-kumo-default";
  return (
    <div className="flex flex-col gap-1 px-3 py-2.5 min-w-[120px] border-l border-kumo-line/40 first:border-l-0">
      <div className="flex items-center gap-1.5">
        <Icon size={12} className={iconCls} />
        <span className="text-[10px] uppercase tracking-wider text-kumo-subtle">{label}</span>
      </div>
      <span className={`font-mono text-xl font-semibold leading-none tracking-tight ${valCls}`}>{value}</span>
    </div>
  );
}

export function SitDashboard({
  data,
  onSelect,
  issues,
  qualityCounts,
  qualityBusy,
  onNormalizeAll,
  onFixWithAgent,
  onNormalizeFile,
}: SitDashboardProps) {
  const [filtered, setFiltered] = useState<SitFileEntry[]>(data.files);
  const summary = data.summary;

  const stats = useMemo(() => {
    const totalSteps = filtered.reduce((s, f) => s + f.stepCount, 0);
    const totalPass = filtered.reduce((s, f) => s + f.passedSteps, 0);
    const totalFail = filtered.reduce((s, f) => s + f.failedSteps, 0);
    const done = totalPass + totalFail;
    const readiness = totalSteps > 0 ? Math.round((totalPass / totalSteps) * 100) : 0;
    const testedPct = totalSteps > 0 ? Math.round((done / totalSteps) * 100) : 0;
    return { totalSteps, totalPass, totalFail, done, readiness, testedPct };
  }, [filtered]);

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Metric strip — cockpit tiles separated by hairlines */}
      <div className="shrink-0 flex items-stretch divide-x divide-kumo-line/40 rounded-lg glass-panel">
        <MetricTile label="TC Groups" value={filtered.length} Icon={Stack} tone="brand" />
        <MetricTile label="Steps" value={stats.totalSteps} Icon={ListChecks} />
        <MetricTile label="Passed" value={stats.totalPass} Icon={CheckCircle} tone="green" />
        <MetricTile label="Failed" value={stats.totalFail} Icon={XCircle} tone="red" />
        <MetricTile label="Readiness" value={`${stats.readiness}%`} Icon={Gauge} tone={stats.readiness >= 70 ? "green" : stats.readiness > 0 ? "brand" : "default"} />
        {summary && summary.project !== "auto" && (
          <div className="flex-1 flex flex-col justify-center px-4 text-right min-w-0">
            <p className="text-[11px] text-kumo-default font-medium truncate">{summary.project}</p>
            <p className="text-[10px] text-kumo-subtle">{summary.version} · {summary.created}</p>
          </div>
        )}
      </div>

      {/* Overall progress bar (tested vs untested) */}
      {stats.totalSteps > 0 && (
        <div className="shrink-0 flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-kumo-recessed/60 overflow-hidden flex">
            {stats.totalPass > 0 && <div className="h-full bg-green-400/80" style={{ width: `${(stats.totalPass / stats.totalSteps) * 100}%` }} />}
            {stats.totalFail > 0 && <div className="h-full bg-red-400/80" style={{ width: `${(stats.totalFail / stats.totalSteps) * 100}%` }} />}
          </div>
          <span className="text-[10px] text-kumo-subtle whitespace-nowrap">
            {stats.done}/{stats.totalSteps} tested ({stats.testedPct}%)
          </span>
        </div>
      )}

      <SitFilterBar entries={data.files} onFilter={setFiltered} />

      {issues && qualityCounts && onNormalizeAll && onFixWithAgent && onNormalizeFile && (
        <SitQualityPanel
          issues={issues}
          counts={qualityCounts}
          onNormalizeAll={onNormalizeAll}
          onFixWithAgent={onFixWithAgent}
          onNormalizeFile={onNormalizeFile}
          busy={qualityBusy}
        />
      )}

      <SitTestCaseList entries={filtered} onSelect={onSelect} />
    </div>
  );
}
