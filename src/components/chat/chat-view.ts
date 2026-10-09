/**
 * Pure helpers for how a turn reads: which parts are work to fold away, what a tool
 * call did (exit code, lines changed), and the words for a summary row.
 *
 * Kept free of React. The transcript renders from these, and the tests pin them.
 */

/** Blocks that are the agent's work, not its answer. A finished turn folds them. */
export const WORK_KINDS = new Set(["reasoning", "tools", "subagent"]);

export type Segment<T> = { work: true; items: T[] } | { work: false; item: T };

/**
 * Splits a turn's blocks into runs. Consecutive work blocks form one run, which is
 * folded into a single row once the turn has finished; everything else (the answer,
 * notices, plan panels) stays visible and in place.
 */
export function segmentBlocks<T extends { kind: string }>(blocks: T[]): Segment<T>[] {
  const out: Segment<T>[] = [];
  for (const block of blocks) {
    if (WORK_KINDS.has(block.kind)) {
      const last = out[out.length - 1];
      if (last && last.work) last.items.push(block);
      else out.push({ work: true, items: [block] });
    } else {
      out.push({ work: false, item: block });
    }
  }
  return out;
}

export type ToolFamily = "explore" | "changes" | "other";

/** Reading and searching never change the workspace; writing does. */
export function toolFamily(name: string): ToolFamily {
  switch (name) {
    case "read_file":
    case "list_dir":
    case "grep":
    case "glob":
    case "code_search":
    case "db_schema":
      return "explore";
    case "write_file":
    case "edit_file":
      return "changes";
    default:
      return "other";
  }
}

/** The exit code a `bash` result carries (`exit=N` on the first line), or null. */
export function bashExitCode(output: unknown): number | null {
  if (typeof output !== "string") return null;
  const m = /^exit=(-?\d+)/.exec(output);
  return m ? Number(m[1]) : null;
}

/** Lines added and removed, as a write/edit result reports them: `(+3/-1 baris …)`. */
export function changeStats(output: unknown): { added: number; removed: number } | null {
  if (typeof output !== "string") return null;
  const m = /\(\+(\d+)\/-(\d+) baris/.exec(output);
  return m ? { added: Number(m[1]), removed: Number(m[2]) } : null;
}

/** Durations in readable units, Indonesian: 820 ms · 1,2 dtk · 1 mnt 5 dtk. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(".", ",")} dtk`;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)} mnt ${total % 60} dtk`;
}

/** The words of a folded work row: duration, steps, and files changed (when any). */
export function workSummary(input: { steps: number; durationMs: number | null; files: number }): string {
  const parts: string[] = [];
  parts.push(input.durationMs != null && input.durationMs > 0 ? `Bekerja ${formatDuration(input.durationMs)}` : "Bekerja");
  if (input.steps > 0) parts.push(`${input.steps} langkah`);
  if (input.files > 0) parts.push(`${input.files} berkas`);
  return parts.join(" · ");
}

/** The title of a group of write/edit calls: `Perubahan · 2 berkas +40 −5`. */
export function changeTitle(input: { files: number; added: number; removed: number }): string {
  const count = input.files === 1 ? "1 berkas" : `${input.files} berkas`;
  return `Perubahan · ${count} +${input.added} −${input.removed}`;
}

/** The title of a group of reading calls: `Menjelajah 12 langkah`. */
export function exploreTitle(steps: number): string {
  return `Menjelajah ${steps} langkah`;
}

/** Distinct workspace paths touched by a list of write/edit calls. */
export function touchedPaths(inputs: unknown[]): string[] {
  const set = new Set<string>();
  for (const input of inputs) {
    const path = (input as { path?: unknown } | null)?.path;
    if (typeof path === "string" && path) set.add(path);
  }
  return [...set];
}

/** The files a `grep` result lists, each with its matching lines. The tool writes
 *  `path  (type)` for a file and `    N: preview` for each of its hits. */
export function parseSearchHits(output: unknown): { path: string; type: string; hits: { line: number; preview: string }[] }[] {
  if (typeof output !== "string") return [];
  const files: { path: string; type: string; hits: { line: number; preview: string }[] }[] = [];
  for (const raw of output.split("\n")) {
    const header = /^(\S.*?)  \((\w+)\)$/.exec(raw);
    if (header) {
      files.push({ path: header[1], type: header[2], hits: [] });
      continue;
    }
    const hit = /^ {4}(\d+): (.*)$/.exec(raw);
    if (hit && files.length) files[files.length - 1].hits.push({ line: Number(hit[1]), preview: hit[2] });
  }
  return files;
}

/** The paths a `glob` result lists, and how many the tool cut off. */
export function parseGlobList(output: unknown): { paths: string[]; hidden: number } {
  if (typeof output !== "string") return { paths: [], hidden: 0 };
  const lines = output.split("\n");
  const paths: string[] = [];
  let hidden = 0;
  for (const line of lines.slice(1)) {
    const more = /^… \((\d+) berkas lagi\)$/.exec(line);
    if (more) hidden = Number(more[1]);
    else if (line.trim()) paths.push(line);
  }
  return { paths, hidden };
}

/** A `web_fetch` result: `HTTP 200 — text…`. The status is null when the result is not that shape. */
export function parseFetchResult(output: unknown): { status: number | null; text: string } {
  if (typeof output !== "string") return { status: null, text: "" };
  const m = /^HTTP (\d{3}) — ([\s\S]*)$/.exec(output);
  return m ? { status: Number(m[1]), text: m[2] } : { status: null, text: output };
}

/** The lines an edit replaces, with the lines both sides share at the start and the
 *  end dropped. A preview of the change, not a line-by-line diff. */
export function replacementPreview(oldText: unknown, newText: unknown): { removed: string[]; added: string[] } {
  const a = typeof oldText === "string" && oldText ? oldText.split("\n") : [];
  const b = typeof newText === "string" && newText ? newText.split("\n") : [];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return { removed: a.slice(start, endA), added: b.slice(start, endB) };
}

/** The rows a `db_query` result carries: `N baris:` and a JSON array. Null when the
 *  result is not that shape (an error text, for example). */
export function parseDbRows(output: unknown): { rows: Record<string, unknown>[]; columns: string[] } | null {
  if (typeof output !== "string") return null;
  const m = /^\d+ baris:\n([\s\S]*?)(\n\n… dipotong[\s\S]*)?$/.exec(output);
  if (!m) return null;
  if (m[1] === "(tidak ada baris)") return { rows: [], columns: [] };
  try {
    const parsed = JSON.parse(m[1]);
    if (!Array.isArray(parsed)) return null;
    const rows = parsed.filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r));
    const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    return { rows, columns };
  } catch {
    return null;
  }
}

export type CodeSearchLine = { kind: "note" | "file" | "hit"; text: string };

/**
 * A `code_search` result, line by line. The tool does not mark its lines with
 * anything but indentation: files start at the margin, hits are indented under them,
 * and the summary lines are notes. Blank lines are dropped.
 */
export function codeSearchLines(output: unknown): CodeSearchLine[] {
  if (typeof output !== "string") return [];
  return output
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line): CodeSearchLine => {
      if (line.startsWith("  ")) return { kind: "hit", text: line.trim() };
      if (/^(\(Index|\d+ (kecocokan|simbol|berkas cocok)|Tidak )/.test(line)) return { kind: "note", text: line };
      return { kind: "file", text: line };
    });
}
