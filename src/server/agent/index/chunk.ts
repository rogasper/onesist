/**
 * Artifact-aware chunking (FR-I3).
 *
 * Why chunk at all instead of indexing whole files: search results must point at
 * the part that matched. A hit inside a 3.000-line MASTER_SPEC_API.md is useless
 * if the snippet is just "line 1 of the file", which is what a per-file index
 * gives you.
 *
 * Boundaries follow the artifact, not a fixed window:
 *   markdown → per heading (that is how the documents are written)
 *   dbml     → per table   (that is how the schema is written)
 *   code     → per top-level symbol (function/class/…)
 *   anything else → line windows with overlap, so a match near a boundary is not
 *                   cut in half
 */
import { extractSymbols } from "./symbols";

export interface IndexChunk {
  kind: "heading" | "table" | "symbol" | "window";
  /** Heading text, table name, symbol name — what the result row is labelled by. */
  label: string;
  startLine: number;
  endLine: number;
  text: string;
}

export const CHUNK_LIMITS = {
  /** Longest chunk stored; a section or function bigger than this is split. */
  maxChars: 4000,
  /** Lines per window in the fallback, and the overlap between windows. */
  windowLines: 60,
  overlapLines: 8,
} as const;

/** Splits an oversized block into overlapping windows, keeping line numbers. */
function windowize(text: string, startLine: number, kind: IndexChunk["kind"], label: string): IndexChunk[] {
  const lines = text.split("\n");
  // Split on EITHER limit: a wall of very long lines and a 5000-line column of
  // short ones are both useless as a single search hit, and the second case is
  // what an artifact like a generated CSV looks like.
  if (text.length <= CHUNK_LIMITS.maxChars && lines.length <= CHUNK_LIMITS.windowLines) {
    return [{ kind, label, startLine, endLine: startLine + lines.length - 1, text }];
  }
  const out: IndexChunk[] = [];
  const step = Math.max(1, CHUNK_LIMITS.windowLines - CHUNK_LIMITS.overlapLines);
  for (let i = 0; i < lines.length; i += step) {
    const slice = lines.slice(i, i + CHUNK_LIMITS.windowLines);
    if (!slice.length) break;
    out.push({
      kind: "window",
      label: `${label} (lanjutan)`,
      startLine: startLine + i,
      endLine: startLine + i + slice.length - 1,
      text: slice.join("\n").slice(0, CHUNK_LIMITS.maxChars),
    });
    if (i + CHUNK_LIMITS.windowLines >= lines.length) break;
  }
  return out;
}

/** Markdown: one chunk per heading, heading included in the text so the search
 *  index carries the title into the snippet. */
function chunkMarkdown(text: string): IndexChunk[] {
  const lines = text.split("\n");
  const starts: { line: number; title: string }[] = [];
  lines.forEach((line, i) => {
    const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
    if (m) starts.push({ line: i, title: m[2] });
  });
  if (!starts.length) return windowize(text, 1, "window", "berkas");

  const out: IndexChunk[] = [];
  starts.forEach((start, idx) => {
    const end = idx + 1 < starts.length ? starts[idx + 1].line : lines.length;
    const body = lines.slice(start.line, end).join("\n");
    out.push(...windowize(body, start.line + 1, "heading", start.title));
  });
  return out;
}

/** DBML: one chunk per `Table … { … }` block; everything else becomes a window so
 *  refs/enums/notes are still searchable. */
function chunkDbml(text: string): IndexChunk[] {
  const lines = text.split("\n");
  const out: IndexChunk[] = [];
  let buffer: string[] = [];
  let bufferStart = 0;
  let depth = 0;
  let current: { name: string; start: number; lines: string[] } | null = null;

  const flushWindow = () => {
    if (!buffer.length) return;
    const joined = buffer.join("\n");
    if (joined.trim()) out.push({ kind: "window", label: "dbml", startLine: bufferStart + 1, endLine: bufferStart + buffer.length, text: joined });
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const open = /^\s*Table\s+("?[\w.]+"?)\s*(?:as\s+\w+)?\s*\{/i.exec(line);
    if (!current && open) {
      flushWindow();
      current = { name: open[1].replace(/"/g, ""), start: i, lines: [line] };
      depth = 1;
      continue;
    }
    if (current) {
      current.lines.push(line);
      if (line.includes("{")) depth++;
      if (line.includes("}")) {
        depth--;
        if (depth <= 0) {
          const text2 = current.lines.join("\n");
          out.push(...windowize(text2, current.start + 1, "table", current.name));
          current = null;
        }
      }
      continue;
    }
    if (!buffer.length) bufferStart = i;
    buffer.push(line);
  }
  if (current) {
    const text2 = current.lines.join("\n");
    out.push(...windowize(text2, current.start + 1, "table", current.name));
  }
  flushWindow();
  return out;
}

/** Code: one chunk per top-level symbol, using the symbol's line as the start and
 *  the next symbol as the end. Lines before the first symbol stay as a window. */
function chunkCode(text: string, ext: string, path: string): IndexChunk[] {
  const symbols = extractSymbols({ path, ext, text });
  const lines = text.split("\n");
  if (!symbols.length) return windowize(text, 1, "window", "berkas");

  const out: IndexChunk[] = [];
  const first = symbols[0].line - 1;
  if (first > 0) {
    const head = lines.slice(0, first).join("\n");
    if (head.trim()) out.push({ kind: "window", label: "bagian atas", startLine: 1, endLine: first, text: head.slice(0, CHUNK_LIMITS.maxChars) });
  }

  symbols.forEach((symbol, idx) => {
    const start = symbol.line - 1;
    const end = idx + 1 < symbols.length ? symbols[idx + 1].line - 1 : lines.length;
    const body = lines.slice(start, Math.max(end, start + 1)).join("\n");
    out.push(...windowize(body, symbol.line, "symbol", symbol.name));
  });
  return out;
}

/** Chunks one file. Falls back to windows whenever no artifact-specific reader
 *  applies, so every text file stays searchable. */
export function chunkFile(input: { path: string; ext: string; text: string }): IndexChunk[] {
  const ext = input.ext.toLowerCase();
  if (ext === ".md" || ext === ".markdown" || ext === ".mdx") return chunkMarkdown(input.text);
  if (ext === ".dbml") return chunkDbml(input.text);
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".go", ".py", ".php", ".java"].includes(ext)) {
    return chunkCode(input.text, ext, input.path);
  }
  return windowize(input.text, 1, "window", ext.replace(".", "") || "berkas");
}
