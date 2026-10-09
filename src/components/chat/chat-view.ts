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
