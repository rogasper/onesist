/**
 * Shared human-facing task card formatter for external trackers (Monday Copy HTML,
 * Monday CSV export, and Monday MCP agent tools — #69).
 *
 * Guarantees one consistent, minimal shape across every output path and strips
 * Onesist-internal workspace paths, planner summary tables, duplicate card headings,
 * and agent handoff metadata (Files Scope, Spec Ref, ERD Ref, RTM Ref, Source).
 *
 * Agent-facing outputs (Copy Agent Prompt and handoff ZIP bundles) intentionally
 * do NOT use this formatter because executor agents need those internal fields.
 */
import { escapeHtml, htmlToPlainText, markdownToHtml } from "./rich-copy";
import { STATUS_LABELS, normalizeStatus } from "./task-status";

export interface ExternalTaskCardInput {
  code?: string | null;
  title: string;
  description?: string | null;
  status?: string | null;
  storyPoints?: number | null;
  assignee?: string | null;
  module?: string | null;
  phase?: string | null;
  dependencies?: string[] | null;
  dependenciesJson?: string | null;
  blocks?: string[] | null;
  blocksJson?: string | null;
  acceptanceCriteria?: string[] | null;
  acceptanceCriteriaJson?: string | null;
}

export type ExternalTaskFieldLabel = "Assignee" | "Status" | "Story Points" | "Depends On" | "Blocks";

export interface ExternalTaskCardField {
  label: ExternalTaskFieldLabel;
  value: string;
}

export interface ExternalTaskCard {
  /** Single canonical `{code}: {title}` heading without duplicated code prefix. */
  title: string;
  /** Phase or module used as Monday board Group (null when neither is set). */
  group: string | null;
  /** Minimal human-facing fields in canonical order, omitting empty/placeholder values. */
  fields: ExternalTaskCardField[];
  /** Sanitized markdown body before HTML conversion. */
  bodyMarkdown: string;
  /** Monday-friendly minimal HTML (heading + field table + sanitized body). */
  html: string;
  /** Plain-text fallback generated directly from `html` via `htmlToPlainText`. */
  text: string;
  /** Sanitized body HTML without the top heading and metadata table. */
  bodyHtml: string;
  /** Plain-text projection of `bodyHtml`. */
  bodyText: string;
}

const PLACEHOLDER_VALUE = /^(?:—|–|-+|n\/a|none|null|unassigned|belum diisi)$/i;

const PLANNER_META_KEYS = new Set([
  "service",
  "method",
  "status",
  "purpose",
  "story point",
  "story points",
  "sp",
  "duration",
  "durasi",
  "estimate",
  "estimasi",
  "developer",
  "assignee",
  "depends on",
  "dependencies",
  "dependency",
  "blocks",
  "critical",
  "critical path",
  "risk",
  "risk level",
  "priority",
  "module",
  "modul",
  "phase",
  "fase",
  "code",
  "task id",
  "layer",
  "type",
  "files scope",
  "file scope",
  "files to modify",
  "spec ref",
  "api spec ref",
  "erd ref",
  "rtm ref",
  "fsd ref",
  "source",
  "source path",
  "source file",
]);

const INTERNAL_META_KEYS = new Set([
  "files scope",
  "file scope",
  "files to modify",
  "spec ref",
  "api spec ref",
  "erd ref",
  "rtm ref",
  "fsd ref",
  "source",
  "source path",
  "source file",
]);

const PLANNER_HEADER_COL0 = new Set(["field", "attribute", "property", "key", "metadata", "info", "item", "properti", "atribut"]);
const PLANNER_HEADER_COL1 = new Set(["detail", "details", "value", "nilai", "keterangan", "info", "description", "deskripsi"]);

const INTERNAL_ONLY_SECTION_HEADINGS = new Set([
  "files scope",
  "file scope",
  "files to modify",
  "spec ref",
  "spec reference",
  "api spec ref",
  "erd ref",
  "erd reference",
  "rtm ref",
  "rtm reference",
  "internal references",
  "source",
  "source path",
]);

/** Canonical card headings that duplicate the top card title (`## Task ...`, `## FE-1: ...`, etc.). */
const DUPLICATE_TASK_HEADINGS = [
  /^#\s+Task\b/i,
  /^##\s+Task\s+[A-Za-z0-9._-]+\s*[:：—–-]\s*.*$/i,
  /^##\s+Task\s*[:：]\s*.+$/i,
  /^##\s+Task\s*(?:\\?\[?[A-Za-z]+\]?\s*)?[:：]\s*.+$/i,
  /^##\s+[A-Za-z]{1,12}-\d[\w.-]*\s*[:：—–-]\s*.+$/,
  /^###\s+\S+\s*[—–-]\s+/,
];

/**
 * Matches Onesist-internal workspace paths and artifact filenames while avoiding normal API
 * endpoints (e.g. `POST /api/v1/input/validate`) and external `https://...` URLs.
 */
const INTERNAL_ARTIFACT_SOURCE = [
  "/api/files/[^\\s)\"'`\\]>,;]+",
  "(?<![A-Za-z0-9_/:])(?:\\.\\.?/)*(?:output|input|\\.agents|prompts|handoff|context)/[A-Za-z0-9_./#@:%+-]+",
  "(?<![A-Za-z0-9_/:])(?:\\.\\.?/)+[A-Za-z0-9_./-]+\\.(?:md|dbml)(?:#[A-Za-z0-9_.:/%+-]+)?",
  "\\bMASTER_[A-Z0-9_]+\\.md(?:#[A-Za-z0-9_.:/%+-]+)?",
  "\\btasks?_[A-Za-z0-9._-]+\\.md(?:#[A-Za-z0-9_.:/%+-]+)?",
  "\\bspec_[A-Za-z0-9._-]+\\.md(?:#[A-Za-z0-9_.:/%+-]+)?",
  "\\berd_[A-Za-z0-9._-]+\\.(?:dbml|md)(?:#[A-Za-z0-9_.:/%+-]+)?",
  "\\bRTM_[A-Za-z0-9._-]+\\.md(?:#[A-Za-z0-9_.:/%+-]+)?",
  "\\b(?:SIT_SUMMARY|project_context)\\.md\\b",
  "\\b(?:tasks\\.json|data\\.db)\\b",
  "\\b[A-Za-z0-9._-]+\\.prompt\\.md\\b",
].join("|");

const INTERNAL_ARTIFACT_RE = new RegExp(INTERNAL_ARTIFACT_SOURCE, "gi");

/** Matches standalone metadata lines for internal handoff refs or duplicated card fields. */
const INTERNAL_META_LINE_RE =
  /^\s*(?:[-*+>]\s*)*(?:\*\*|__)?(?:files?\s+scope|files\s+to\s+modify|spec\s+ref|api\s+spec\s+ref|erd\s+ref|rtm\s+ref|fsd\s+ref|source(?:\s+path|\s+file)?)(?:\*\*|__)?\s*[:：]/i;

const DUPLICATE_META_LINE_RE =
  /^\s*(?:[-*+]\s+|(?:\*\*|__))(?:story\s*points?|sp|developer|assignee|depends\s+on|blocks|duration|critical\s+path|risk\s+level|code|module|phase)(?:\*\*|__)?\s*[:：]/i;

const PLANNER_CALLOUT_LINE_RE = /^\s*>\s*(?:\*\*|__)?planner\s*[:：]/i;

const PURE_INTERNAL_POINTER_LINE_RE =
  /^\s*(?:[-*+>]\s*)*\(?\s*(?:lihat|see|ref(?:erensi|erence)?|sumber|source|cek|check|baca|read|contoh(?:\s+lengkap)?)\b/i;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanString(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || PLACEHOLDER_VALUE.test(trimmed)) return null;
  return trimmed;
}

function parseList(list?: string[] | null, jsonStr?: string | null): string[] {
  let raw: unknown = list;
  if (!Array.isArray(raw) && jsonStr) {
    try {
      raw = JSON.parse(jsonStr);
    } catch {
      raw = [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => (typeof item === "string" ? cleanString(item) : null))
    .filter((item): item is string => Boolean(item));
}

function normalizeLabel(cell: string): string {
  return cell
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function splitTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || trimmed.length < 3) return null;
  const inner = trimmed.endsWith("|") ? trimmed.slice(1, -1) : trimmed.slice(1);
  return inner.split("|").map((c) => c.trim());
}

function isTableSeparator(cells: string[]): boolean {
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c.trim()));
}

function hasInternalArtifact(text: string): boolean {
  INTERNAL_ARTIFACT_RE.lastIndex = 0;
  return INTERNAL_ARTIFACT_RE.test(text);
}

function isPlannerSummaryTable(rows: string[][]): boolean {
  if (rows.length === 0) return false;
  const first = rows[0];
  const hasSep = rows.length >= 2 && isTableSeparator(rows[1]);

  // Compact horizontal metadata row: `| Depends On | — | Blocks | T2, T3 | Critical | Yes |`
  const dataRows = hasSep ? rows.slice(2) : rows;
  if (first.length >= 4 && first.length % 2 === 0 && !hasSep) {
    const allHorizontalMeta = rows.every((cells) => {
      if (cells.length < 4 || cells.length % 2 !== 0) return false;
      for (let c = 0; c < cells.length; c += 2) {
        if (!PLANNER_META_KEYS.has(normalizeLabel(cells[c]))) return false;
      }
      return true;
    });
    if (allHorizontalMeta) return true;
  }

  // Headerless 2-column metadata rows (e.g. `| Story Point | 3 |` / `| Developer | Rina |`).
  if (!hasSep) {
    return rows.every((cells) => cells.length === 2 && PLANNER_META_KEYS.has(normalizeLabel(cells[0])));
  }

  // Standard 2-column `| Field | Detail |` planner summary table.
  if (first.length === 2 && dataRows.length > 0) {
    const h0 = normalizeLabel(first[0]);
    const h1 = normalizeLabel(first[1]);
    const headerLooksLikeMeta = PLANNER_HEADER_COL0.has(h0) && PLANNER_HEADER_COL1.has(h1);
    const metaCount = dataRows.filter((cells) => cells.length >= 1 && PLANNER_META_KEYS.has(normalizeLabel(cells[0]))).length;
    const internalCount = dataRows.filter((cells) => cells.length >= 1 && INTERNAL_META_KEYS.has(normalizeLabel(cells[0]))).length;
    if (headerLooksLikeMeta && (metaCount * 2 >= dataRows.length || internalCount > 0)) return true;
    if (metaCount === dataRows.length && metaCount >= 2) return true;
  }

  return false;
}

function replaceLocalImages(line: string): string {
  return line.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt: string, rawSrc: string) => {
    const src = rawSrc.trim();
    const isExternalHttp = /^https?:\/\//i.test(src) && !hasInternalArtifact(src);
    if (isExternalHttp) return match;
    const label = alt.trim() || "tanpa judul";
    return `*[Gambar: ${label}]*`;
  });
}

function scrubInlineInternalArtifacts(line: string): string | null {
  let out = replaceLocalImages(line);

  if (!hasInternalArtifact(out)) return out;

  // Drop lines whose whole purpose is pointing the reader to an internal Onesist file.
  if (PURE_INTERNAL_POINTER_LINE_RE.test(out) && !/https?:\/\//i.test(out)) {
    return null;
  }

  // Convert markdown links `[label](internal-path)` -> keep non-filename, non-internal label, else drop.
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label: string, target: string) => {
    if (!hasInternalArtifact(target)) return match;
    const cleanLabel = label.replace(/[*_`~]/g, "").trim();
    if (!cleanLabel || hasInternalArtifact(cleanLabel) || /\.(?:md|dbml|json|ya?ml|sql|txt)$/i.test(cleanLabel)) {
      return "";
    }
    return label;
  });

  // Remove parenthetical remarks that mention internal files, e.g. `(lihat input/fsd/foo.md)`.
  out = out.replace(/\s*\([^()]*\)/g, (paren) => (hasInternalArtifact(paren) ? "" : paren));

  // Remove bold/italic-wrapped internal code spans first so empty `****` markers aren't left behind.
  out = out.replace(/(?:\*\*|__)\s*`[^`]+`\s*(?:\*\*|__)/g, (span) => (hasInternalArtifact(span) ? "" : span));

  // Remove backticked code spans containing an internal path/artifact (including trailing `#NO:3 POST /loans`).
  out = out.replace(/`[^`]+`/g, (span) => (hasInternalArtifact(span) ? "" : span));

  // Remove any remaining bare internal path/artifact tokens.
  out = out.replace(INTERNAL_ARTIFACT_RE, "");

  // Clean up empty emphasis markers and dangling connectors/prepositions left behind after stripping.
  out = out
    .replace(/\*\*\s*\*\*|__\s*__/g, "")
    .replace(/(^|[\s(\[])(\*\*|__)[ \t]+(?=\S)/g, "$1$2")
    .replace(/(?<=\S)[ \t]+(\*\*|__)(?=$|[\s.,;:)\]])/g, "$1")
    .replace(/\b(?:ref|referensi|sumber|source|lihat|see)\s*[:：]?\s*(?=[.,;)\]]|$)/gi, "")
    .replace(/\b(?:di|pada|dari|sesuai|selaras|sama\s+dengan|dan|in|from|at)\s+(?:file|berkas\s+)?(?=[.,;)\]]|$)/gi, "")
    .replace(/\s+[—–-]\s*(?=[.,;)\]]|$)/g, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\[\s*\]/g, (m, offset, str) => {
      // Preserve GFM task list checkboxes `- [ ]` at the start of a list item.
      const before = str.slice(0, offset);
      return /^\s*[-*+]\s+$/.test(before) ? m : "";
    })
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .trimEnd();

  // If stripping left only a bullet/quote marker or empty punctuation, drop the line.
  const remainder = out
    .replace(/^\s*(?:[-*+>]\s*|\d+\.\s*)/, "")
    .replace(/[*_`()[\].,;:—–\-\s]/g, "")
    .trim();
  if (!remainder) return null;

  return out;
}

function sanitizeTableBlock(tableLines: string[]): string[] {
  const parsed = tableLines.map((l) => splitTableRow(l)).filter((r): r is string[] => r !== null);
  if (parsed.length !== tableLines.length) return tableLines;
  if (isPlannerSummaryTable(parsed)) return [];

  const hasSep = parsed.length >= 2 && isTableSeparator(parsed[1]);
  const headerLines = hasSep ? tableLines.slice(0, 2) : [];
  const dataLines = hasSep ? tableLines.slice(2) : tableLines;

  const keptData: string[] = [];
  for (const line of dataLines) {
    const cells = splitTableRow(line);
    if (!cells) continue;
    const firstKey = normalizeLabel(cells[0] ?? "");
    if (INTERNAL_META_KEYS.has(firstKey)) continue;

    let droppedRow = false;
    const cleanedCells = cells.map((cell) => {
      const cleaned = scrubInlineInternalArtifacts(cell);
      if (cleaned === null) return "";
      return cleaned.trim();
    });
    if (cleanedCells.every((c) => !c)) droppedRow = true;
    // If a 2-column reference row lost its entire value after scrubbing internal paths, drop it.
    if (cells.length === 2 && cells[1].trim() && !cleanedCells[1]) droppedRow = true;
    if (!droppedRow) {
      keptData.push(`| ${cleanedCells.join(" | ")} |`);
    }
  }

  if (keptData.length === 0) return [];
  return [...headerLines, ...keptData];
}

function isLeadingDuplicateHeading(line: string, code: string, displayTitle: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.startsWith("#")) return false;
  if (DUPLICATE_TASK_HEADINGS.some((re) => re.test(trimmed))) return true;

  const headingText = trimmed.replace(/^#{1,6}\s+/, "").trim();
  if (code && headingText.toLowerCase().includes(code.toLowerCase())) return true;
  if (displayTitle && headingText.toLowerCase() === displayTitle.toLowerCase()) return true;
  return false;
}

function dropOrphanedHeadings(lines: string[]): string[] {
  const result = [...lines];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < result.length; i++) {
      const m = result[i].match(/^(#{1,6})\s+\S/);
      if (!m) continue;
      const level = m[1].length;
      let j = i + 1;
      while (j < result.length && result[j].trim() === "") j++;
      if (j >= result.length) {
        result.splice(i, 1);
        changed = true;
        break;
      }
      const nextHeading = result[j].match(/^(#{1,6})\s+\S/);
      if (nextHeading && nextHeading[1].length <= level) {
        result.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return result;
}

/** Formats `{code}: {title}` once, stripping duplicated code prefixes and inline markdown backticks. */
export function formatExternalTaskTitle(code?: string | null, rawTitle?: string | null): string {
  const cleanCode = (code ?? "").trim();
  const titleText = (rawTitle ?? "").replace(/`([^`]+)`/g, "$1").trim();
  if (!cleanCode) return titleText || "Untitled Task";
  const prefixRe = new RegExp(`^(?:Task\\s+)?${escapeRegExp(cleanCode)}\\s*[:：—–-]\\s*`, "i");
  const stripped = titleText.replace(prefixRe, "").trim();
  return stripped ? `${cleanCode}: ${stripped}` : cleanCode;
}

/**
 * Removes duplicate task headings, planner summary tables, internal handoff metadata lines,
 * local workspace image paths, and Onesist artifact references from task markdown.
 */
export function sanitizeExternalTaskMarkdown(
  markdown: string,
  opts: { code?: string | null; displayTitle?: string | null } = {},
): string {
  const normalized = markdown.replace(/\r\n?/g, "\n");
  const rawLines = normalized.split("\n");
  const code = (opts.code ?? "").trim();
  const displayTitle = (opts.displayTitle ?? "").trim();

  // Drop leading blank lines and any leading duplicate card heading.
  let idx = 0;
  while (idx < rawLines.length && rawLines[idx].trim() === "") idx++;
  if (idx < rawLines.length && isLeadingDuplicateHeading(rawLines[idx], code, displayTitle)) {
    idx++;
  }

  const out: string[] = [];
  let inFence = false;
  let fenceChar = "";
  let skipSectionLevel: number | null = null;

  for (let i = idx; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmed = line.trim();

    // Track fenced code blocks so SQL/JSON/HTTP/Mermaid snippets stay intact.
    const fenceMatch = trimmed.match(/^(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!inFence) {
        if (skipSectionLevel !== null) {
          inFence = true;
          fenceChar = fenceMatch[1][0];
          continue;
        }
        inFence = true;
        fenceChar = fenceMatch[1][0];
        out.push(line);
        continue;
      }
      if (fenceMatch[1][0] === fenceChar) {
        inFence = false;
        fenceChar = "";
        if (skipSectionLevel === null) out.push(line);
        continue;
      }
    }

    if (inFence) {
      if (skipSectionLevel === null) out.push(line);
      continue;
    }

    // Handle headings (and skipping internal-only sections like `### Files Scope`).
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = normalizeLabel(headingMatch[2]);
      if (skipSectionLevel !== null && level <= skipSectionLevel) {
        skipSectionLevel = null;
      }
      if (skipSectionLevel !== null) continue;
      if (INTERNAL_ONLY_SECTION_HEADINGS.has(headingText)) {
        skipSectionLevel = level;
        continue;
      }
      // Drop any inline duplicate `## Task ...` heading that somehow appeared after metadata.
      if (out.every((l) => l.trim() === "") && isLeadingDuplicateHeading(line, code, displayTitle)) {
        continue;
      }
      const cleanedHeading = scrubInlineInternalArtifacts(line);
      if (cleanedHeading && /^#{1,6}\s+\S/.test(cleanedHeading)) {
        out.push(cleanedHeading);
      }
      continue;
    }

    if (skipSectionLevel !== null) continue;

    // Collect contiguous pipe-table blocks and filter planner tables / leaky rows.
    if (trimmed.startsWith("|")) {
      const tableLines: string[] = [line];
      while (i + 1 < rawLines.length && rawLines[i + 1].trim().startsWith("|")) {
        i++;
        tableLines.push(rawLines[i]);
      }
      const cleanedTable = sanitizeTableBlock(tableLines);
      if (cleanedTable.length > 0) out.push(...cleanedTable);
      continue;
    }

    // Drop standalone internal-ref metadata lines and planner callouts.
    if (INTERNAL_META_LINE_RE.test(line) || DUPLICATE_META_LINE_RE.test(line) || PLANNER_CALLOUT_LINE_RE.test(line)) {
      continue;
    }

    // Scrub local images and inline Onesist workspace paths.
    const cleaned = scrubInlineInternalArtifacts(line);
    if (cleaned !== null) out.push(cleaned);
  }

  const trimmedLines = dropOrphanedHeadings(out);
  const HR_LINE_RE = /^\s*(?:[-*_]\s*){3,}$/;
  while (trimmedLines.length > 0 && (trimmedLines[0].trim() === "" || HR_LINE_RE.test(trimmedLines[0]))) {
    trimmedLines.shift();
  }
  while (
    trimmedLines.length > 0 &&
    (trimmedLines[trimmedLines.length - 1].trim() === "" || HR_LINE_RE.test(trimmedLines[trimmedLines.length - 1]))
  ) {
    trimmedLines.pop();
  }

  return trimmedLines
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Formats a task into the single external Monday-friendly card used across Copy HTML,
 * Monday CSV export, and Monday MCP agent tools.
 */
export function formatExternalTaskCard(task: ExternalTaskCardInput): ExternalTaskCard {
  const code = (task.code ?? "").trim();
  const title = formatExternalTaskTitle(code, task.title);
  const displayTitle = code && title.startsWith(`${code}:`) ? title.slice(code.length + 1).trim() : title;
  const group = cleanString(task.phase) ?? cleanString(task.module) ?? null;

  const assignee = cleanString(task.assignee);
  const statusRaw = cleanString(task.status);
  const statusLabel = statusRaw ? STATUS_LABELS[normalizeStatus(statusRaw)] ?? statusRaw : null;
  const storyPoints =
    typeof task.storyPoints === "number" && Number.isFinite(task.storyPoints) ? `${task.storyPoints} SP` : null;
  const deps = parseList(task.dependencies, task.dependenciesJson);
  const blocks = parseList(task.blocks, task.blocksJson);
  const ac = parseList(task.acceptanceCriteria, task.acceptanceCriteriaJson);

  const fields: ExternalTaskCardField[] = [];
  if (assignee) fields.push({ label: "Assignee", value: assignee });
  if (statusLabel) fields.push({ label: "Status", value: statusLabel });
  if (storyPoints) fields.push({ label: "Story Points", value: storyPoints });
  if (deps.length > 0) fields.push({ label: "Depends On", value: deps.join(", ") });
  if (blocks.length > 0) fields.push({ label: "Blocks", value: blocks.join(", ") });

  let bodyMarkdown = sanitizeExternalTaskMarkdown(task.description ?? "", { code, displayTitle });

  // If acceptance criteria exist on the task record but are missing from the sanitized body,
  // include them as a standard GFM checklist so Monday gets actionable criteria.
  if (ac.length > 0 && !/^#{1,6}\s+acceptance\s+criteria\b/im.test(bodyMarkdown)) {
    const cleanAc = ac
      .map((item) => scrubInlineInternalArtifacts(item)?.trim())
      .filter((item): item is string => Boolean(item));
    if (cleanAc.length > 0) {
      const checklist = `### Acceptance Criteria\n${cleanAc.map((item) => `- [ ] ${item}`).join("\n")}`;
      bodyMarkdown = bodyMarkdown ? `${bodyMarkdown}\n\n${checklist}` : checklist;
    }
  }

  const fieldsHtml =
    fields.length > 0
      ? `<table border="1" style="border-collapse:collapse"><tbody>${fields
          .map(
            (f) =>
              `<tr><td style="padding:4px 8px;text-align:left"><strong>${escapeHtml(f.label)}</strong></td><td style="padding:4px 8px;text-align:left">${escapeHtml(f.value)}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : "";

  const bodyHtml = bodyMarkdown ? markdownToHtml(bodyMarkdown) : "";
  const html = `<h2>${escapeHtml(title)}</h2>${fieldsHtml}${bodyHtml}`;
  const text = htmlToPlainText(html);
  const bodyText = htmlToPlainText(bodyHtml);

  return {
    title,
    group,
    fields,
    bodyMarkdown,
    html,
    text,
    bodyHtml,
    bodyText,
  };
}

/**
 * Checks rendered output (HTML or plain text) for leaked Onesist-internal paths, artifact
 * filenames, or agent-only handoff field labels. Used in tests as a regression guard.
 */
export function findInternalTaskLeaks(output: string): string[] {
  const leaks: string[] = [];
  const artifactMatches = output.match(new RegExp(INTERNAL_ARTIFACT_SOURCE, "gi"));
  if (artifactMatches) leaks.push(...artifactMatches);

  const labelMatches = output.match(/\b(?:Files\s+Scope|Spec\s+Ref|ERD\s+Ref|RTM\s+Ref)\b/gi);
  if (labelMatches) leaks.push(...labelMatches);

  // `Source` as a metadata table row or `Source:` label (not normal words like "open source").
  if (/<td[^>]*>\s*<strong>Source<\/strong>\s*<\/td>/i.test(output) || /^\s*(?:[-*]\s*)?Source\s*[:：]/im.test(output)) {
    leaks.push("Source");
  }
  return [...new Set(leaks)];
}
