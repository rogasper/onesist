/**
 * The pull request description for a run: what it did, its acceptance criteria, the outcome of
 * the checks, and the sibling PRs of a multi-repo task. Pure. It never includes command output,
 * which can carry secrets.
 */
export interface RunBodyInput {
  code: string | null;
  title: string;
  summary: string;
  revision: number;
  acceptance: { criterion: string; status: "met" | "no-evidence" | "not-met" | "missing" }[];
  checks: { repo: string; name: string; ok: boolean }[];
  siblings: string[];
}

export function buildRunBody(input: RunBodyInput): string {
  const box = (s: string) => (s === "met" ? "x" : " ");
  const note = (s: string) => (s === "met" ? "" : s === "no-evidence" ? " (tanpa bukti)" : s === "not-met" ? " (belum terpenuhi)" : " (belum terbukti)");
  const lines = [
    `## ${input.code ?? ""} ${input.title}`.trim(),
    "",
    input.summary || "(tanpa ringkasan)",
    "",
    "### Acceptance criteria",
    ...(input.acceptance.length ? input.acceptance.map((a) => `- [${box(a.status)}] ${a.criterion}${note(a.status)}`) : ["- (tidak ada)"]),
    "",
    "### Cek",
    ...(input.checks.length ? input.checks.map((c) => `- ${c.name} (${c.repo}): ${c.ok ? "lolos" : "gagal"}`) : ["- (tidak ada cek yang dikonfigurasi)"]),
  ];
  if (input.siblings.length) {
    lines.push("", "### PR pasangan", ...input.siblings.map((u) => `- ${u}`));
  }
  lines.push("", `Revisi: ${input.revision}`, "", "🤖 Generated with [Claude Code](https://claude.com/claude-code)");
  return lines.join("\n");
}
