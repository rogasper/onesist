import { useState } from "react";
import { CaretDown, CaretRight, Bug, Code, ListNumbers, Textbox, Target, Devices } from "@phosphor-icons/react";
import { SitStatusBadge, SitTypeBadge } from "./SitStatusBadge";
import type { SitStep } from "~/shared/sit-types";

interface SitStepRowProps {
  step: SitStep;
  index?: number;
}

function SectionLabel({ Icon, children }: { Icon: typeof Code; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-kumo-subtle mb-1">
      <Icon size={11} />
      {children}
    </div>
  );
}

export function SitStepRow({ step, index = 0 }: SitStepRowProps) {
  const [expanded, setExpanded] = useState(false);
  const effectiveResult = step.finalResult
    || step.browserResults.find((b) => /pass|fail/i.test(b.lastStatus || b.firstStatus || ""))?.lastStatus
    || step.browserResults.find((b) => /pass|fail/i.test(b.lastStatus || b.firstStatus || ""))?.firstStatus
    || null;

  return (
    <div className={expanded ? "bg-kumo-tint/20" : ""}>
      {/* Row header — always visible */}
      <button
        onClick={() => setExpanded((p) => !p)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-kumo-tint/40 transition-colors"
      >
        <span className="text-kumo-subtle w-5 shrink-0 flex justify-center">
          {expanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
        </span>
        <span className="text-[10px] text-kumo-subtle w-6 shrink-0 text-right font-mono">{index + 1}</span>
        <span className="font-mono text-kumo-brand w-20 shrink-0">{step.code}</span>
        <span className="text-kumo-default flex-1 min-w-0 truncate text-[11px]">{step.feature}</span>
        <SitTypeBadge type={step.typeTest} />
        {step.bugRefs.length > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium ring-1 bg-amber-500/10 text-amber-400 ring-amber-500/25">
            <Bug size={10} />
            {step.bugRefs.join(", ")}
          </span>
        )}
        {effectiveResult ? (
          <SitStatusBadge status={effectiveResult} />
        ) : (
          <span className="text-[10px] text-kumo-subtle">{step.tested}</span>
        )}
      </button>

      {/* Expanded body */}
      {expanded && (
        <div className="px-11 pb-4 space-y-3">
          {step.userStory && (
            <div>
              <SectionLabel Icon={Target}>User Story</SectionLabel>
              <p className="text-[11px] text-kumo-default leading-relaxed">{step.userStory}</p>
            </div>
          )}

          {step.steps.length > 0 && (
            <div>
              <SectionLabel Icon={ListNumbers}>Steps</SectionLabel>
              <ol className="text-[11px] text-kumo-default space-y-1">
                {step.steps.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono text-kumo-subtle shrink-0">{i + 1}.</span>
                    <span className="leading-relaxed">{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {step.dataInput && (
            <div>
              <SectionLabel Icon={Textbox}>Data Input</SectionLabel>
              <pre className="text-[10.5px] text-kumo-default bg-kumo-recessed/50 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap leading-relaxed">{step.dataInput}</pre>
            </div>
          )}

          {step.expected && (
            <div>
              <SectionLabel Icon={Target}>Expected Result</SectionLabel>
              <pre className="text-[11px] text-kumo-default bg-kumo-recessed/50 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap leading-relaxed">{step.expected}</pre>
            </div>
          )}

          {step.browserResults.length > 0 && (
            <div>
              <SectionLabel Icon={Devices}>Browser Matrix</SectionLabel>
              <div className="overflow-x-auto">
                <table className="w-full text-[10px] border border-kumo-line/40 rounded-md">
                  <thead className="bg-kumo-elevated/60">
                    <tr className="text-left text-kumo-subtle font-medium">
                      <th className="px-2.5 py-1.5">Browser</th>
                      <th className="px-2.5 py-1.5">Tested</th>
                      <th className="px-2.5 py-1.5">First</th>
                      <th className="px-2.5 py-1.5">PIC</th>
                      <th className="px-2.5 py-1.5">Last</th>
                      <th className="px-2.5 py-1.5">Evidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {step.browserResults.map((br, i) => (
                      <tr key={i} className="border-t border-kumo-line/30">
                        <td className="px-2.5 py-1.5 text-kumo-default">{br.browser}</td>
                        <td className="px-2.5 py-1.5">
                          {br.tested && br.tested !== "Not started" ? (
                            <span className="inline-flex items-center gap-1 text-kumo-default">
                              <span className={`w-1.5 h-1.5 rounded-full ${/pass/i.test(br.tested) ? "bg-green-400" : /fail/i.test(br.tested) ? "bg-red-400" : "bg-kumo-line"}`} />
                              {br.tested}
                            </span>
                          ) : <span className="text-kumo-subtle">—</span>}
                        </td>
                        <td className="px-2.5 py-1.5">
                          {br.firstStatus ? <SitStatusBadge status={br.firstStatus} /> : <span className="text-kumo-subtle">—</span>}
                        </td>
                        <td className="px-2.5 py-1.5 text-kumo-subtle">{br.pic || "—"}</td>
                        <td className="px-2.5 py-1.5">
                          {br.lastStatus ? <SitStatusBadge status={br.lastStatus} /> : <span className="text-kumo-subtle">—</span>}
                        </td>
                        <td className="px-2.5 py-1.5 text-kumo-subtle">{br.evidence || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(() => {
            const actuals = step.browserResults
              .filter((br) => br.actualResult)
              .map((br) => `${br.browser}: ${br.actualResult}`)
              .join("\n");
            return actuals ? (
              <div>
                <SectionLabel Icon={Code}>Actual Result (per browser)</SectionLabel>
                <pre className="text-[10.5px] text-kumo-default bg-kumo-recessed/50 rounded-md p-2.5 overflow-x-auto whitespace-pre-wrap leading-relaxed">{actuals}</pre>
              </div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}
