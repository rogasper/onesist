/**
 * Parse a Requirement Traceability Matrix markdown file into structured rows.
 *
 * Expected format (produced by the RTM agent prompt / `references/rtm_format.md`):
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
 *
 * The parser maps columns by the table HEADER row (label-based), so a model that
 * emits the columns in a different order (e.g. `ID | Title | Description | BR |`)
 * still parses correctly. It falls back to the canonical positional layout when
 * the header is missing or unrecognizable.
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

/** Normalize a header label for alias matching ("Design Solution" → "designsolution"). */
function normHeader(cell: string): string {
  return cell.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Column positions for a table, resolved from its header row (or positional fallback). */
interface ColResolver {
  code: number;
  title: number;
  description: number | null;
  br: number | null;
  source: number | null;
  steps: number | null;
  expected: number | null;
  ds: number | null;
  tc: number | null;
}

/** Canonical (positional) layout — used when no recognizable header is present. */
function positionalCols(section: Section): ColResolver {
  switch (section) {
    case "br":
      return { code: 0, title: 1, description: 2, br: null, source: null, steps: null, expected: null, ds: null, tc: null };
    case "design":
      return { code: 0, title: 1, source: 2, description: 3, br: null, steps: null, expected: null, ds: null, tc: null };
    case "test":
      return { code: 0, title: 1, steps: 2, expected: 3, description: null, br: null, source: null, ds: null, tc: null };
    case "fr":
      return { code: 0, br: 1, title: 2, description: 3, source: null, steps: null, expected: null, ds: 4, tc: 5 };
    default:
      return { code: 0, title: 1, description: null, br: null, source: null, steps: null, expected: null, ds: null, tc: null };
  }
}

/**
 * Map table columns from the header row labels. Returns null when the header is
 * missing or doesn't look like a table header (no id/code column) — callers
 * fall back to the canonical positional layout.
 */
function colsFromHeader(header: string[]): ColResolver | null {
  if (!header || header.length < 2) return null;
  const norm = header.map(normHeader);
  const find = (aliases: string[]): number => norm.findIndex((c) => aliases.includes(c));

  const idIdx = find(["id", "code", "kode", "idcode"]);
  if (idIdx === -1) return null; // not a header we can trust

  const findOr = (aliases: string[], fallback: number): number => {
    const i = find(aliases);
    return i !== -1 ? i : fallback;
  };

  return {
    code: idIdx,
    title: findOr(["title", "judul"], 1),
    description: (() => { const i = find(["description", "deskripsi", "desc", "keterangan"]); return i !== -1 ? i : null; })(),
    br: (() => { const i = find(["br", "businessrequirement", "businessreq", "bussinessrequirement"]); return i !== -1 ? i : null; })(),
    source: (() => { const i = find(["source", "sumber", "ref", "reference"]); return i !== -1 ? i : null; })(),
    steps: (() => { const i = find(["steps", "step", "langkah", "langkahkerja"]); return i !== -1 ? i : null; })(),
    expected: (() => { const i = find(["expected", "expectedresult", "expectedoutput", "hasil", "expected"]); return i !== -1 ? i : null; })(),
    ds: (() => { const i = find(["designsolution", "design", "designsolusi", "ds"]); return i !== -1 ? i : null; })(),
    tc: (() => { const i = find(["testcase", "testcases", "test", "tc"]); return i !== -1 ? i : null; })(),
  };
}

export function parseRtmMarkdown(content: string): ParsedRtm {
  const brs: ParsedBr[] = [];
  const designs: ParsedDesign[] = [];
  const tests: ParsedTest[] = [];
  const frs: ParsedFr[] = [];

  let section: Section = "unknown";
  // The row immediately before a separator row is the markdown table header.
  let lastTableRow: string[] | null = null;
  let cols: ColResolver = positionalCols(section);
  const lines = content.split("\n");

  for (const line of lines) {
    if (line.startsWith("#")) {
      section = detectSection(line.replace(/^#+\s*/, "").trim());
      lastTableRow = null;
      cols = positionalCols(section);
      continue;
    }
    const cells = splitRow(line);
    if (cells.length < 2) continue;
    if (isSeparatorRow(cells)) {
      cols = colsFromHeader(lastTableRow ?? []) ?? positionalCols(section);
      lastTableRow = null;
      continue;
    }
    lastTableRow = cells;

    const code = (cells[cols.code] ?? cells[0]).toUpperCase();

    if (section === "br") {
      if (!/^BR-/i.test(code)) continue;
      brs.push({
        code,
        title: cells[cols.title] || "Untitled",
        description: cols.description !== null ? cells[cols.description] || null : null,
      });
    } else if (section === "design") {
      if (!/^DS-/i.test(code)) continue;
      designs.push({
        code,
        title: cells[cols.title] || "Untitled",
        sourceRef: cols.source !== null ? cells[cols.source] || null : null,
        description: cols.description !== null ? cells[cols.description] || null : null,
      });
    } else if (section === "test") {
      if (!/^TC-/i.test(code)) continue;
      tests.push({
        code,
        title: cells[cols.title] || "Untitled",
        steps: cols.steps !== null ? cells[cols.steps] || null : null,
        expected: cols.expected !== null ? cells[cols.expected] || null : null,
      });
    } else if (section === "fr") {
      if (!/^FR-/i.test(code)) continue;
      const brCell = cols.br !== null ? cells[cols.br] || "" : "";
      const brMatch = brCell.match(/([A-Za-z]{1,3}-\d+)/i);
      const dsIdx = cols.ds !== null ? cols.ds : 4;
      const tcIdx = cols.tc !== null ? cols.tc : 5;
      frs.push({
        code,
        brCode: brMatch ? brMatch[1].toUpperCase() : null,
        title: cells[cols.title] || "Untitled",
        description: cols.description !== null ? cells[cols.description] || null : null,
        dsCodes: splitCodes(cells[dsIdx] ?? "").map((c) => c.toUpperCase()),
        tcCodes: splitCodes(cells[tcIdx] ?? "").map((c) => c.toUpperCase()),
      });
    }
  }

  const knownBr = new Set(brs.map((b) => b.code));
  const unresolvedBrCodes = [...new Set(frs.map((f) => f.brCode).filter((c): c is string => !!c && !knownBr.has(c)))];

  return { brs, designs, tests, frs, unresolvedBrCodes };
}
