/**
 * Subagents (FR-G).
 *
 * A subagent is a fresh agent context with a narrow job: it reads, it reports, and
 * it **never changes anything**. That constraint is not a style choice — the AI SDK
 * does not allow approval flows inside a subagent ("Subagent tools cannot use
 * approval flows… All tools must execute automatically"), so a subagent that could
 * write would write without the user ever being asked. Every write therefore stays
 * with the main agent, which has the approval card (FR-G6).
 *
 * Definitions come in three layers, most specific first (FR-G1, FR-G2):
 *   project files `<project>/.agents/agents/*.md`  →  app rows (`subagents` table,
 *   created through the UI)  →  built-ins shipped with the app.
 *
 * The file format follows the convention already used in this repo
 * (`.opencode/skills/ship/subagents/*.md`): frontmatter with `name`, `description`,
 * `tools`, then a markdown body of instructions. `tools` there uses agent-tool
 * names (`Read`, `Grep`, `Glob`) while our tools are snake_case, so names are
 * mapped; anything state-changing is refused rather than silently dropped
 * (FR-G7) — a definition that asks for `Bash` is a definition whose author wanted
 * behaviour this runtime must not give a subagent.
 */
import fs from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./skills";

export type SubagentSource = "project" | "app" | "builtin";

export interface SubagentInfo {
  name: string;
  description: string;
  /** Our tool names, already mapped and guaranteed read-only. */
  tools: string[];
  instructions: string;
  source: SubagentSource;
  maxSteps: number;
}

export interface RejectedSubagent {
  name: string;
  source: SubagentSource;
  reason: string;
}

export interface SubagentResolution {
  subagents: SubagentInfo[];
  rejected: RejectedSubagent[];
}

/** Read-only toolset a subagent may be given. `task` is absent on purpose: no
 *  recursion, so a runaway delegation chain cannot exist. */
export const SUBAGENT_TOOLS = ["read_file", "list_dir", "glob", "grep", "skill_read", "web_fetch"] as const;

/** Names that mean "change something". Compared WITHOUT underscores, so
 *  `write_file`, `writeFile` and our own `memory_write` all land here and get the
 *  explanation the author needs — rather than a bare "unknown tool", which would
 *  hide why the definition was refused (FR-G7). */
const MUTATING_TOOL_ALIASES = new Set([
  "bash",
  "shell",
  "run",
  "write",
  "writefile",
  "edit",
  "editfile",
  "multiedit",
  "notebookedit",
  "memorywrite",
  "task",
]);

/** Ecosystem-style names → our tool names. Keys are lower-cased on comparison. */
const TOOL_ALIASES: Record<string, string> = {
  read: "read_file",
  readfile: "read_file",
  read_file: "read_file",
  list: "list_dir",
  ls: "list_dir",
  listdir: "list_dir",
  list_dir: "list_dir",
  grep: "grep",
  glob: "glob",
  find: "glob",
  webfetch: "web_fetch",
  web_fetch: "web_fetch",
  fetch: "web_fetch",
  skill: "skill_read",
  skillread: "skill_read",
  skill_read: "skill_read",
};

export const SUBAGENT_LIMITS = {
  subagents: 40,
  descriptionChars: 240,
  instructionsChars: 12_000,
  /** Steps a subagent may take. Smaller than the main agent by design: it exists
   *  to answer one narrow question, and its work must not rival the task itself. */
  maxSteps: 12,
  /** How many subagents may run at once within a turn (FR-G4). */
  concurrency: 3,
  /** Cap on the text handed back to the parent, so a chatty subagent cannot
   *  balloon the main context — the whole reason to delegate (FR-G3). */
  resultChars: 8000,
} as const;

/** Built-in subagents (FR-G6). They exist because the most valuable use of a
 *  separate context is reading a lot and saying a little. */
export const BUILTIN_SUBAGENTS: SubagentInfo[] = [
  {
    name: "explorer",
    description:
      "Cari berkas, simbol, dan teks di workspace dengan konteks terpisah, lalu kembalikan ringkasan beserta path dan nomor barisnya. " +
      "Pakai ini kalau jawabannya butuh membaca banyak berkas — konteks utama tidak perlu ikut membengkak.",
    tools: ["glob", "grep", "read_file", "list_dir"],
    source: "builtin",
    maxSteps: 12,
    instructions: `You are a read-only explorer. You are given one narrow question about a project workspace.
Use glob/grep to locate things and read_file to confirm; then answer with:
- the direct answer first (one or two sentences),
- then a short list of the files/lines that support it, as \`path:line\`.
Do not paste long file contents: quote at most a few lines per finding. Never speculate about files you did not open.
If you cannot find something, say which patterns you tried.`,
  },
  {
    name: "analyzer",
    description:
      "Baca sekumpulan artefak (FSD, spec, ERD, task, RTM, SIT) dan kembalikan temuan terstruktur tentang isinya. " +
      "Pakai untuk pertanyaan yang jawabannya perlu membaca dokumen panjang.",
    tools: ["read_file", "list_dir", "glob", "grep", "skill_read"],
    source: "builtin",
    maxSteps: 12,
    instructions: `You are a read-only artifact analyst. Read the artifacts named in the task, then report:
- what the artifacts actually say (facts, with \`path:line\` references),
- contradictions or gaps you found between them,
- what you could not determine from the artifacts alone.
Keep it structured and terse. Never restate a whole document; summarise with references.
If a skill describes the expected format of an artifact, read it before judging the artifact.`,
  },
  {
    name: "verifier",
    description:
      "Periksa konsistensi antar artefak — mis. requirement di FSD yang belum punya endpoint, ERD, atau test case — dan kembalikan daftar masalahnya.",
    tools: ["read_file", "list_dir", "glob", "grep", "skill_read"],
    source: "builtin",
    maxSteps: 12,
    instructions: `You are a read-only consistency verifier. Compare the artifacts you are pointed at and return a findings list, each row:
\`severity | issue | evidence (path:line)\`
Severities: HIGH (a requirement with no implementation path), MEDIUM (mismatch that a human must decide), LOW (style/naming).
Report only what the files show. If two artifacts disagree, quote both sides. Do not propose fixes unless asked.`,
  },
];

/** Maps a declared tool name to ours, or returns why it cannot be allowed. */
function mapTool(raw: string): { tool: string } | { reason: string } {
  const lower = raw.trim().toLowerCase().replace(/[^a-z_]/g, "");
  if (!lower) return { reason: "" }; // ignore empty entries from trailing commas
  if (MUTATING_TOOL_ALIASES.has(lower.replace(/_/g, ""))) {
    return {
      reason:
        `Subagent tidak boleh memakai tool yang mengubah state ("${raw.trim()}"). ` +
        `AI SDK tidak mengizinkan approval di dalam subagent, jadi penulisan akan terjadi tanpa persetujuan user (FR-G6). ` +
        `Penulisan tetap dilakukan agent utama yang punya kartu approval.`,
    };
  }
  const mapped = TOOL_ALIASES[lower];
  if (!mapped) return { reason: `Tool "${raw.trim()}" tidak dikenal. Yang tersedia: ${SUBAGENT_TOOLS.join(", ")}.` };
  return { tool: mapped };
}

export interface ParsedSubagent {
  name: string;
  description: string;
  tools: string[];
  instructions: string;
  maxSteps: number;
}

/** Parses one definition (file body or DB row content) into a validated subagent. */
export function parseSubagent(
  content: string,
  opts: { fallbackName?: string; defaultTools?: string[] } = {},
): { ok: true; value: ParsedSubagent } | { ok: false; reason: string } {
  const meta = parseFrontmatter(content);
  const name = (meta.name ?? "").trim() || (opts.fallbackName ?? "").trim();
  if (!name) return { ok: false, reason: "Definisi subagent tidak punya `name` di frontmatter." };
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(name)) return { ok: false, reason: `Nama subagent "${name}" tidak sah (huruf, angka, titik, garis).` };

  const description = (meta.description ?? "").trim();
  if (!description) return { ok: false, reason: `Subagent "${name}" tidak punya \`description\` — tanpa itu agent utama tidak tahu kapan memakainya.` };

  // Body = everything after the frontmatter block.
  const body = content.replace(/^\uFEFF?---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, "").trim();
  if (!body) return { ok: false, reason: `Subagent "${name}" tidak punya instruksi (body kosong).` };

  const declared = (meta.tools ?? "")
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);

  const tools: string[] = [];
  const problems: string[] = [];
  for (const raw of declared) {
    const mapped = mapTool(raw);
    if ("reason" in mapped) {
      if (mapped.reason) problems.push(mapped.reason);
      continue;
    }
    if (!tools.includes(mapped.tool)) tools.push(mapped.tool);
  }
  if (problems.length) return { ok: false, reason: problems.join(" ") };

  // No tools declared → default to the read-only set: least surprise, and never
  // wider than what a subagent is allowed to touch.
  const finalTools = tools.length ? tools : (opts.defaultTools ?? [...SUBAGENT_TOOLS]).filter((t) => t !== "web_fetch");

  const rawSteps = Number(meta.maxSteps ?? meta.max_steps ?? "");
  const maxSteps = Number.isFinite(rawSteps) && rawSteps > 0 ? Math.min(30, Math.round(rawSteps)) : SUBAGENT_LIMITS.maxSteps;

  return {
    ok: true,
    value: {
      name,
      description: description.slice(0, SUBAGENT_LIMITS.descriptionChars),
      tools: finalTools,
      instructions: body.slice(0, SUBAGENT_LIMITS.instructionsChars),
      maxSteps,
    },
  };
}

/** Project-level definitions: `<project>/.agents/agents/*.md` (FR-G1). */
function readProjectLayer(root: string): { found: ParsedSubagent[]; rejected: RejectedSubagent[] } {
  const dir = path.join(root, ".agents", "agents");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { found: [], rejected: [] };
  }
  const found: ParsedSubagent[] = [];
  const rejected: RejectedSubagent[] = [];
  for (const entry of entries) {
    if (!entry.name.endsWith(".md")) continue;
    const file = path.join(dir, entry.name);
    let content: string;
    try {
      content = fs.readFileSync(file, "utf-8");
    } catch {
      continue;
    }
    const parsed = parseSubagent(content, { fallbackName: entry.name.replace(/\.md$/, "") });
    if (parsed.ok) found.push(parsed.value);
    else rejected.push({ name: entry.name.replace(/\.md$/, ""), source: "project", reason: parsed.reason });
  }
  return { found, rejected };
}

/** App-level definitions from the `subagents` table (FR-G2, created via the UI). */
export function parseAppRow(row: { name: string; description: string; toolsJson: string | null; instructions: string; maxSteps: number | null }): { ok: true; value: ParsedSubagent } | { ok: false; reason: string } {
  const tools = (() => {
    try {
      const parsed = JSON.parse(row.toolsJson ?? "[]");
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  })();
  return parseSubagent(
    `---\nname: ${row.name}\ndescription: ${row.description}\ntools: ${tools.join(", ")}\nmaxSteps: ${row.maxSteps ?? ""}\n---\n\n${row.instructions}`,
  );
}

/** All subagents, most specific definition winning a name collision (FR-G2). */
export function resolveSubagents(root: string, appRows: { name: string; description: string; toolsJson: string | null; instructions: string; maxSteps: number | null }[] = []): SubagentResolution {
  const project = readProjectLayer(root);
  const rejected = [...project.rejected];
  const app: ParsedSubagent[] = [];
  for (const row of appRows) {
    const parsed = parseAppRow(row);
    if (parsed.ok) app.push(parsed.value);
    else rejected.push({ name: row.name, source: "app", reason: parsed.reason });
  }

  const byName = new Map<string, SubagentInfo>();
  for (const [source, list] of [
    ["project", project.found],
    ["app", app],
    ["builtin", BUILTIN_SUBAGENTS],
  ] as const) {
    for (const def of list) {
      if (byName.has(def.name)) continue;
      byName.set(def.name, { ...def, source });
    }
  }

  return {
    subagents: [...byName.values()].sort((a, b) => a.name.localeCompare(b.name)).slice(0, SUBAGENT_LIMITS.subagents),
    rejected,
  };
}

export function findSubagent(root: string, name: string, appRows: Parameters<typeof resolveSubagents>[1] = []): SubagentInfo | null {
  return resolveSubagents(root, appRows).subagents.find((s) => s.name === name) ?? null;
}

/** What the main prompt gets: name + description, never the instructions (same
 *  progressive-disclosure rule as skills). */
export function subagentSummaries(subagents: SubagentInfo[]): { name: string; description: string }[] {
  return subagents.map((s) => ({ name: s.name, description: s.description }));
}

/**
 * Bounded concurrency for subagent runs (FR-G4).
 *
 * A semaphore rather than a queue size check: `task` calls in one step may start
 * together, and the ones over the limit should wait their turn instead of failing.
 */
let activeSubagents = 0;
const waiting: (() => void)[] = [];

export async function withSubagentSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (activeSubagents >= SUBAGENT_LIMITS.concurrency) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  activeSubagents++;
  try {
    return await fn();
  } finally {
    activeSubagents--;
    waiting.shift()?.();
  }
}

/** Exposed for the verification suite: how many are running right now. */
export function activeSubagentCount(): number {
  return activeSubagents;
}
