import fs from "node:fs";
import path from "node:path";

export interface SkillStatus {
  name: string;
  source: string;
  status: "installed" | "missing" | "invalid" | "outdated" | "installing" | "failed";
  path: string | null;
  version?: string | null;
  latestVersion?: string | null;
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
  // Desktop sidecar points here at the appData copy (see SA_VENDOR_SKILLS_DIR).
  const fromEnv = process.env.SA_VENDOR_SKILLS_DIR
    ? path.resolve(process.env.SA_VENDOR_SKILLS_DIR, name)
    : "";
  const fromCwd = path.resolve(process.cwd(), "vendor", "skills", name);
  // Web production: dist/server/vendor-skills/<name> (copied by build:server).
  const fromDist = path.resolve(import.meta.dirname, "..", "vendor-skills", name);
  const fromModule = path.resolve(import.meta.dirname, "..", "..", "vendor", "skills", name);
  const candidates = [fromEnv, fromCwd, fromDist, fromModule].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "SKILL.md"))) return c;
  }
  return candidates[0] ?? fromCwd;
}

/** Parse the `version` field from a SKILL.md frontmatter block, or null. */
function skillVersion(skillFilePath: string): string | null {
  try {
    const content = fs.readFileSync(skillFilePath, "utf-8");
    const m = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (!m) return null;
    const v = m[1].match(/^version:\s*(.+)$/m);
    return v ? v[1].trim() : null;
  } catch {
    return null;
  }
}

/**
 * Compare dotted numeric versions like "1.2.3". Missing/legacy (no version
 * field) = 0, so a vendored version always supersedes an unversioned install.
 */
function isNewer(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a) return false;
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = (b ? b.split(".") : []).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
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
        const installed = skillVersion(path.join(dir, "SKILL.md"));
        const latest = skillVersion(path.join(vendorDir(req.dir), "SKILL.md"));
        if (isNewer(latest, installed)) {
          status = "outdated";
          error = `Update available: ${installed ?? "unknown"} → ${latest}`;
        } else {
          status = "installed";
        }
      } else {
        status = "invalid";
        error = "SKILL.md exists but is missing valid frontmatter or name";
      }
    }
    return {
      ...req,
      status,
      version: exists ? skillVersion(path.join(dir, "SKILL.md")) : null,
      latestVersion: skillVersion(path.join(vendorDir(req.dir), "SKILL.md")),
      path: exists ? path.join(".agents", "skills", req.name, "SKILL.md") : null,
      error,
    };
  });
}

export function areSkillsReady(projectRoot: string): boolean {
  return detectProjectSkills(projectRoot).every((s) => s.status === "installed");
}

export interface InstallResult {
  ok: boolean;
  installed: string[];
  updated: string[];
  skipped: string[];
  failed: { name: string; error: string }[];
  statuses: SkillStatus[];
}

/**
 * Copy the vendored skills from vendor/skills into <projectRoot>/.agents/skills.
 * Missing, invalid, and OUTDATED skills are copied; current skills are skipped.
 */
export async function installProjectSkills(projectRoot: string): Promise<InstallResult> {
  const installed: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const failed: { name: string; error: string }[] = [];
  const statuses: SkillStatus[] = [];

  for (const req of REQUIRED_SKILLS) {
    const status = detectProjectSkills(projectRoot).find((s) => s.name === req.name);
    if (status?.status === "installed") {
      skipped.push(req.name);
      statuses.push(status);
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
        const reinstall = status?.status === "outdated";
        (reinstall ? updated : installed).push(req.name);
        const latestVersion = skillVersion(path.join(vendor, "SKILL.md"));
        statuses.push({ ...req, status: "installed", version: latestVersion, latestVersion, path: path.join(".agents", "skills", req.name, "SKILL.md"), error: null });
      } else {
        throw new Error("copied SKILL.md failed validation");
      }
    } catch (e: any) {
      const error = `Copy failed: ${e?.message ?? e}`.slice(0, 2000);
      failed.push({ name: req.name, error });
      statuses.push({ ...req, status: "failed", path: null, error });
    }
  }

  return { ok: failed.length === 0, installed, updated, skipped, failed, statuses };
}
