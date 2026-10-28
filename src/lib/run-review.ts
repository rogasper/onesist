/**
 * Findings from the AI reviewer: a JSON array in an `onesist-review` block. Each finding names a
 * file and line, a severity, and a message. Anything malformed is dropped rather than shown.
 */
export type ReviewSeverity = "info" | "warn" | "error";

export interface ReviewFinding {
  file: string;
  line: number | null;
  severity: ReviewSeverity;
  message: string;
  suggestion?: string;
  relatedSymbol?: string;
}

const BLOCK = /```onesist-review\s*\n([\s\S]*?)\n```/g;
const SEVERITIES: ReviewSeverity[] = ["info", "warn", "error"];

export function parseReviewFindings(text: string): { ok: true; findings: ReviewFinding[] } | { ok: false; error: string } {
  const last = [...text.matchAll(BLOCK)].at(-1);
  if (!last) return { ok: false, error: "Temuan reviewer belum ada." };
  let value: unknown;
  try {
    value = JSON.parse(last[1]);
  } catch {
    return { ok: false, error: "Temuan reviewer bukan JSON yang valid." };
  }
  if (!Array.isArray(value)) return { ok: false, error: "Temuan reviewer harus berupa daftar." };
  const findings: ReviewFinding[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const f = item as Record<string, unknown>;
    const file = typeof f.file === "string" ? f.file.trim() : "";
    const message = typeof f.message === "string" ? f.message.trim() : "";
    const severity = SEVERITIES.find((s) => s === f.severity);
    if (!file || !message || !severity) continue;
    const line = Number(f.line);
    findings.push({
      file,
      line: Number.isInteger(line) && line > 0 ? line : null,
      severity,
      message,
      ...(typeof f.suggestion === "string" && f.suggestion.trim() ? { suggestion: f.suggestion.trim() } : {}),
      ...(typeof f.relatedSymbol === "string" && f.relatedSymbol.trim() ? { relatedSymbol: f.relatedSymbol.trim() } : {}),
    });
  }
  return { ok: true, findings };
}
