import { ArrowLeft, ListChecks, MapPin, CalendarBlank, Desktop } from "@phosphor-icons/react";
import { SitStatusBadge } from "./SitStatusBadge";
import { SitStepRow } from "./SitStepRow";
import type { SitTestCase, SitStep } from "~/shared/sit-types";

interface SitTestCaseDetailProps {
  tc: SitTestCase;
  onBack: () => void;
}

function SummaryStat({ label, value, tone = "default" }: {
  label: string;
  value: string | number;
  tone?: "default" | "green" | "red";
}) {
  const cls = tone === "green" ? "text-green-400"
    : tone === "red" ? "text-red-400"
    : "text-kumo-default";
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] uppercase tracking-wider text-kumo-subtle">{label}</span>
      <span className={`font-mono text-lg font-semibold leading-none ${cls}`}>{value}</span>
    </div>
  );
}

export function SitTestCaseDetail({ tc, onBack }: SitTestCaseDetailProps) {
  const { metadata, steps } = tc;
  const passCount = steps.filter((s) => s.finalResult === "Pass" || s.browserResults.some((b) => /pass/i.test(b.lastStatus || b.firstStatus || ""))).length;
  const failCount = steps.filter((s) => s.finalResult === "Fail" || s.browserResults.some((b) => /fail/i.test(b.lastStatus || b.firstStatus || ""))).length;
  const positiveCount = steps.filter((s) => s.typeTest === "Positive").length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 mb-3 space-y-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1 text-[11px] text-kumo-subtle hover:text-kumo-default transition-colors"
        >
          <ArrowLeft size={12} />
          Kembali ke daftar
        </button>

        {/* Header — title + badges */}
        <div className="flex items-start gap-3 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm text-kumo-brand">{metadata.tcId}</span>
              <h2 className="text-base font-semibold text-kumo-default tracking-tight">{metadata.title}</h2>
            </div>
            {metadata.description && (
              <p className="mt-1 text-[11px] text-kumo-subtle leading-relaxed line-clamp-2">{metadata.description}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
            <SitStatusBadge status={metadata.status} />
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ring-1 bg-blue-500/10 text-blue-400 ring-blue-500/25">
              {metadata.progress}
            </span>
          </div>
        </div>

        {/* Meta strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 rounded-lg glass-panel px-3 py-2.5">
          {metadata.tester && (
            <div className="flex items-center gap-1.5 text-[11px] text-kumo-subtle">
              <span className="font-medium text-kumo-default">{metadata.tester}</span>
              <span className="text-[9px] uppercase tracking-wider">PIC</span>
            </div>
          )}
          {metadata.date && (
            <div className="flex items-center gap-1.5 text-[11px] text-kumo-subtle">
              <CalendarBlank size={12} className="shrink-0" />
              {metadata.date}
            </div>
          )}
          {metadata.location && (
            <div className="flex items-center gap-1.5 text-[11px] text-kumo-subtle">
              <MapPin size={12} className="shrink-0" />
              {metadata.location}
            </div>
          )}
          {metadata.systemEnv && (
            <div className="flex items-center gap-1.5 text-[11px] text-kumo-subtle">
              <Desktop size={12} className="shrink-0" />
              <span className="truncate">{metadata.systemEnv}</span>
            </div>
          )}
        </div>

        {/* Step summary */}
        <div className="flex items-center gap-4 flex-wrap">
          <SummaryStat label="Steps" value={steps.length} />
          <SummaryStat label="Pass" value={passCount} tone="green" />
          <SummaryStat label="Fail" value={failCount} tone="red" />
          <SummaryStat label="Positive" value={positiveCount} />
          <SummaryStat label="Negative" value={steps.length - positiveCount} />
        </div>
      </div>

      {/* Steps */}
      <div className="flex-1 min-h-0 overflow-y-auto rounded-lg glass-panel">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <ListChecks size={24} className="text-kumo-subtle opacity-40 mb-2" />
            <p className="text-xs text-kumo-subtle">Belum ada step di test case group ini.</p>
          </div>
        ) : (
          <div className="divide-y divide-kumo-line/40">
            {steps.map((step, i) => <SitStepRow key={step.code} step={step} index={i} />)}
          </div>
        )}
      </div>
    </div>
  );
}
