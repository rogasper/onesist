import fs from "node:fs";
import path from "node:path";
import type {
  SitTestCase,
  SitMetadata,
  SitStep,
  SitBrowserResult,
  SitSummary,
  SitSummaryRow,
  SitFileEntry,
  SitDataset,
  SitProgress,
  SitStatus,
  SitTestType,
} from "~/shared/sit-types";

const DEFAULT_BROWSERS = ["Desktop Chrome", "Desktop Safari", "Desktop Firefox", "iOS", "Android"];

const FIELD_RE = /^-\s*\*\*([^*]+)\*\*:\s*(.*)$/;
const BLANK = /^\s*$/;

/** Find the index of the `- **Key**:` field line. */
function fieldIndex(lines: string[], key: string): number {
  const re = new RegExp(`^-\\s*\\*\\*${key}\\*\\*:`, "i");
  return lines.findIndex((l) => re.test(l));
}

/** Read a `- **Key**:` field. multiLine collects the indented block after an
 *  empty inline value (e.g. Expected Result / Step). Returns null when absent. */
function getField(lines: string[], key: string, multiLine = false): string | null {
  const idx = fieldIndex(lines, key);
  if (idx === -1) return null;
  const inline = (lines[idx].match(FIELD_RE)?.[2] ?? "").trim();
  if (inline) return inline;
  if (!multiLine) return null;
  const rest: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^-\s*\*\*[^*]+\*\*:/.test(l)) break;
    rest.push(l);
  }
  const out = rest.join("\n").trim();
  return out || null;
}

/** Extract the lines of a `## heading` / `#### heading` section (up to the next
 *  heading at the SAME or HIGHER level, or — when stopOnFields — a top-level
 *  `- **Key**:` field). Deeper sub-headings (e.g. `###` steps under `##`) are
 *  kept. */
function sectionLines(lines: string[], headingRe: RegExp, stopOnFields = true): string[] | null {
  const idx = lines.findIndex((l) => headingRe.test(l.trim()));
  if (idx === -1) return null;
  const sectionLevel = (lines[idx].match(/^#+/)?.[0] ?? "#").length;
  const out: string[] = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const l = lines[i];
    const t = l.trim();
    const hm = t.match(/^(#+)\s/);
    if (hm && hm[1].length <= sectionLevel) break;
    if (stopOnFields && /^-\s*\*\*[^*]+\*\*:/.test(l)) break;
    out.push(l);
  }
  return out;
}

function extractBugRefs(text: string): string[] {
  const refs: string[] = [];
  const re = /\[(BUG\d+)\]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!refs.includes(m[1].toUpperCase())) refs.push(m[1].toUpperCase());
  }
  return refs;
}

function parseProgress(raw: string | null): SitProgress {
  if (!raw) return "Not Yet";
  if (/complete/i.test(raw)) return "Complete";
  if (/partial/i.test(raw)) return "Partial Complete";
  return "Not Yet";
}

function parseStatus(raw: string | null): SitStatus {
  if (!raw) return "Not started";
  if (/^pass/i.test(raw)) return "Pass";
  if (/^fail/i.test(raw)) return "Fail";
  if (/hold/i.test(raw)) return "Hold";
  if (/re.?open/i.test(raw)) return "Re Open";
  if (/stopper/i.test(raw)) return "Stopper";
  if (/takeout/i.test(raw)) return "Takeout";
  return "Not started";
}

function parseMetadata(heading: string, metaLines: string[]): SitMetadata {
  // Tolerate hyphen, em/en dash, or colon after the TC id.
  const m = heading.match(/^#\s*(TC\d+)\s*[-—–:]?\s*(.*)$/i);
  const tcId = m ? m[1].toUpperCase() : "TC00";
  const title = m ? m[2].trim() : heading.replace(/^#\s*/, "").trim();

  return {
    tcId,
    title,
    description: getField(metaLines, "Description"),
    systemEnv: getField(metaLines, "System Environment"),
    tester: getField(metaLines, "Tester"),
    location: getField(metaLines, "Location"),
    date: getField(metaLines, "Date"),
    progress: parseProgress(getField(metaLines, "Overall Progress")),
    status: parseStatus(getField(metaLines, "Overall Status")),
  };
}

function parseBrowserTable(block: string[]): SitBrowserResult[] {
  const rows = block
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
    .map((l) => l.split("|").map((c) => c.trim()).filter(Boolean));

  if (rows.length < 2) {
    return DEFAULT_BROWSERS.map((browser) => ({
      browser,
      tested: "Not started",
      firstStatus: null,
      pic: null,
      firstDate: null,
      actualResult: null,
      lastStatus: null,
      lastDate: null,
      lastActual: null,
      evidence: null,
    }));
  }

  // Rows may start with a leading "| " which split() turns into an empty first
  // cell — filter(Boolean) above already dropped empty cells, so rows and
  // header have the same width. Skip the separator row (only dashes/colons).
  const dataRows = rows.slice(1).filter((cells) => !cells.every((c) => /^[-:]+$/.test(c)));
  if (dataRows.length === 0) {
    return DEFAULT_BROWSERS.map((browser) => ({
      browser,
      tested: "Not started",
      firstStatus: null,
      pic: null,
      firstDate: null,
      actualResult: null,
      lastStatus: null,
      lastDate: null,
      lastActual: null,
      evidence: null,
    }));
  }

  const header = rows[0].map((h) => h.toLowerCase());
  const findCol = (names: string[]): number =>
    header.findIndex((h) => names.some((n) => h.includes(n)));

  const bCol = findCol(["browser", "device"]);
  const testedCol = findCol(["tested"]);
  const firstStatusCol = findCol(["first status", "status first"]);
  const picCol = findCol(["pic"]);
  const firstDateCol = findCol(["first date", "date first"]);
  const actualCol = findCol(["actual result", "actual"]);
  const lastStatusCol = findCol(["last status", "status last"]);
  const lastDateCol = findCol(["last date", "date last"]);
  const lastActualCol = findCol(["last actual"]);
  const evidenceCol = findCol(["evidence"]);

  const get = (cells: string[], idx: number): string | null => {
    if (idx < 0 || idx >= cells.length) return null;
    const v = cells[idx].trim();
    return !v || v === "-" || BLANK.test(v) ? null : v;
  };

  const results: SitBrowserResult[] = dataRows.map((cells, i) => ({
    browser: get(cells, bCol) || `Browser ${i + 1}`,
    tested: get(cells, testedCol),
    firstStatus: get(cells, firstStatusCol),
    pic: get(cells, picCol),
    firstDate: get(cells, firstDateCol),
    actualResult: get(cells, actualCol),
    lastStatus: get(cells, lastStatusCol),
    lastDate: get(cells, lastDateCol),
    lastActual: get(cells, lastActualCol),
    evidence: get(cells, evidenceCol),
  }));

  for (const br of DEFAULT_BROWSERS) {
    if (!results.find((r) => r.browser.toLowerCase().includes(br.toLowerCase()) || br.toLowerCase().includes(r.browser.toLowerCase()))) {
      results.push({
        browser: br,
        tested: "Not started",
        firstStatus: null,
        pic: null,
        firstDate: null,
        actualResult: null,
        lastStatus: null,
        lastDate: null,
        lastActual: null,
        evidence: null,
      });
    }
  }

  return results;
}

function parseSteps(body: string[]): SitStep[] {
  const steps: SitStep[] = [];
  let current: string[] | null = null;
  let heading = "";

  const flush = () => {
    if (!current) return;
    const headerParts = heading.split(/\s+[-—–]\s+/);
    const code = headerParts[0]?.trim() || "";
    const menu = headerParts[1]?.trim() || "";
    const featureFromHeading = headerParts.slice(2).join(" - ").trim();

    const feature = getField(current, "Feature") || featureFromHeading;
    const stepRaw = getField(current, "Step", true);
    const stepLines = stepRaw
      ? stepRaw.split("\n").map((l) => l.replace(/^\s*\d+\.\s*/, "").trim()).filter(Boolean)
      : [];

    const browserSection = sectionLines(current, /^####\s+Browser\s+Results/i);

    steps.push({
      no: steps.length + 1,
      code,
      menu,
      feature,
      userStory: getField(current, "User Story") || "",
      steps: stepLines,
      dataInput: getField(current, "Data Input"),
      expected: getField(current, "Expected Result", true) || "",
      typeTest: /negative/i.test(getField(current, "Type") || "") ? "Negative" : "Positive",
      tested: getField(current, "Tested") || "Not started",
      bugRefs: extractBugRefs(getField(current, "Bug") || ""),
      browserResults: browserSection ? parseBrowserTable(browserSection) : [],
      finalPic: getField(current, "Final PIC"),
      finalResult: getField(current, "Final Result"),
      finalStatus: getField(current, "Final Status"),
    });
    current = null;
  };

  for (const line of body) {
    const t = line.trim();
    if (/^##\s+/.test(t)) break;
    if (/^###\s+/.test(t)) {
      flush();
      heading = t.replace(/^###\s+/, "");
      current = [];
    } else if (current) {
      current.push(line);
    }
  }
  flush();

  return steps;
}

export function parseSitTestCase(markdown: string): SitTestCase {
  const lines = markdown.split("\n");
  const heading = lines.find((l) => /^#\s+TC\d/i.test(l.trim()))?.trim() || "# TC00 - Unknown";

  // Detect table-based variant (metadata as `| Attribute | Value |` table,
  // steps as `## TCxxxxx — Title` with an Action/Expected table).
  const hasAttrTable = lines.some((l) => /^\|\s*\*\*?(Module|Tester|Test Date|Status|Traceability)/i.test(l.trim()));
  const hasStepsHeading = lines.some((l) => /^##\s+Steps/i.test(l.trim()));
  if (hasAttrTable && !hasStepsHeading) {
    return parseTableSitTestCase(lines, heading);
  }

  const metaLines = sectionLines(lines, /^##\s+Metadata/i) ?? [];
  const metadata = parseMetadata(heading, metaLines);

  const stepsBody = sectionLines(lines, /^##\s+Steps/i, false);
  const steps = stepsBody ? parseSteps(stepsBody) : [];

  return { metadata, steps };
}

/** Table-based variant: metadata as `| Attribute | Value |`, each step as a
 *  `## TCxxxxx — Title` section holding a `| Step | Action | Expected Result |`
 *  table plus a `### Browser Coverage` platform table. */
function parseTableSitTestCase(lines: string[], heading: string): SitTestCase {
  const m = heading.match(/^#\s*(TC\d+)\s*[-—–:]?\s*(.*)$/i);
  const tcId = m ? m[1].toUpperCase() : "TC00";
  const title = m ? m[2].trim() : heading.replace(/^#\s*/, "").trim();

  const metadata: SitMetadata = {
    tcId,
    title,
    description: null,
    systemEnv: null,
    tester: null,
    location: null,
    date: null,
    progress: "Not Yet",
    status: "Not started",
  };

  // Parse `| Attribute | Value |` rows (up to the first step heading).
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l.startsWith("|")) continue;
    const cells = l.split("|").map((c) => c.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const key = cells[0]!.replace(/\*\*/g, "").trim();
    const value = cells.slice(1).join(" | ").trim();
    if (/^##\s+TC\d/i.test(lines[i + 1]?.trim() ?? "")) break;
    if (/^tester$/i.test(key)) metadata.tester = value === "—" ? null : value;
    else if (/^test\s*date$/i.test(key)) metadata.date = value === "—" ? null : value;
    else if (/^module$/i.test(key)) metadata.description = value;
    else if (/^status$/i.test(key)) metadata.status = parseStatus(null);
    else if (/^traceability$/i.test(key)) metadata.description = metadata.description ? `${metadata.description} | Trace: ${value}` : `Trace: ${value}`;
  }

  // Split into step blocks on `## TCxxxxx` headings.
  const steps: SitStep[] = [];
  let current: string[] | null = null;
  let heading2 = "";

  const flush = () => {
    if (!current) return;
    const hm = heading2.match(/^(TC\d+)\s*[-—–:]?\s*(.*)$/i);
    const code = hm ? hm[1].toUpperCase() : heading2;
    const stepTitle = hm ? hm[2].trim() : heading2;
    const typeTest: SitTestType = /negative|negatif/i.test(stepTitle) ? "Negative" : "Positive";

    // Action / Expected columns from `| Step | Action | Expected Result |`.
    const actions: string[] = [];
    const expecteds: string[] = [];
    let inStepTable = false;
    let browserLines: string[] = [];
    let inBrowser = false;
    for (const line of current) {
      const t = line.trim();
      if (/^###\s+Browser\s+Coverage/i.test(t)) { inBrowser = true; inStepTable = false; continue; }
      if (/^###\s/.test(t)) { inBrowser = false; inStepTable = false; continue; }
      if (inBrowser) { browserLines.push(line); continue; }
      if (/^\|.*Step\s*\|.*Expected/i.test(t)) { inStepTable = true; continue; }
      if (inStepTable) {
        if (/^\|\s*[-:|]+\s*\|/.test(t)) continue;
        const cells = t.split("|").map((c) => c.trim()).filter(Boolean);
        if (cells.length < 3) continue;
        const action = cells[1] || "";
        const expected = cells.slice(2).join(" | ").replace(/<br\s*\/?>/gi, "\n");
        if (action) actions.push(action);
        if (expected) expecteds.push(expected);
      }
    }

    // Browser platforms (Chrome/Firefox/Safari/Edge/Mobile) from the coverage table.
    const browserResults: SitBrowserResult[] = [];
    const platformRows = browserLines
      .map((l) => l.trim())
      .filter((l) => l.startsWith("|"))
      .map((l) => l.split("|").map((c) => c.trim()).filter(Boolean));
    const header = platformRows[0] ?? [];
    const bodyRows = platformRows.slice(1).filter((cells) => !cells.every((c) => /^[-:]+$/.test(c)));
    const body = bodyRows[0] ?? [];
    header.forEach((p, idx) => {
      if (idx === 0) return;
      const status = (body[idx] ?? "").includes("☐ Fail") ? "Not tested" : "Not started";
      browserResults.push({
        browser: normalizeBrowserName(p),
        tested: status,
        firstStatus: null,
        pic: null,
        firstDate: null,
        actualResult: null,
        lastStatus: null,
        lastDate: null,
        lastActual: null,
        evidence: null,
      });
    });
    if (browserResults.length === 0) {
      for (const b of DEFAULT_BROWSERS) {
        browserResults.push({ browser: b, tested: "Not started", firstStatus: null, pic: null, firstDate: null, actualResult: null, lastStatus: null, lastDate: null, lastActual: null, evidence: null });
      }
    }

    steps.push({
      no: steps.length + 1,
      code,
      menu: title,
      feature: stepTitle,
      userStory: "",
      steps: actions,
      dataInput: null,
      expected: expecteds.join("\n"),
      typeTest,
      tested: "Not started",
      bugRefs: [],
      browserResults,
      finalPic: null,
      finalResult: null,
      finalStatus: "Not started",
    });
    current = null;
  };

  for (const line of lines) {
    const t = line.trim();
    if (/^##\s+TC\d/i.test(t)) {
      flush();
      heading2 = t.replace(/^##\s+/, "");
      current = [];
    } else if (current) {
      current.push(line);
    }
  }
  flush();

  return { metadata, steps };
}

export function parseSitSummary(markdown: string): SitSummary {
  const lines = markdown.split("\n");
  const project = getField(lines, "Project") || "Unknown";
  const version = getField(lines, "Version") || "v1";
  const created = getField(lines, "Created") || new Date().toISOString().slice(0, 10);
  const testersStr = getField(lines, "Testers") || "";
  const testers = testersStr ? testersStr.split(/[,|;]/).map((t) => t.trim()).filter(Boolean) : [];

  const rows: SitSummaryRow[] = [];
  const summaryLines = sectionLines(lines, /^##\s+Summary/i) ?? [];
  const tableRows = summaryLines
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"))
    .map((l) => l.split("|").map((c) => c.trim()).filter(Boolean));
  const dataRows = tableRows.slice(1).filter((cells) => !cells.every((c) => /^[-:]+$/.test(c)));

  for (const cells of dataRows) {
    if (cells.length < 5) continue;
    rows.push({
      tcId: cells[0] || "",
      scenario: cells[1] || "",
      totalSteps: parseInt(cells[2], 10) || 0,
      tested: parseInt(cells[3], 10) || 0,
      passed: parseInt(cells[4], 10) || 0,
      failed: parseInt(cells[5], 10) || 0,
      progress: cells[6] || "Not Yet",
      status: cells[7] || "Not started",
      pic: cells[8] || "",
    });
  }

  const num = (key: string, def = 0): number => {
    const v = getField(lines, key);
    if (v === null) return def;
    const n = parseFloat(v);
    return Number.isNaN(n) ? def : n;
  };

  const overall = {
    totalTcGroups: num("Total TC Groups"),
    totalSteps: num("Total Steps"),
    totalPassed: num("Total Passed"),
    totalFailed: num("Total Failed"),
    readinessPercentage: num("Readiness"),
  };

  return { project, version, created, testers, overall, rows };
}

export function scanSitDirectory(rootPath: string): SitDataset {
  const dir = path.join(rootPath, "output", "sit");
  const files: SitFileEntry[] = [];
  let summary: SitSummary | null = null;

  if (!fs.existsSync(dir)) {
    return { files, summary };
  }

  const entries = fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort();

  for (const filename of entries) {
    if (filename.toLowerCase() === "sit_summary.md") {
      const content = fs.readFileSync(path.join(dir, filename), "utf-8");
      summary = parseSitSummary(content);
      continue;
    }

    const content = fs.readFileSync(path.join(dir, filename), "utf-8");
    const tc = parseSitTestCase(content);
    const passed = tc.steps.filter((s) => {
      if (s.finalResult === "Pass") return true;
      return s.browserResults.some((br) => /pass/i.test(br.lastStatus || br.firstStatus || ""));
    }).length;
    const failed = tc.steps.filter((s) => {
      if (s.finalResult === "Fail") return true;
      return s.browserResults.some((br) => /fail/i.test(br.lastStatus || br.firstStatus || ""));
    }).length;

    files.push({
      filename,
      relativePath: `output/sit/${filename}`,
      metadata: tc.metadata,
      stepCount: tc.steps.length,
      passedSteps: passed,
      failedSteps: failed,
    });
  }

  // Stats come from the actual TC files (source of truth), not the summary
  // file the agent wrote — the summary can be stale (e.g. total counts drift
  // when steps are added/removed after generation).
  const totalSteps = files.reduce((s, f) => s + f.stepCount, 0);
  const totalPassed = files.reduce((s, f) => s + f.passedSteps, 0);
  const totalFailed = files.reduce((s, f) => s + f.failedSteps, 0);
  const readiness = totalSteps > 0 ? Math.round((totalPassed / totalSteps) * 100) : 0;

  if (summary) {
    summary.overall = {
      totalTcGroups: files.length,
      totalSteps,
      totalPassed,
      totalFailed,
      readinessPercentage: readiness,
    };
    summary.rows = files.map((f) => ({
      tcId: f.metadata.tcId,
      scenario: f.metadata.title,
      totalSteps: f.stepCount,
      tested: f.passedSteps + f.failedSteps,
      passed: f.passedSteps,
      failed: f.failedSteps,
      progress: f.metadata.progress,
      status: f.metadata.status,
      pic: f.metadata.tester || "",
    }));
  } else if (files.length > 0) {
    summary = {
      project: files[0].metadata.title,
      version: "auto",
      created: new Date().toISOString().slice(0, 10),
      testers: [...new Set(files.map((f) => f.metadata.tester).filter(Boolean))] as string[],
      overall: {
        totalTcGroups: files.length,
        totalSteps,
        totalPassed,
        totalFailed,
        readinessPercentage: readiness,
      },
      rows: files.map((f) => ({
        tcId: f.metadata.tcId,
        scenario: f.metadata.title,
        totalSteps: f.stepCount,
        tested: f.passedSteps + f.failedSteps,
        passed: f.passedSteps,
        failed: f.failedSteps,
        progress: f.metadata.progress,
        status: f.metadata.status,
        pic: f.metadata.tester || "",
      })),
    };
  }

  return { files, summary };
}

export function toSitMarkdown(tc: SitTestCase): string {
  const { metadata, steps } = tc;
  const lines: string[] = [];

  lines.push(`# ${metadata.tcId} - ${metadata.title}\n`);
  lines.push(`## Metadata`);
  lines.push(`- **Test Case ID**: ${metadata.tcId}`);
  lines.push(`- **Title**: ${metadata.title}`);
  lines.push(`- **Description**: ${metadata.description || "-"}`);
  lines.push(`- **System Environment**: ${metadata.systemEnv || "-"}`);
  lines.push(`- **Tester**: ${metadata.tester || ""}`);
  lines.push(`- **Location**: ${metadata.location || ""}`);
  lines.push(`- **Date**: ${metadata.date || "-"}`);
  lines.push(`- **Overall Progress**: ${metadata.progress}`);
  lines.push(`- **Overall Status**: ${metadata.status}\n`);

  lines.push(`## Steps\n`);

  for (const step of steps) {
    lines.push(`### ${step.code} - ${step.menu} - ${step.feature}`);
    lines.push(`- **Feature**: ${step.feature}`);
    lines.push(`- **User Story**: ${step.userStory}`);
    lines.push(`- **Step**:`);
    for (let i = 0; i < step.steps.length; i++) {
      lines.push(`  ${i + 1}. ${step.steps[i]}`);
    }
    lines.push(`- **Data Input**: ${step.dataInput || "-"}`);
    lines.push(`- **Expected Result**:${step.expected ? `\n${indent(step.expected, "  ")}` : ""}`);
    lines.push(`- **Type**: ${step.typeTest}`);
    lines.push(`- **Tested**: ${step.tested}\n`);

    lines.push(`#### Browser Results`);
    lines.push(`| Browser/Device | Tested | First Status | PIC | First Date | Actual Result | Last Status | Last Date | Last Actual | Evidence |`);
    lines.push(`|---------------|--------|-------------|-----|-----------|--------------|------------|----------|------------|----------|`);
    for (const br of step.browserResults) {
      lines.push(`| ${br.browser} | ${br.tested || "-"} | ${br.firstStatus || "-"} | ${br.pic || "-"} | ${br.firstDate || "-"} | ${br.actualResult || "-"} | ${br.lastStatus || "-"} | ${br.lastDate || "-"} | ${br.lastActual || "-"} | ${br.evidence || "-"} |`);
    }
    lines.push("");

    lines.push(`- **Bug**: ${step.bugRefs.length > 0 ? step.bugRefs.join(", ") : "-"}`);
    lines.push(`- **Final PIC**: ${step.finalPic || "-"}`);
    lines.push(`- **Final Result**: ${step.finalResult || "-"}`);
    lines.push(`- **Final Status**: ${step.finalStatus || "Not started"}\n`);
  }

  return lines.join("\n");
}

function indent(text: string, pad: string): string {
  return text.split("\n").map((l) => pad + l).join("\n");
}

/** Map a table-header platform name to the standard SIT browser label. */
function normalizeBrowserName(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("mobile") || n.includes("android")) return "Android";
  if (n.includes("ios") || n.includes("iphone") || n.includes("ipad")) return "iOS";
  if (n.includes("chrome")) return "Desktop Chrome";
  if (n.includes("firefox")) return "Desktop Firefox";
  if (n.includes("safari")) return "Desktop Safari";
  if (n.includes("edge")) return "Microsoft Edge";
  return name;
}

/** True when the file uses the table-based variant (metadata as `| Attribute |
 *  Value |` table, steps as `## TCxxxxx` sections). */
function isTableFormat(markdown: string): boolean {
  const lines = markdown.split("\n");
  const hasAttrTable = lines.some((l) => /^\|\s*\*\*?(Module|Tester|Test Date|Status|Traceability)/i.test(l.trim()));
  const hasStepsHeading = lines.some((l) => /^##\s+Steps/i.test(l.trim()));
  return hasAttrTable && !hasStepsHeading;
}

/** Normalize a SIT markdown file to the STANDARD format. Deterministic — parses
 *  (which already handles both variants) then re-serializes as STANDARD via
 *  toSitMarkdown. No LLM, no token cost. */
export function normalizeSitFile(markdown: string): string {
  return toSitMarkdown(parseSitTestCase(markdown));
}

export type SitQualitySeverity = "error" | "warning" | "info";

export interface SitQualityIssue {
  file: string;
  severity: SitQualitySeverity;
  type:
    | "format-not-standard"
    | "empty-tester"
    | "missing-browser-matrix"
    | "short-expected"
    | "step-without-code"
    | "duplicate-step-code"
    | "summary-mismatch";
  message: string;
  stepCode?: string;
}

const MIN_EXPECTED_LEN = 50;

/** Audit every SIT file against quality rules. Reads files under rootPath. */
export function qualityCheckSit(rootPath: string, data: SitDataset): SitQualityIssue[] {
  const issues: SitQualityIssue[] = [];

  // Summary vs actual step counts (per row, then overall).
  if (data.summary) {
    const expectedByTc = new Map(data.summary.rows.map((r) => [r.tcId, r.totalSteps]));
    for (const f of data.files) {
      const expected = expectedByTc.get(f.metadata.tcId);
      if (expected !== undefined && expected !== f.stepCount) {
        issues.push({
          file: f.filename,
          severity: "warning",
          type: "summary-mismatch",
          message: `SIT_SUMMARY menyatakan ${expected} step tapi file punya ${f.stepCount}`,
        });
      }
    }
  }

  for (const f of data.files) {
    let content = "";
    try { content = fs.readFileSync(path.join(rootPath, f.relativePath), "utf-8"); } catch {}

    if (isTableFormat(content)) {
      issues.push({
        file: f.filename,
        severity: "warning",
        type: "format-not-standard",
        message: `Format non-standar (metadata/steps sebagai tabel) — jalankan Normalisasi`,
      });
    }

    if (!f.metadata.tester) {
      issues.push({
        file: f.filename,
        severity: "warning",
        type: "empty-tester",
        message: "Field Tester belum diisi",
      });
    }

    const tc = parseSitTestCase(content);
    const seenCodes = new Set<string>();
    for (const step of tc.steps) {
      if (!step.code) {
        issues.push({
          file: f.filename,
          severity: "error",
          type: "step-without-code",
          message: "Step tanpa kode (TCxxxxx)",
        });
      } else if (seenCodes.has(step.code)) {
        issues.push({
          file: f.filename,
          severity: "error",
          type: "duplicate-step-code",
          message: `Kode step duplikat: ${step.code}`,
          stepCode: step.code,
        });
      }
      seenCodes.add(step.code);

      if (step.browserResults.length === 0) {
        issues.push({
          file: f.filename,
          severity: "warning",
          type: "missing-browser-matrix",
          message: `${step.code} belum punya browser matrix`,
          stepCode: step.code,
        });
      }

      if (step.expected.length < MIN_EXPECTED_LEN) {
        issues.push({
          file: f.filename,
          severity: "info",
          type: "short-expected",
          message: `${step.code} Expected Result terlalu pendek (${step.expected.length} chars)`,
          stepCode: step.code,
        });
      }
    }
  }

  return issues;
}

/** Group issues into dashboard-friendly summary counts. */
export function summarizeIssues(issues: SitQualityIssue[]): {
  errors: number;
  warnings: number;
  infos: number;
  byType: Record<string, number>;
} {
  const byType: Record<string, number> = {};
  let errors = 0, warnings = 0, infos = 0;
  for (const i of issues) {
    byType[i.type] = (byType[i.type] ?? 0) + 1;
    if (i.severity === "error") errors++;
    else if (i.severity === "warning") warnings++;
    else infos++;
  }
  return { errors, warnings, infos, byType };
}
