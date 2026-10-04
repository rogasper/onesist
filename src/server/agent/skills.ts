/**
 * Skill discovery for the native agent (FR-F).
 *
 * A skill is a directory with a `SKILL.md` (frontmatter: name + description) and
 * usually a `references/` folder. Only name + description ever reach the system
 * prompt; the body is read on demand through the `skill_read` tool. That is the
 * whole point of the format — this repo's own `fsd-analyzer` has twenty reference
 * files, and pasting them into every prompt would dwarf the actual conversation.
 *
 * Precedence is what makes the layered lookup worth having: a project that ships
 * its own `fsd-analyzer` must beat the app's bundled copy, because the project's
 * version carries that team's conventions (FR-F5).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { vendorDir } from "~/lib/project-skills";

/** Where a skill came from, most specific first. */
export type SkillSource = "project" | "claude" | "opencode" | "user" | "vendor";

export interface SkillInfo {
  name: string;
  description: string;
  source: SkillSource;
  /** Absolute directory containing SKILL.md. */
  dir: string;
  skillFile: string;
  /** Files under `references/`, relative to the skill dir, sorted. */
  files: string[];
}

/** Caps. A skill folder is data from a repo, so nothing here may be unbounded. */
export const SKILL_LIMITS = {
  /** How many skills may be DISCOVERED. Generous on purpose: this only bounds a
   *  filesystem scan, and the `$` popup should be able to reach every skill. */
  discovered: 200,
  /** How many may enter the system prompt — a token budget, not a scan limit. */
  skills: 40,
  descriptionChars: 240,
  referenceFiles: 200,
} as const;

/**
 * Minimal frontmatter reader: the leading `---` block, `key: value` per line.
 * Deliberately not a YAML parser — SKILL.md in the wild is a flat map of
 * scalars, and a dependency for that would be the wrong trade.
 */
export function parseFrontmatter(content: string): Record<string, string> {
  const match = /^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return {};
  const out: Record<string, string> = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const sep = line.indexOf(":");
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    // Strip one layer of matching quotes; descriptions are often quoted.
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/** Reference files for a skill, capped and sorted so the list is stable. */
function listReferenceFiles(dir: string): string[] {
  const refDir = path.join(dir, "references");
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(refDir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort()
    .slice(0, SKILL_LIMITS.referenceFiles)
    .map((name) => `references/${name}`);
}

/** Reads one skill directory. Returns null when it is not a usable skill. */
function readSkillDir(dir: string, source: SkillSource): SkillInfo | null {
  const skillFile = path.join(dir, "SKILL.md");
  let content: string;
  try {
    content = fs.readFileSync(skillFile, "utf-8");
  } catch {
    return null;
  }
  const meta = parseFrontmatter(content);
  // Without a name there is nothing to reference the skill by — the folder name
  // is a fallback, but a skill that does not declare itself is usually broken.
  const name = (meta.name ?? "").trim() || path.basename(dir);
  const description = (meta.description ?? "").trim();
  return { name, description, source, dir, skillFile, files: listReferenceFiles(dir) };
}

/** True for real directories AND symlinks to directories.
 *
 *  This matters more than it looks: `npx skills add` defaults to *symlinking*
 *  each agent's folder to one canonical copy, and `Dirent.isDirectory()` is
 *  false for a symlink — so following the link is the difference between a
 *  skill being usable and being invisible. */
function isDirLike(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/** Skills in one directory of skill folders (`<root>/<name>/SKILL.md`). */
function readSkillLayer(root: string, source: SkillSource): SkillInfo[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: SkillInfo[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const dir = path.join(root, entry.name);
    if (!isDirLike(dir)) continue;
    const skill = readSkillDir(dir, source);
    if (skill) out.push(skill);
  }
  return out;
}

/** Skills bundled with the app (`vendor/skills/*`). */
function readVendorLayer(): SkillInfo[] {
  const base = process.env.SA_VENDOR_SKILLS_DIR ? path.resolve(process.env.SA_VENDOR_SKILLS_DIR) : path.resolve(process.cwd(), "vendor", "skills");
  let names: string[] = [];
  try {
    names = fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
  const out: SkillInfo[] = [];
  for (const name of names) {
    // `vendorDir()` resolves the real location across dev/web/desktop layouts.
    const skill = readSkillDir(vendorDir(name), "vendor");
    if (skill) out.push(skill);
  }
  return out;
}

/** Layered lookup, most specific first (FR-F1). */
export function resolveSkills(root: string, opts: { userDir?: string } = {}): SkillInfo[] {
  const layers: SkillInfo[] = [
    ...readSkillLayer(path.join(root, ".agents", "skills"), "project"),
    ...readSkillLayer(path.join(root, ".claude", "skills"), "claude"),
    ...readSkillLayer(path.join(root, ".opencode", "skills"), "opencode"),
    ...readSkillLayer(opts.userDir ?? path.join(os.homedir(), ".agents", "skills"), "user"),
    ...readVendorLayer(),
  ];

  // First layer wins on a name collision (FR-F5). Sorted by layer priority and
  // then by name, so the `$` popup shows skills in the same order the prompt
  // budgets them, and truncation hits the most distant layer first.
  const byName = new Map<string, SkillInfo>();
  for (const skill of layers) {
    if (!byName.has(skill.name)) byName.set(skill.name, skill);
  }
  return [...byName.values()]
    .sort((a, b) => PROMPT_PRIORITY.indexOf(a.source) - PROMPT_PRIORITY.indexOf(b.source) || a.name.localeCompare(b.name))
    .slice(0, SKILL_LIMITS.discovered);
}

/** Prompt-budget order. Project- and app-scoped skills define the artifact
 *  conventions this app exists to follow, so they must always make the prompt;
 *  the user's global folder is a large grab-bag (on this machine it holds video
 *  and animation skills) and may only fill what is left. */
const PROMPT_PRIORITY: SkillSource[] = ["project", "claude", "opencode", "vendor", "user"];

/** What the system prompt gets: name + truncated description, nothing else (FR-F2).
 *
 *  Ordered by `PROMPT_PRIORITY` and capped, so a workspace with dozens of global
 *  skills cannot push the project's own conventions out of the prompt. */
export function skillSummaries(skills: SkillInfo[]): { name: string; description: string }[] {
  const ordered = [...skills].sort((a, b) => PROMPT_PRIORITY.indexOf(a.source) - PROMPT_PRIORITY.indexOf(b.source));
  return ordered.slice(0, SKILL_LIMITS.skills).map((s) => ({
    name: s.name,
    description: s.description.length > SKILL_LIMITS.descriptionChars ? `${s.description.slice(0, SKILL_LIMITS.descriptionChars - 1)}…` : s.description,
  }));
}

export type SkillReadResult =
  | { ok: true; skill: SkillInfo; content: string; files: string[]; isFile: boolean }
  | { ok: false; error: string };

/**
 * Reads a skill's SKILL.md, or one file inside it.
 *
 * `file` is attacker-reachable in the sense that the model chooses it, so it is
 * resolved and then checked to still be inside the skill directory — the same
 * guard the write tools use, for the same reason.
 */
export function readSkill(root: string, name: string, file?: string): SkillReadResult {
  const skills = resolveSkills(root);
  const skill = skills.find((s) => s.name === name);
  if (!skill) {
    const names = skills.map((s) => s.name);
    return { ok: false, error: `Skill "${name}" tidak ditemukan.${names.length ? ` Yang tersedia: ${names.join(", ")}.` : ""}` };
  }

  const wanted = (file ?? "").trim().replace(/^\.\//, "");
  if (!wanted) {
    try {
      return { ok: true, skill, content: fs.readFileSync(skill.skillFile, "utf-8"), files: skill.files, isFile: false };
    } catch (err: any) {
      return { ok: false, error: `Gagal membaca SKILL.md: ${err?.message ?? err}` };
    }
  }

  // Accept both `references/x.md` and `x.md`.
  const candidates = [wanted, `references/${wanted}`];
  for (const candidate of candidates) {
    if (path.isAbsolute(candidate)) continue;
    const abs = path.resolve(skill.dir, candidate);
    // Must stay inside the skill directory.
    if (abs !== skill.dir && !abs.startsWith(skill.dir + path.sep)) continue;
    try {
      if (!fs.statSync(abs).isFile()) continue;
    } catch {
      continue;
    }
    try {
      return { ok: true, skill, content: fs.readFileSync(abs, "utf-8"), files: skill.files, isFile: true };
    } catch (err: any) {
      return { ok: false, error: `Gagal membaca ${candidate}: ${err?.message ?? err}` };
    }
  }

  return {
    ok: false,
    error: `Berkas "${wanted}" tidak ada di skill ${skill.name}. Yang tersedia: ${skill.files.join(", ") || "(tidak ada referensi)"}.`,
  };
}
