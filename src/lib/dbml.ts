export interface ColumnDef {
  name: string;
  type: string;
  isPk: boolean;
  isUnique: boolean;
  isNotNull: boolean;
  defaultValue: string | null;
  note?: string | null;
  ref: { table: string; column: string; relation?: string } | null;
}

export interface IndexDef {
  name: string;
  columns: string[];
  isUnique: boolean;
}

export interface TableDef {
  name: string;
  alias?: string | null;
  note?: string | null;
  columns: ColumnDef[];
  indexes: IndexDef[];
  color?: string;
}

export interface NoteDef {
  content: string;
  tableName?: string;
}

export interface EnumDef {
  name: string;
  values: string[];
}

export interface StandaloneRef {
  from: { table: string; column: string };
  to: { table: string; column: string };
  relation: string;
}

export interface ParsedDbml {
  tables: TableDef[];
  notes: NoteDef[];
  enums?: EnumDef[];
  refs?: StandaloneRef[];
}

export interface ExtractedDbml {
  dbml: string;
  hasDbml: boolean;
  fenceCount: number;
  source: "raw" | "fence";
}

function isQuoteChar(ch: string): boolean {
  return ch === '"' || ch === "'" || ch === "`";
}

function stripComments(text: string): string {
  let out = "";
  let quote: string | null = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      out += ch;
      if (ch === "\\" && i + 1 < text.length) {
        out += text[i + 1];
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (isQuoteChar(ch)) {
      quote = ch;
      out += ch;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      if (i < text.length) out += "\n";
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

function splitTopLevel(input: string, separator = ","): string[] {
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
    if (isQuoteChar(ch)) {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth = Math.max(0, depth - 1);
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function unquote(value: string): string {
  const s = value.trim();
  if (s.length >= 2) {
    const first = s[0];
    const last = s[s.length - 1];
    if ((first === '"' || first === "'" || first === "`") && first === last) {
      return s.slice(1, -1).replace(/\\(["'`\\])/g, "$1");
    }
  }
  return s;
}

function readQualifiedName(text: string, start: number): { name: string; end: number } | null {
  const parts: string[] = [];
  let i = start;
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i += 1;
    const ch = text[i];
    if (ch === undefined) break;
    if (isQuoteChar(ch)) {
      const quote = ch;
      let value = "";
      i += 1;
      while (i < text.length) {
        const c = text[i];
        if (c === "\\" && i + 1 < text.length) {
          value += text[i + 1];
          i += 2;
          continue;
        }
        if (c === quote) {
          i += 1;
          break;
        }
        value += c;
        i += 1;
      }
      parts.push(value);
    } else {
      const m = /^[A-Za-z_][A-Za-z0-9_$]*/.exec(text.slice(i));
      if (!m) break;
      parts.push(m[0]);
      i += m[0].length;
    }
    let j = i;
    while (j < text.length && /\s/.test(text[j])) j += 1;
    if (text[j] === ".") {
      i = j + 1;
      continue;
    }
    break;
  }
  return parts.length ? { name: parts.join("."), end: i } : null;
}

function splitQualifiedName(raw: string): string[] {
  const parts: string[] = [];
  let i = 0;
  while (i < raw.length) {
    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    if (i >= raw.length) break;
    const ch = raw[i];
    if (isQuoteChar(ch)) {
      const quote = ch;
      let value = "";
      i += 1;
      while (i < raw.length) {
        const c = raw[i];
        if (c === "\\" && i + 1 < raw.length) {
          value += raw[i + 1];
          i += 2;
          continue;
        }
        if (c === quote) {
          i += 1;
          break;
        }
        value += c;
        i += 1;
      }
      parts.push(value);
    } else {
      let value = "";
      while (i < raw.length && raw[i] !== "." && !/\s/.test(raw[i])) {
        value += raw[i];
        i += 1;
      }
      if (value) parts.push(value);
    }
    while (i < raw.length && /\s/.test(raw[i])) i += 1;
    if (raw[i] === ".") {
      i += 1;
      continue;
    }
    break;
  }
  return parts;
}

function findMatching(text: string, open: number, openChar: string, closeChar: string): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (isQuoteChar(ch)) {
      quote = ch;
      continue;
    }
    if (ch === openChar) depth += 1;
    else if (ch === closeChar) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function logicalLines(text: string): string[] {
  const lines: string[] = [];
  let current = "";
  let quote: string | null = null;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch === "\\" && i + 1 < text.length) {
        current += text[i + 1];
        i += 1;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (isQuoteChar(ch)) {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "\n" && depth === 0) {
      lines.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  lines.push(current);
  return lines;
}

function parseRefValue(value: string): { relation: string; table: string; column: string } | null {
  const m = /^(>=|<=|<>|><|>|<|-)\s*(.+)$/.exec(value.trim());
  const relation = m?.[1] ?? ">";
  const target = (m?.[2] ?? value).trim();
  const parts = splitQualifiedName(target);
  if (parts.length < 2) return null;
  return {
    relation,
    table: parts.slice(0, -1).join("."),
    column: parts[parts.length - 1],
  };
}

function parseColumnSettings(settings: string): {
  isPk: boolean;
  isUnique: boolean;
  isNotNull: boolean;
  defaultValue: string | null;
  note: string | null;
  ref: ColumnDef["ref"];
} {
  let isPk = false;
  let isUnique = false;
  let isNotNull = false;
  let defaultValue: string | null = null;
  let note: string | null = null;
  let ref: ColumnDef["ref"] = null;

  for (const raw of splitTopLevel(settings)) {
    const part = raw.trim();
    if (!part) continue;
    const lower = part.toLowerCase();
    if (lower === "pk" || lower === "primary key") {
      isPk = true;
      continue;
    }
    if (lower === "unique") {
      isUnique = true;
      continue;
    }
    if (lower === "not null") {
      isNotNull = true;
      continue;
    }
    if (lower === "null") {
      isNotNull = false;
      continue;
    }
    if (lower === "increment") continue;

    const colon = part.indexOf(":");
    if (colon < 0) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).trim();
    if (key === "default") {
      defaultValue = value;
    } else if (key === "note") {
      note = unquote(value);
    } else if (key === "ref") {
      ref = parseRefValue(value);
    }
  }

  return { isPk, isUnique, isNotNull, defaultValue, note, ref };
}

function parseColumnLine(line: string): ColumnDef | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const nameMatch = /^(?:"([^"]+)"|`([^`]+)`|([A-Za-z_][A-Za-z0-9_$]*))\s+/.exec(trimmed);
  if (!nameMatch) return null;
  const name = nameMatch[1] ?? nameMatch[2] ?? nameMatch[3];
  const rest = trimmed.slice(nameMatch[0].length);

  const typeMatch = /^([A-Za-z_][A-Za-z0-9_$]*(?:\s*\([^)]*\))?(?:\s+(?:precision|varying|with\s+time\s+zone|without\s+time\s+zone))?(?:\s*\([^)]*\))?)/i.exec(rest);
  if (!typeMatch) return null;
  const type = typeMatch[1].replace(/\s+/g, " ");
  const afterType = rest.slice(typeMatch[0].length);

  let settings = "";
  const open = afterType.indexOf("[");
  if (open >= 0) {
    const close = findMatching(afterType, open, "[", "]");
    settings = close >= 0 ? afterType.slice(open + 1, close) : afterType.slice(open + 1);
  }

  return { name, type, ...parseColumnSettings(settings) };
}

interface RawTableBlock {
  name: string;
  alias: string | null;
  body: string;
  start: number;
  end: number;
}

function findTableBlocks(text: string): RawTableBlock[] {
  const blocks: RawTableBlock[] = [];
  const re = /^[ \t]*Table[ \t]+/gim;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const afterKeyword = match.index + match[0].length;
    const nameRead = readQualifiedName(text, afterKeyword);
    if (!nameRead) continue;

    let i = nameRead.end;
    while (i < text.length && /\s/.test(text[i])) i += 1;
    let alias: string | null = null;
    if (/^as\b/i.test(text.slice(i, i + 2))) {
      i += 2;
      while (i < text.length && /\s/.test(text[i])) i += 1;
      const aliasRead = readQualifiedName(text, i);
      if (aliasRead) {
        alias = aliasRead.name;
        i = aliasRead.end;
      }
    }
    while (i < text.length && /\s/.test(text[i])) i += 1;
    if (text[i] !== "{") continue;

    const close = findMatching(text, i, "{", "}");
    const body = close >= 0 ? text.slice(i + 1, close) : text.slice(i + 1);
    const end = close >= 0 ? close + 1 : text.length;
    blocks.push({ name: nameRead.name, alias, body, start: match.index, end });
    re.lastIndex = end;
  }
  return blocks;
}

function parseIndexes(content: string, out: IndexDef[]): void {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const withoutSettings = line.replace(/\[[^\]]*\]/g, "").trim();
    const parenthesised = /^\(([^)]*)\)/.exec(withoutSettings);
    const columns = parenthesised
      ? splitTopLevel(parenthesised[1]).map((c) => unquote(c)).filter(Boolean)
      : splitTopLevel(withoutSettings).map((c) => unquote(c)).filter(Boolean);
    if (!columns.length) continue;
    const name = /name\s*:\s*(?:'([^']*)'|"([^"]*)"|([^\],]+))/i.exec(line);
    out.push({
      name: (name?.[1] ?? name?.[2] ?? name?.[3] ?? "").trim(),
      columns,
      isUnique: /\[[^\]]*\bunique\b/i.test(line),
    });
  }
}

function extractIndexBlocks(body: string, out: IndexDef[]): string {
  const ranges: { start: number; end: number; content: string }[] = [];
  const re = /^[ \t]*indexes[ \t]*\{/gim;
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) {
    const open = body.indexOf("{", match.index);
    const close = findMatching(body, open, "{", "}");
    if (close < 0) break;
    ranges.push({ start: match.index, end: close + 1, content: body.slice(open + 1, close) });
    re.lastIndex = close + 1;
  }
  for (const range of ranges) parseIndexes(range.content, out);
  let result = body;
  for (let i = ranges.length - 1; i >= 0; i -= 1) {
    const range = ranges[i];
    result =
      result.slice(0, range.start) +
      "\n".repeat(range.content.split("\n").length + 2) +
      result.slice(range.end);
  }
  return result;
}

function parseTableBlock(block: RawTableBlock): TableDef {
  const table: TableDef = {
    name: block.name,
    alias: block.alias,
    note: null,
    columns: [],
    indexes: [],
  };
  const body = extractIndexBlocks(block.body, table.indexes);
  for (const line of logicalLines(body)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^Note\s*:/i.test(trimmed)) {
      table.note = unquote(trimmed.slice(trimmed.indexOf(":") + 1));
      continue;
    }
    const column = parseColumnLine(line);
    if (column) table.columns.push(column);
  }
  return table;
}

function parseEnums(text: string): EnumDef[] {
  const enums: EnumDef[] = [];
  const re = /^[ \t]*Enum[ \t]+([^\s{]+)[ \t]*\{([^}]*)\}/gim;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const name = unquote(match[1]);
    const values = match[2]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !/^Note\s*:/i.test(line))
      .map((line) => unquote(line.split(/\s+/)[0] ?? ""))
      .filter(Boolean);
    enums.push({ name, values });
  }
  return enums;
}

function removeTableBlocks(text: string, blocks: RawTableBlock[]): string {
  let result = text;
  for (let i = blocks.length - 1; i >= 0; i -= 1) {
    result = result.slice(0, blocks[i].start) + "\n" + result.slice(blocks[i].end);
  }
  return result;
}

function parseTopLevelNotes(text: string): NoteDef[] {
  const notes: NoteDef[] = [];
  const re = /^[ \t]*Note(?:\s+([^\s:]+))?\s*:\s*(.+)$/gim;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const tableName = match[1] ? unquote(match[1]).replace(/["`]/g, "") : undefined;
    notes.push({ content: unquote(match[2].trim()), ...(tableName ? { tableName } : {}) });
  }
  return notes;
}

interface ParsedRef {
  left: { table: string; column: string };
  right: { table: string; column: string };
  relation: string;
}

function splitRefSide(side: string): { table: string; column: string } | null {
  const parts = splitQualifiedName(side.trim());
  if (parts.length < 2) return null;
  return { table: parts.slice(0, -1).join("."), column: parts[parts.length - 1] };
}

function parseStandaloneRefs(text: string): ParsedRef[] {
  const refs: ParsedRef[] = [];
  const re = /^[ \t]*Ref(?:\s+[A-Za-z_][A-Za-z0-9_$]*)?\s*:\s*(.+)$/gim;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const body = match[1].trim();
    const rel = /^(.+?)\s*(>=|<=|<>|><|>|<|-)\s*(.+)$/.exec(body);
    if (!rel) continue;
    const left = splitRefSide(rel[1]);
    const right = splitRefSide(rel[3]);
    if (!left || !right) continue;
    refs.push({ left, right, relation: rel[2] });
  }
  return refs;
}

function buildAliasMap(tables: TableDef[]): Map<string, TableDef> {
  const map = new Map<string, TableDef>();
  for (const table of tables) {
    map.set(table.name, table);
    if (table.alias) map.set(table.alias, table);
  }
  return map;
}

function resolveTable(name: string, tables: TableDef[], aliases: Map<string, TableDef>): TableDef | null {
  const direct = aliases.get(name) ?? tables.find((t) => t.name === name);
  if (direct) return direct;
  const last = name.split(".").pop();
  if (!last) return null;
  const candidates = tables.filter((t) => t.name.split(".").pop() === last || t.alias === last);
  return candidates.length === 1 ? candidates[0] : null;
}

function resolveColumn(table: TableDef, column: string): string | null {
  if (table.columns.some((c) => c.name === column)) return column;
  return null;
}

function dedupeRefs(refs: StandaloneRef[]): StandaloneRef[] {
  const seen = new Set<string>();
  const out: StandaloneRef[] = [];
  for (const ref of refs) {
    const key = `${ref.from.table}.${ref.from.column}->${ref.to.table}.${ref.to.column}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(ref);
  }
  return out;
}

export function parseDbml(dbml: string): ParsedDbml {
  const cleaned = stripComments(dbml);
  const blocks = findTableBlocks(cleaned);
  const tables = blocks.map(parseTableBlock);
  const enums = parseEnums(cleaned);
  const outside = removeTableBlocks(cleaned, blocks);
  const notes = parseTopLevelNotes(outside);
  const aliases = buildAliasMap(tables);
  const refs: StandaloneRef[] = [];

  for (const table of tables) {
    for (const column of table.columns) {
      if (!column.ref) continue;
      const targetTable = resolveTable(column.ref.table, tables, aliases);
      const targetColumn = targetTable ? resolveColumn(targetTable, column.ref.column) : null;
      if (targetTable && targetColumn) {
        column.ref = {
          table: targetTable.name,
          column: targetColumn,
          relation: column.ref.relation ?? ">",
        };
      } else {
        refs.push({
          from: { table: table.name, column: column.name },
          to: { table: column.ref.table, column: column.ref.column },
          relation: column.ref.relation ?? ">",
        });
        column.ref = null;
      }
    }
  }

  for (const ref of parseStandaloneRefs(outside)) {
    const sourceTable = resolveTable(ref.left.table, tables, aliases);
    const sourceColumn = sourceTable ? resolveColumn(sourceTable, ref.left.column) : null;
    const targetTable = resolveTable(ref.right.table, tables, aliases);
    const targetColumn = targetTable ? resolveColumn(targetTable, ref.right.column) : null;
    if (sourceTable && sourceColumn && targetTable && targetColumn) {
      const column = sourceTable.columns.find((c) => c.name === sourceColumn);
      if (column) {
        column.ref = { table: targetTable.name, column: targetColumn, relation: ref.relation };
      }
    } else {
      refs.push({ from: ref.left, to: ref.right, relation: ref.relation });
    }
  }

  return { tables, notes, enums, refs: dedupeRefs(refs) };
}

function formatIdent(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_$]*$/.test(name) ? name : `"${name.replace(/"/g, '\\"')}"`;
}

function formatQualified(name: string): string {
  return name.split(".").map(formatIdent).join(".");
}

function quoteNote(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

export function serializeDbmlDocument(doc: ParsedDbml): string {
  const lines: string[] = [];

  for (const en of doc.enums ?? []) {
    lines.push(`Enum ${formatQualified(en.name)} {`);
    for (const value of en.values) lines.push(`  ${formatIdent(value)}`);
    lines.push("}");
    lines.push("");
  }

  for (const table of doc.tables) {
    lines.push(`Table ${formatQualified(table.name)}${table.alias ? ` as ${formatIdent(table.alias)}` : ""} {`);
    for (const column of table.columns) {
      const settings: string[] = [];
      if (column.isPk) settings.push("pk");
      if (column.isUnique) settings.push("unique");
      if (column.isNotNull) settings.push("not null");
      if (column.defaultValue) settings.push(`default: ${column.defaultValue}`);
      if (column.note) settings.push(`note: ${quoteNote(column.note)}`);
      if (column.ref) {
        settings.push(`ref: ${column.ref.relation ?? ">"} ${formatQualified(column.ref.table)}.${formatIdent(column.ref.column)}`);
      }
      const settingsStr = settings.length > 0 ? ` [${settings.join(", ")}]` : "";
      lines.push(`  ${formatIdent(column.name)} ${column.type}${settingsStr}`);
    }
    if (table.note) lines.push(`  Note: ${quoteNote(table.note)}`);
    if (table.indexes.length > 0) {
      lines.push("");
      lines.push("  indexes {");
      for (const index of table.indexes) {
        const cols = index.columns.map(formatIdent).join(", ");
        lines.push(`    (${cols})${index.isUnique ? " [unique]" : ""}`);
      }
      lines.push("  }");
    }
    lines.push("}");
    lines.push("");
  }

  for (const ref of doc.refs ?? []) {
    lines.push(
      `Ref: ${formatQualified(ref.from.table)}.${formatIdent(ref.from.column)} ${ref.relation} ${formatQualified(ref.to.table)}.${formatIdent(ref.to.column)}`,
    );
  }
  if (doc.refs?.length) lines.push("");

  for (const note of doc.notes) {
    lines.push(`Note${note.tableName ? ` ${formatQualified(note.tableName)}` : ""}: ${quoteNote(note.content)}`);
  }

  return lines.join("\n");
}

export function serializeDbml(tables: TableDef[]): string {
  return serializeDbmlDocument({ tables, notes: [] });
}

interface Fence {
  lang: string;
  content: string;
  contentStart: number;
  contentEnd: number;
  start: number;
  end: number;
}

const FENCE_RE = /^[ \t]*(`{3,}|~{3,})[ \t]*([\w-]*)[^\n]*\r?\n([\s\S]*?)^[ \t]*\1[ \t]*$/gim;

function findFences(markdown: string): Fence[] {
  const fences: Fence[] = [];
  FENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(markdown)) !== null) {
    const opening = /^[ \t]*(?:`{3,}|~{3,})[^\n]*\n/.exec(match[0])?.[0] ?? "";
    const contentStart = match.index + opening.length;
    fences.push({
      lang: (match[2] ?? "").toLowerCase(),
      content: match[3],
      contentStart,
      contentEnd: contentStart + match[3].length,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return fences;
}

function looksLikeDbml(text: string): boolean {
  return /^[ \t]*(Table|Ref|Enum|TableGroup)\b/im.test(text);
}

const DBML_FENCE_LANGS = new Set(["dbml", "text", "txt", "plaintext", "sql", "database"]);

function isDbmlFence(fence: Fence): boolean {
  if (fence.lang === "dbml") return true;
  if (fence.lang !== "" && !DBML_FENCE_LANGS.has(fence.lang)) return false;
  return looksLikeDbml(fence.content);
}

export function extractDbml(text: string, isMarkdown: boolean): ExtractedDbml {
  if (!isMarkdown) {
    return { dbml: text, hasDbml: looksLikeDbml(text), fenceCount: 0, source: "raw" };
  }
  const fences = findFences(text).filter(isDbmlFence);
  if (fences.length > 0) {
    return {
      dbml: fences.map((f) => f.content).join("\n"),
      hasDbml: true,
      fenceCount: fences.length,
      source: "fence",
    };
  }
  return { dbml: text, hasDbml: looksLikeDbml(text), fenceCount: 0, source: "raw" };
}

export function replaceDbmlFence(markdown: string, dbml: string): string | null {
  const fences = findFences(markdown).filter(isDbmlFence);
  if (fences.length !== 1) return null;
  const fence = fences[0];
  const body = dbml.endsWith("\n") ? dbml : `${dbml}\n`;
  return markdown.slice(0, fence.contentStart) + body + markdown.slice(fence.contentEnd);
}
