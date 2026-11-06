/**
 * Surgical DBML text edits.
 *
 * The canvas must write changes back into the artifact WITHOUT rewriting the
 * parts it did not touch. Re-serialising the parsed model (`serializeDbmlDocument`)
 * is lossy on real agent output: it drops `//` comments, index `name:` settings,
 * `TableGroup`, and normalises notes/defaults. The schema in `output/erd/*.md`
 * carries all of those, so every operation here edits character ranges in the
 * original text and leaves everything else byte-identical:
 *
 *   - setColumnRef      replaces or appends the column's relation
 *   - addTableToDbml    inserts a new `Table … { }` block before the refs/notes
 *   - removeTableFromDbml removes the block, its top-level refs, inline refs to
 *     it, and its `Note <table>:` lines
 *   - updateTableInDbml rewrites only the columns that changed, keeping the raw
 *     line of every untouched column (comment and unknown settings included)
 *
 * Scanning is quote- and comment-aware so braces inside `default: \`now()\``,
 * notes, or `// {` never shift the block structure.
 */
import type { ColumnDef, TableDef } from "~/lib/dbml";

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_$]*$/;

function formatIdent(name: string): string {
  return IDENT_RE.test(name) ? name : `"${name.replace(/"/g, '\\"')}"`;
}

function formatQualified(name: string): string {
  return name.split(".").map(formatIdent).join(".");
}

function quoteNote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function isQuote(ch: string): boolean {
  return ch === '"' || ch === "'" || ch === "`";
}

/** Split a settings list on top-level commas (quote/bracket aware). */
function splitSettings(input: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      current += ch;
      if (ch === "\\" && i + 1 < input.length) {
        current += input[i + 1];
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (isQuote(ch)) {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

interface Line {
  text: string;
  /** Offset of the first character. */
  start: number;
  /** Offset just past the line's characters (before its newline). */
  end: number;
  /** Offset just past the newline (or == end at EOF). */
  next: number;
  /** Brace depth at the start of this line. */
  depth: number;
  /** Brace depth after this line. */
  depthAfter: number;
}

interface Doc {
  text: string;
  lines: Line[];
}

/** Character scan that ignores quotes, `//` and block comments. */
function scanDoc(text: string): Doc {
  const lines: Line[] = [];
  let i = 0;
  let depth = 0;
  let inBlockComment = false;

  while (i <= text.length) {
    const lineStart = i;
    let j = i;
    while (j < text.length && text[j] !== "\n") j += 1;
    // Trim a trailing \r so CRLF files keep working.
    let lineEnd = j;
    if (lineEnd > lineStart && text[lineEnd - 1] === "\r") lineEnd -= 1;
    const next = j < text.length ? j + 1 : j;
    const raw = text.slice(lineStart, lineEnd);

    const depthBefore = depth;
    let quote: string | null = null;
    let k = 0;
    while (k < raw.length) {
      const ch = raw[k];
      if (inBlockComment) {
        if (ch === "*" && raw[k + 1] === "/") {
          inBlockComment = false;
          k += 2;
          continue;
        }
        k += 1;
        continue;
      }
      if (quote) {
        if (ch === "\\") {
          k += 2;
          continue;
        }
        if (ch === quote) quote = null;
        k += 1;
        continue;
      }
      if (ch === "/" && raw[k + 1] === "/") break;
      if (ch === "/" && raw[k + 1] === "*") {
        inBlockComment = true;
        k += 2;
        continue;
      }
      if (isQuote(ch)) {
        quote = ch;
        k += 1;
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") depth = Math.max(0, depth - 1);
      k += 1;
    }

    lines.push({ text: raw, start: lineStart, end: lineEnd, next, depth: depthBefore, depthAfter: depth });
    if (j >= text.length) break;
    i = next;
  }

  return { text, lines };
}

/** `Table public.users as u [headercolor: #3498DB]` → `public.users` */
function parseTableHeader(text: string): { name: string; alias: string | null } | null {
  const m = /^\s*Table\s+(.+?)\s*(\bas\s+(.+?))?\s*(\[[^\]]*\])?\s*\{/.exec(text);
  if (!m) return null;
  const raw = m[1].trim();
  const name = raw.replace(/^["'`]|["'`]$/g, "");
  const alias = m[3] ? m[3].trim().replace(/^["'`]|["'`]$/g, "") : null;
  return { name, alias };
}

interface Block {
  startLine: number;
  endLine: number;
  /** Char offsets of the whole block, newline of the last line excluded. */
  start: number;
  end: number;
  name: string | null;
}

function topLevelBlocks(doc: Doc): { tables: Block[]; refs: Block[]; notes: Block[]; enums: Block[] } {
  const tables: Block[] = [];
  const refs: Block[] = [];
  const notes: Block[] = [];
  const enums: Block[] = [];
  const lines = doc.lines;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.depth !== 0) continue;
    const trimmed = line.text.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;

    const isMultiLine = line.depthAfter > 0;
    let endLine = i;
    if (isMultiLine) {
      let j = i + 1;
      while (j < lines.length && lines[j].depthAfter > 0) j += 1;
      if (j < lines.length) endLine = j;
    }
    const block: Block = {
      startLine: i,
      endLine,
      start: lines[i].start,
      end: lines[endLine].end,
      name: null,
    };

    if (/^Table\b/.test(trimmed)) {
      block.name = parseTableHeader(trimmed)?.name ?? null;
      tables.push(block);
      i = endLine;
      continue;
    }
    if (/^Ref\b/.test(trimmed)) {
      refs.push(block);
      i = endLine;
      continue;
    }
    if (/^Note\b/.test(trimmed)) {
      block.name = /^\s*Note\s+([^\s:]+)\s*:/.exec(line.text)?.[1] ?? null;
      notes.push(block);
      i = endLine;
      continue;
    }
    if (/^Enum\b/.test(trimmed)) {
      enums.push(block);
      i = endLine;
      continue;
    }
    i = endLine;
  }

  return { tables, refs, notes, enums };
}

interface ColumnSpan {
  /** Parsed column name. */
  name: string;
  startLine: number;
  endLine: number;
  start: number;
  end: number;
  /** Raw text of the whole span (may hold multi-line settings). */
  raw: string;
}

/** Column spans inside a table block (depth 1 relative to the document). */
function columnSpans(doc: Doc, block: Block): ColumnSpan[] {
  const spans: ColumnSpan[] = [];
  const lines = doc.lines;
  const bodyStart = block.startLine + 1;
  const bodyEnd = block.endLine;

  for (let i = bodyStart; i < bodyEnd; i += 1) {
    const line = lines[i];
    if (line.depth !== 1) continue;
    const trimmed = line.text.trim();
    if (!trimmed || trimmed.startsWith("//")) continue;
    if (/^(indexes|Note)\b/.test(trimmed)) continue;

    const header = /^\s*(["'`][^"'`]+["'`]|[A-Za-z_][A-Za-z0-9_$]*)\s+\S/.exec(line.text);
    if (!header) continue;
    const name = header[1].replace(/^["'`]|["'`]$/g, "");

    // A column's settings may span lines; follow the bracket depth.
    let endLine = i;
    let bracketDepth = 0;
    for (let j = i; j < bodyEnd; j += 1) {
      for (const ch of lines[j].text) {
        if (ch === "[") bracketDepth += 1;
        else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
      }
      endLine = j;
      if (bracketDepth === 0) break;
    }

    spans.push({
      name,
      startLine: i,
      endLine,
      start: lines[i].start,
      end: lines[endLine].end,
      raw: lines.slice(i, endLine + 1).map((l) => l.text).join("\n"),
    });
    i = endLine;
  }

  return spans;
}

interface ColumnParts {
  name: string;
  type: string;
  settings: string[];
}

function parseColumnRaw(raw: string): ColumnParts {
  const flat = raw.replace(/\s*\n\s*/g, " ").trim();
  const open = flat.lastIndexOf("[");
  const close = flat.lastIndexOf("]");
  const hasSettings = open > -1 && close > open;
  const head = (hasSettings ? flat.slice(0, open) : flat).trim();
  const settings = hasSettings ? splitSettings(flat.slice(open + 1, close)) : [];

  const m = /^(["'`][^"'`]+["'`]|\S+)\s+([\s\S]+)$/.exec(head);
  if (!m) return { name: head, type: "", settings };
  return {
    name: m[1].replace(/^["'`]|["'`]$/g, ""),
    type: m[2].trim(),
    settings,
  };
}

const KNOWN_SETTING = /^(pk|primary\s+key|unique|not\s+null|null|default\s*:|note\s*:|ref\s*:)/i;

/** Known settings from a column definition, in the order dbdiagram renders them. */
function knownSettings(col: ColumnDef): string[] {
  const out: string[] = [];
  if (col.isPk) out.push("pk");
  if (col.isUnique) out.push("unique");
  if (col.isNotNull) out.push("not null");
  if (col.defaultValue) out.push(`default: ${col.defaultValue}`);
  if (col.note) out.push(`note: ${quoteNote(col.note)}`);
  if (col.ref) {
    out.push(`ref: ${col.ref.relation ?? ">"} ${formatQualified(col.ref.table)}.${formatIdent(col.ref.column)}`);
  }
  return out;
}

/**
 * Rebuild a column line from its definition, keeping settings we do not model
 * (index names, `headercolor`, dbdiagram extensions) that were on the old line.
 *
 * `inlineRef` says whether this file states the column's relation inside the
 * column (`[ref: > t.c]`) or with a standalone `Ref:` line. Re-emitting an
 * inline ref for a file that uses the standalone form would state the same
 * relation twice — the parser then sees two sources of truth for one edge.
 */
function renderColumn(col: ColumnDef, preserve: string[], inlineRef = true): string {
  const unknowns = preserve.filter((s) => !KNOWN_SETTING.test(s.trim()));
  const known = inlineRef ? knownSettings(col) : knownSettings(col).filter((s) => !/^ref\s*:/i.test(s));
  const settings = [...known, ...unknowns];
  const suffix = settings.length > 0 ? ` [${settings.join(", ")}]` : "";
  return `  ${formatIdent(col.name)} ${col.type || "varchar"}${suffix}`;
}

function applyEdits(text: string, edits: { start: number; end: number; text: string }[]): string {
  const ordered = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  for (const edit of ordered) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return out;
}

/** Offset just past a block's last line, newline included. */
function afterBlock(doc: Doc, block: Block): number {
  const line = doc.lines[block.endLine];
  return line.next > line.end ? line.next : line.end;
}

/**
 * Where a new table or ref goes: after the last block of `prefer`, else before
 * the first note/enum (so notes stay at the bottom), else at the end.
 */
function insertionPoint(doc: Doc, prefer: Block[]): number {
  if (prefer.length > 0) return afterBlock(doc, prefer[prefer.length - 1]);
  const { refs, notes, enums } = topLevelBlocks(doc);
  // A ref/table section that does not exist yet: keep notes and enums last.
  const first = [...refs, ...notes, ...enums].sort((a, b) => a.start - b.start)[0];
  return first ? first.start : doc.text.length;
}

/**
 * Point a column at another column. This is the canvas drag: it REPLACES the
 * column's existing relation (inline `[ref: > …]` or a top-level `Ref:` that
 * starts at that column) instead of adding a second, conflicting one, and only
 * appends a fresh `Ref:` line when the column had none.
 */
export function setColumnRef(
  dbml: string,
  spec: { from: { table: string; column: string }; to: { table: string; column: string }; relation?: string },
): string {
  const doc = scanDoc(dbml);
  const { tables, refs } = topLevelBlocks(doc);
  const relation = spec.relation ?? ">";
  const target = `${formatQualified(spec.to.table)}.${formatIdent(spec.to.column)}`;

  // Only a column that already carries an inline ref is rewritten inline; a
  // column with no ref gets a top-level line, which is the file's own style and
  // keeps the column line (and its comment) untouched.
  const sourceTable = tables.find((t) => t.name === spec.from.table);
  const span = sourceTable ? columnSpans(doc, sourceTable).find((c) => c.name === spec.from.column) : undefined;
  const parts = span ? parseColumnRaw(span.raw) : null;
  if (span && parts?.settings.some((setting) => /^ref\s*:/i.test(setting))) {
    const others = parts.settings.filter((setting) => !/^ref\s*:/i.test(setting));
    const settings = [...others, `ref: ${relation} ${target}`];
    return applyEdits(dbml, [
      {
        start: span.start,
        end: span.end,
        text: `  ${formatIdent(parts.name)} ${parts.type} [${settings.join(", ")}]`,
      },
    ]);
  }

  // A top-level `Ref:` that starts at this column is the same relation in
  // another spelling — rewrite that line in place.
  const fromName = `${formatQualified(spec.from.table)}.${formatIdent(spec.from.column)}`;
  for (const ref of refs) {
    const line = doc.lines[ref.endLine];
    const statement = dbml.slice(ref.start, line.end);
    const parsed = /^\s*Ref\s*:\s*([^\s]+)\s*([<>-]+)/.exec(statement);
    if (!parsed) continue;
    const from = parsed[1].replace(/^["'`]|["'`]$/g, "");
    if (from === fromName.replace(/^["'`]|["'`]$/g, "")) {
      return applyEdits(dbml, [
        { start: ref.start, end: line.end, text: `Ref: ${fromName} ${relation} ${target}` },
      ]);
    }
  }

  const statement = `Ref: ${fromName} ${relation} ${target}`;
  const at = insertionPoint(doc, refs.length > 0 ? refs : tables);
  const before = dbml.slice(0, at);
  const after = dbml.slice(at);
  const prefix = before.length === 0 || before.endsWith("\n") ? "" : "\n";
  const suffix = after.length === 0 || after.startsWith("\n") ? "" : "\n";
  return `${before}${prefix}${statement}\n${suffix}${after}`;
}

/** Insert a new table block (name + initial columns). */
export function addTableToDbml(dbml: string, table: TableDef): string {
  const doc = scanDoc(dbml);
  const { tables } = topLevelBlocks(doc);
  const header = `Table ${formatQualified(table.name)}${table.alias ? ` as ${formatIdent(table.alias)}` : ""} {`;
  const body = table.columns.map((c) => renderColumn(c, [])).join("\n");
  const block = `${header}\n${body}\n}`;
  const at = insertionPoint(doc, tables);
  const before = dbml.slice(0, at);
  const after = dbml.slice(at);
  // Keep a blank line between table blocks, the way the artifact is written.
  const prefix =
    before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix = after.length === 0 ? "\n" : after.startsWith("\n") ? "" : "\n";
  return `${before}${prefix}${block}${suffix}${after}`;
}

/** Remove a table plus every reference to it (top-level, inline, and its Note). */
export function removeTableFromDbml(dbml: string, tableName: string): string {
  const doc = scanDoc(dbml);
  const { tables, refs, notes } = topLevelBlocks(doc);
  const target = tables.find((t) => t.name === tableName);
  if (!target) return dbml;

  const edits: { start: number; end: number; text: string }[] = [];

  // The table block, together with its trailing newline.
  const blockLine = doc.lines[target.endLine];
  const blockEnd = blockLine.next > blockLine.end ? blockLine.next : blockLine.end;
  edits.push({ start: target.start, end: blockEnd, text: "" });

  // Top-level Ref statements that touch the table.
  const escaped = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tableRef = new RegExp(`(^|[\\s.])["'\`]?${escaped}["'\`]?\\s*\\.`, "m");
  for (const ref of refs) {
    const line = doc.lines[ref.endLine];
    const end = line.next > line.end ? line.next : line.end;
    const statement = dbml.slice(ref.start, line.end);
    if (tableRef.test(statement)) edits.push({ start: ref.start, end, text: "" });
  }

  // `Note <table>: '…'`
  for (const note of notes) {
    if (note.name && note.name.replace(/^["'`]|["'`]$/g, "") === tableName) {
      const line = doc.lines[note.endLine];
      const end = line.next > line.end ? line.next : line.end;
      edits.push({ start: note.start, end, text: "" });
    }
  }

  // Inline `ref: > <table>.<col>` on other tables' columns.
  for (const table of tables) {
    if (table.name === tableName) continue;
    for (const span of columnSpans(doc, table)) {
      const parts = parseColumnRaw(span.raw);
      const refSetting = parts.settings.find((s) => /^ref\s*:/i.test(s));
      if (!refSetting) continue;
      const match = /ref\s*:\s*[<>-]?\s*([^\s.]+)\s*\./.exec(refSetting);
      if (!match) continue;
      const referenced = match[1].replace(/^["'`]|["'`]$/g, "");
      if (referenced !== tableName) continue;
      const rest = parts.settings.filter((s) => !/^ref\s*:/i.test(s));
      const keep = rest.length > 0 ? ` [${rest.join(", ")}]` : "";
      edits.push({
        start: span.start,
        end: span.end,
        text: `  ${formatIdent(parts.name)} ${parts.type}${keep}`,
      });
    }
  }

  return applyEdits(dbml, edits);
}

/**
 * Sync one table's edits into the text: only changed columns are rewritten,
 * removed ones are dropped, new ones are appended. Untouched column lines (with
 * their comments and unknown settings) stay byte-identical.
 */
export function updateTableInDbml(dbml: string, prev: TableDef, next: TableDef): string {
  const doc = scanDoc(dbml);
  const { tables } = topLevelBlocks(doc);
  const target = tables.find((t) => t.name === prev.name);
  if (!target) return dbml;

  const edits: { start: number; end: number; text: string }[] = [];
  const spans = columnSpans(doc, target);

  // Header rename/alias change.
  if (prev.name !== next.name || (prev.alias ?? null) !== (next.alias ?? null)) {
    const headerLine = doc.lines[target.startLine];
    const headerText = `Table ${formatQualified(next.name)}${next.alias ? ` as ${formatIdent(next.alias)}` : ""} {`;
    const rest = headerLine.text.replace(/^\s*Table\b[^{]*/, "").trimStart();
    edits.push({
      start: headerLine.start,
      end: headerLine.end,
      text: `${headerText}${rest.startsWith("}") ? " " : rest ? ` ${rest}` : ""}`.trimEnd(),
    });
  }

  const used = new Set<number>();
  const appended: ColumnDef[] = [];

  next.columns.forEach((col, idx) => {
    let matchIndex = spans.findIndex((s, i) => !used.has(i) && s.name === col.name);
    // A rename shows up as "no column with this name": pair it positionally so
    // the line is rewritten in place instead of moved to the end.
    if (matchIndex === -1 && spans[idx] && !used.has(idx)) matchIndex = idx;
    if (matchIndex === -1) {
      appended.push(col);
      return;
    }
    used.add(matchIndex);
    const span = spans[matchIndex];
    const prevCol = prev.columns.find((c) => c.name === span.name);
    if (prevCol && JSON.stringify(prevCol) === JSON.stringify(col)) return; // untouched → keep the raw line
    const parts = parseColumnRaw(span.raw);
    // Keep the file's own spelling of the relation, but write one inline when the
    // edit itself changes it (the panel's "ref" picker has nowhere else to go).
    const hadInlineRef = parts.settings.some((setting) => /^ref\s*:/i.test(setting));
    const refChanged = JSON.stringify(prevCol?.ref ?? null) !== JSON.stringify(col.ref ?? null);
    edits.push({
      start: span.start,
      end: span.end,
      text: renderColumn(col, parts.settings, hadInlineRef || refChanged),
    });
  });

  // Removed columns.
  spans.forEach((span, i) => {
    if (used.has(i)) return;
    const line = doc.lines[span.endLine];
    const end = line.next > line.end ? line.next : line.end;
    edits.push({ start: span.start, end, text: "" });
  });

  // New columns go at the end of the column region (before indexes/Note/brace).
  if (appended.length > 0) {
    const closing = doc.lines[target.endLine];
    const line = appended.map((c) => renderColumn(c, [])).join("\n");
    edits.push({ start: closing.start, end: closing.start, text: `${line}\n` });
  }

  return applyEdits(dbml, edits);
}
