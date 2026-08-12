/**
 * Parse a Requirement Traceability Matrix markdown file into structured rows.
 *
 * Expected format (produced by the RTM agent prompt):
 *
 * # Requirement Traceability Matrix
 *
 * ## Business Requirements
 * | ID | Title | Description |
 * |----|-------|-------------|
 * | BR-001 | Login & Autentikasi | Pengguna dapat masuk |
 *
 * ## Design Solutions
 * | ID | Title | Source | Description |
 *
 * ## Test Cases
 * | ID | Title | Steps | Expected |
 *
 * ## Functional Requirements
 * | ID | BR | Title | Description | Design Solution | Test Case |
 * | FR-001 | BR-001 | Login | ... | DS-001 | TC-001 |
 */

export interface ParsedBr {
  code: string;
  title: string;
  description: string | null;
}

export interface ParsedDesign {
  code: string;
  title: string;
  sourceRef: string | null;
  description: string | null;
}

export interface ParsedTest {
  code: string;
  title: string;
  steps: string | null;
  expected: string | null;
}

export interface ParsedFr {
  code: string;
  brCode: string | null;
  title: string;
  description: string | null;
  dsCodes: string[];
  tcCodes: string[];
}

export interface ParsedRtm {
  brs: ParsedBr[];
  designs: ParsedDesign[];
  tests: ParsedTest[];
  frs: ParsedFr[];
  unresolvedBrCodes: string[];
}

type Section = "br" | "design" | "test" | "fr" | "unknown";

function detectSection(header: string): Section {
  const h = header.toLowerCase();
  if (h.includes("business requirement")) return "br";
  if (h.includes("functional requirement")) return "fr";
  if (h.includes("design solution")) return "design";
  if (h.includes("test case")) return "test";
  return "unknown";
}

/** Parse a table row into cells, ignoring the separator row and empty lines. */
function splitRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return [];
  return trimmed
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

/** Extract codes like BR-001 / DS-001A from a cell (semicolon/comma/newline separated). */
function splitCodes(cell: string): string[] {
  return cell
    .split(/[;,\n]/)
    .map((c) => c.trim())
    .filter((c) => /^[A-Za-z]{1,3}-\d+/.test(c))
    .map((c) => c.match(/^([A-Za-z]{1,3}-\d+)/)?.[1] ?? c);
}

export function parseRtmMarkdown(content: string): ParsedRtm {
  const brs: ParsedBr[] = [];
  const designs: ParsedDesign[] = [];
  const tests: ParsedTest[] = [];
  const frs: ParsedFr[] = [];

  let section: Section = "unknown";
  const lines = content.split("\n");

  for (const line of lines) {
    if (line.startsWith("#")) {
      const header = line.replace(/^#+\s*/, "").trim();
      section = detectSection(header);
      continue;
    }
    const cells = splitRow(line);
    if (cells.length < 2) continue;
    if (isSeparatorRow(cells)) continue;

    const code = cells[0];

    if (section === "br") {
      if (!/^BR-/i.test(code)) continue;
      brs.push({
        code: code.toUpperCase(),
        title: cells[1] || "Untitled",
        description: cells[2] || null,
      });
    } else if (section === "design") {
      if (!/^DS-/i.test(code)) continue;
      designs.push({
        code: code.toUpperCase(),
        title: cells[1] || "Untitled",
        sourceRef: cells[2] || null,
        description: cells[3] || null,
      });
    } else if (section === "test") {
      if (!/^TC-/i.test(code)) continue;
      tests.push({
        code: code.toUpperCase(),
        title: cells[1] || "Untitled",
        steps: cells[2] || null,
        expected: cells[3] || null,
      });
    } else if (section === "fr") {
      if (!/^FR-/i.test(code)) continue;
      const brCell = cells[1] || "";
      const brMatch = brCell.match(/([A-Za-z]{1,3}-\d+)/i);
      frs.push({
        code: code.toUpperCase(),
        brCode: brMatch ? brMatch[1].toUpperCase() : null,
        title: cells[2] || "Untitled",
        description: cells[3] || null,
        dsCodes: splitCodes(cells[4] ?? "").map((c) => c.toUpperCase()),
        tcCodes: splitCodes(cells[5] ?? "").map((c) => c.toUpperCase()),
      });
    }
  }

  const knownBr = new Set(brs.map((b) => b.code));
  const unresolvedBrCodes = [...new Set(frs.map((f) => f.brCode).filter((c): c is string => !!c && !knownBr.has(c)))];

  return { brs, designs, tests, frs, unresolvedBrCodes };
}
