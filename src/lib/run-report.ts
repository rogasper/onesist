/**
 * The report an agent writes at the end of a task run: what it did, and per acceptance criterion
 * whether it is met and where the evidence is. Pure, so the board and the server read it the same way.
 */
export interface AcceptanceEntry {
  criterion: string;
  met: boolean;
  evidence: string[];
}

export interface RunReport {
  summary: string;
  acceptance: AcceptanceEntry[];
  notes: string;
  questionsAsked: string[];
}

export type CriterionStatus = "met" | "no-evidence" | "not-met" | "missing";

const BLOCK = /```onesist-report\s*\n([\s\S]*?)\n```/g;

export function parseRunReport(text: string): { ok: true; report: RunReport } | { ok: false; error: string } {
  const last = [...text.matchAll(BLOCK)].at(-1);
  if (!last) return { ok: false, error: "Laporan agen belum ada." };
  let value: unknown;
  try {
    value = JSON.parse(last[1]);
  } catch {
    return { ok: false, error: "Laporan agen bukan JSON yang valid." };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, error: "Laporan agen harus berupa objek." };
  const v = value as Record<string, unknown>;
  const acceptance = Array.isArray(v.acceptance)
    ? v.acceptance
        .filter((a): a is Record<string, unknown> => !!a && typeof a === "object")
        .map((a) => ({
          criterion: typeof a.criterion === "string" ? a.criterion : "",
          met: a.met === true,
          evidence: Array.isArray(a.evidence) ? a.evidence.filter((e): e is string => typeof e === "string") : [],
        }))
    : [];
  return {
    ok: true,
    report: {
      summary: typeof v.summary === "string" ? v.summary : "",
      acceptance,
      notes: typeof v.notes === "string" ? v.notes : "",
      questionsAsked: Array.isArray(v.questionsAsked) ? v.questionsAsked.filter((q): q is string => typeof q === "string") : [],
    },
  };
}

/** How the report settles one criterion: met needs both `met: true` and evidence. */
export function criterionStatus(report: RunReport, criterion: string): CriterionStatus {
  const entry = report.acceptance.find((a) => a.criterion.trim() === criterion.trim());
  if (!entry) return "missing";
  if (!entry.met) return "not-met";
  return entry.evidence.length > 0 ? "met" : "no-evidence";
}
