import fs from "node:fs";
import path from "node:path";

export interface SkillStatus {
  name: string;
  source: string;
  status: "installed" | "missing" | "invalid" | "installing" | "failed";
  path: string | null;
  error?: string | null;
}

interface SkillDef {
  name: string;
  source: string;
  /** Directory under the dashboard's vendor/skills containing the skill files */
  dir: string;
}

export const REQUIRED_SKILLS: SkillDef[] = [
  {
    name: "fsd-analyzer",
    source: "https://github.com/rogasper/system-analyst-skill",
    dir: "fsd-analyzer",
  },
  {
    name: "markitdown",
    source: "https://github.com/julianobarbosa/claude-code-skills",
    dir: "markitdown",
  },
];

function skillDir(projectRoot: string, name: string): string {
  return path.join(projectRoot, ".agents", "skills", name);
}

function vendorDir(name: string): string {
  const fromCwd = path.resolve(process.cwd(), "vendor", "skills", name);
  if (fs.existsSync(path.join(fromCwd, "SKILL.md"))) return fromCwd;
  const fromModule = path.resolve(import.meta.dir, "..", "..", "vendor", "skills", name);
  return fromModule;
}

function hasValidSkill(projectRoot: string, name: string): boolean {
  const sk = path.join(skillDir(projectRoot, name), "SKILL.md");
  try {
    if (!fs.existsSync(sk)) return false;
    const content = fs.readFileSync(sk, "utf-8");
    return /^---\s*\n[\s\S]*?\n---\s*\n/.test(content) && content.includes(`name: ${name}`);
  } catch {
    return false;
  }
}

export function detectProjectSkills(projectRoot: string): SkillStatus[] {
  return REQUIRED_SKILLS.map((req) => {
    const dir = skillDir(projectRoot, req.name);
    const exists = fs.existsSync(path.join(dir, "SKILL.md"));
    let status: SkillStatus["status"] = "missing";
    let error: string | null = null;
    if (exists) {
      if (hasValidSkill(projectRoot, req.name)) {
        status = "installed";
      } else {
        status = "invalid";
        error = "SKILL.md exists but is missing valid frontmatter or name";
      }
    }
    return { ...req, status, path: exists ? path.join(".agents", "skills", req.name, "SKILL.md") : null, error };
  });
}

export function areSkillsReady(projectRoot: string): boolean {
  return detectProjectSkills(projectRoot).every((s) => s.status === "installed");
}

export interface InstallResult {
  ok: boolean;
  installed: string[];
  skipped: string[];
  failed: { name: string; error: string }[];
  statuses: SkillStatus[];
}

/**
 * Copy the vendored skills from vendor/skills into <projectRoot>/.agents/skills.
 * Only missing/invalid skills are copied; existing valid skills are skipped.
 */
export async function installProjectSkills(projectRoot: string): Promise<InstallResult> {
  const installed: string[] = [];
  const skipped: string[] = [];
  const failed: { name: string; error: string }[] = [];
  const statuses: SkillStatus[] = [];

  for (const req of REQUIRED_SKILLS) {
    if (hasValidSkill(projectRoot, req.name)) {
      skipped.push(req.name);
      statuses.push({ ...req, status: "installed", path: path.join(".agents", "skills", req.name, "SKILL.md"), error: null });
      continue;
    }
    const vendor = vendorDir(req.dir);
    if (!fs.existsSync(path.join(vendor, "SKILL.md"))) {
      const error = `Vendored skill missing: vendor/skills/${req.dir}/SKILL.md`;
      failed.push({ name: req.name, error });
      statuses.push({ ...req, status: "failed", path: null, error });
      continue;
    }
    try {
      statuses.push({ ...req, status: "installing", path: null, error: null });
      const dest = skillDir(projectRoot, req.name);
      fs.rmSync(dest, { recursive: true, force: true });
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(vendor, dest, { recursive: true });
      if (hasValidSkill(projectRoot, req.name)) {
        installed.push(req.name);
        statuses.push({ ...req, status: "installed", path: path.join(".agents", "skills", req.name, "SKILL.md"), error: null });
      } else {
        throw new Error("copied SKILL.md failed validation");
      }
    } catch (e: any) {
      const error = `Copy failed: ${e?.message ?? e}`.slice(0, 2000);
      failed.push({ name: req.name, error });
      statuses.push({ ...req, status: "failed", path: null, error });
    }
  }

  return { ok: failed.length === 0, installed, skipped, failed, statuses };
}
