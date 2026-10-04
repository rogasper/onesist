/**
 * Agent memory (FR-H).
 *
 * Two files, one format: `<project>/.agents/ONESIST.md` for conventions that
 * belong to the project, and `memory.md` next to the database for conventions
 * that belong to the person. Both are plain markdown a human can read and edit —
 * this is not a hidden vector store.
 *
 * Entry format: one bullet per memory, timestamped, with continuation lines
 * indented two spaces so a multi-line note stays one entry:
 *
 *     - 2026-09-16 14:03 — deskripsi selalu Bahasa Indonesia
 *       istilah teknis English
 *
 * Why the format matters: the prompt budget (FR-H3) can only drop whole entries,
 * and the panel can only offer per-entry delete, if entries are parseable in the
 * first place.
 */
import fs from "node:fs";
import path from "node:path";
import { dbFilePath } from "./paths";

export type MemoryScope = "project" | "global";

export interface MemoryEntry {
  /** ISO-ish local timestamp written when the entry was added. */
  at: string;
  /** Entry text, newlines preserved. */
  text: string;
}

export interface MemoryFile {
  path: string;
  exists: boolean;
  content: string;
  entries: MemoryEntry[];
}

export interface MemoryState {
  project: MemoryFile;
  global: MemoryFile;
}

/** Caps: memory is injected into every turn's system prompt, so it is bounded
 *  on four axes — entry size, entry count, prompt budget, and file growth. */
export const MEMORY_LIMITS = {
  promptChars: 4000,
  entryChars: 2000,
  entries: 200,
  /** Reserved for section labels and the truncation notice, so the INJECTED
   *  text stays within `promptChars` including its own scaffolding. */
  overheadChars: 220,
  /** Most of the budget one scope may take before the other gets its share. */
  scopeShare: 0.6,
} as const;

export const MEMORY_HEADING = "## Catatan";

/** Paths for both scopes. The global file sits beside the database, which is the
 *  per-installation data directory on desktop (`SA_DB_PATH`) and the repo root in
 *  web dev — the same rule the approval secret already follows. */
export function memoryPaths(root: string): { project: string; global: string } {
  return {
    project: path.join(root, ".agents", "ONESIST.md"),
    global: path.join(path.dirname(dbFilePath()), "memory.md"),
  };
}

function fileOf(filePath: string): MemoryFile {
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch {
    return { path: filePath, exists: false, content: "", entries: [] };
  }
  return { path: filePath, exists: true, content, entries: parseMemoryEntries(content) };
}

export function readMemory(root: string): MemoryState {
  const paths = memoryPaths(root);
  return { project: fileOf(paths.project), global: fileOf(paths.global) };
}

/** Reads both files' entries, newest last. */
export function parseMemoryEntries(content: string): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
  let current: MemoryEntry | null = null;
  for (const rawLine of content.split(/\r?\n/)) {
    const bullet = /^[-*]\s+(?:(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})\s*[—–-]\s*)?(.*)$/.exec(rawLine);
    if (bullet) {
      if (current) entries.push(current);
      current = { at: bullet[1] ?? "", text: bullet[2] ?? "" };
      continue;
    }
    if (!current) continue;
    // Indented continuation, or blank line inside the entry.
    if (/^\s+\S/.test(rawLine)) {
      current.text += `\n${rawLine.trim()}`;
      continue;
    }
    if (rawLine.trim() === "" && current) {
      entries.push(current);
      current = null;
    }
  }
  if (current) entries.push(current);
  return entries.map((e) => ({ at: e.at, text: e.text.trim() })).filter((e) => e.text.length > 0);
}

/** Serializes entries back to the file format. */
export function serializeMemory(entries: MemoryEntry[]): string {
  return entries
    .map((entry) => {
      const [first, ...rest] = entry.text.split("\n");
      const head = `- ${entry.at ? `${entry.at} — ` : ""}${first}`;
      return [head, ...rest.map((line) => `  ${line}`)].join("\n");
    })
    .join("\n\n")
    .concat("\n");
}

/** One line of entry heading, in local time. `YYYY-MM-DD HH:mm` sorts as text. */
export function memoryTimestamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function cleanEntryText(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .slice(0, MEMORY_LIMITS.entryChars);
}

/** Appends one entry (FR-H4). Returns the entry that was written. */
export function appendMemory(root: string, scope: MemoryScope, text: string): MemoryEntry {
  const clean = cleanEntryText(text);
  if (!clean) throw new Error("Teks memory kosong.");
  const file = memoryPaths(root)[scope];
  const entries = parseMemoryEntries(fileOf(file).content);
  const entry: MemoryEntry = { at: memoryTimestamp(), text: clean };
  entries.push(entry);
  // Keep the newest entries; the file itself is not a log that may grow forever.
  const trimmed = entries.slice(-MEMORY_LIMITS.entries);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serializeMemory(trimmed), "utf-8");
  return entry;
}

/** Deletes one entry by position (FR-H5). */
export function deleteMemoryEntry(root: string, scope: MemoryScope, index: number): boolean {
  const file = memoryPaths(root)[scope];
  const entries = parseMemoryEntries(fileOf(file).content);
  if (!Number.isInteger(index) || index < 0 || index >= entries.length) return false;
  entries.splice(index, 1);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, entries.length ? serializeMemory(entries) : "", "utf-8");
  return true;
}

/** Replaces a whole file — what the panel's editor writes (FR-H5). */
export function writeMemoryContent(root: string, scope: MemoryScope, content: string): void {
  const file = memoryPaths(root)[scope];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content.replace(/\r\n?/g, "\n"), "utf-8");
}

/**
 * Memory for the system prompt (FR-H1..H3).
 *
 * One budget for BOTH scopes, not one each: the number that matters is how large
 * the injected block can get, and per-scope caps would silently allow double it.
 * Inside the budget each scope has a floor — if project notes could consume
 * everything, a user's own convention ("selalu Bahasa Indonesia") would vanish
 * from the prompt without anyone noticing, and the reverse is just as bad.
 *
 * Within a scope, over budget drops whole entries **from the oldest end**: a
 * half-entry is worse than no entry, and the newest note is the one the user just
 * asked the agent to remember.
 */
export function composeMemoryForPrompt(root: string): string {
  const state = readMemory(root);
  const budget = Math.max(500, MEMORY_LIMITS.promptChars - MEMORY_LIMITS.overheadChars);
  const quota = Math.floor(budget * MEMORY_LIMITS.scopeShare);

  // Project may take its share first, global gets the rest, and whatever global
  // does not need goes back to project — so a scope with few notes never wastes
  // the budget, while neither scope can starve the other.
  const projectFirst = takeNewest(state.project.entries, quota);
  const globalTaken = takeNewest(state.global.entries, budget - projectFirst.used);
  const leftover = budget - projectFirst.used - globalTaken.used;
  const projectTaken = leftover > 0 ? takeNewest(state.project.entries, quota + leftover) : projectFirst;

  const sections: string[] = [];
  const dropped: string[] = [];
  for (const [label, file, taken] of [
    ["Project", state.project, projectTaken],
    ["Global (user)", state.global, globalTaken],
  ] as const) {
    const droppedHere = file.entries.length - taken.kept.length;
    if (droppedHere > 0) dropped.push(`${droppedHere} entri ${label.toLowerCase()}`);
    if (!taken.kept.length) continue;
    sections.push([`**${label}:**`, ...taken.kept.map(renderEntry)].join("\n"));
  }

  if (!sections.length) return "";
  const note = dropped.length ? `\n\n(Entri terlama dipotong karena batas ukuran: ${dropped.join(", ")}.)` : "";
  return `${sections.join("\n\n")}${note}`;
}

/** One entry as it appears in the prompt. Sizing uses the same function, so the
 *  budget cannot drift from what is actually rendered. */
function renderEntry(entry: MemoryEntry): string {
  return `- ${entry.at ? `${entry.at} — ` : ""}${entry.text.replace(/\n/g, "\n  ")}`;
}

/** Newest entries that fit, returned oldest-first so the file order is kept. */
function takeNewest(entries: MemoryEntry[], budget: number): { kept: MemoryEntry[]; used: number } {
  const kept: MemoryEntry[] = [];
  let used = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const size = renderEntry(entries[i]).length + 1; // + newline
    if (used + size > budget) break;
    used += size;
    kept.unshift(entries[i]);
  }
  return { kept, used };
}
