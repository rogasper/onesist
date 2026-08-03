import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface SkillStatus {
  name: string;
  source: string;
  installArgs: string[];
  status: "installed" | "missing" | "invalid" | "installing" | "failed";
  path: string | null;
  error?: string | null;
}

export const REQUIRED_SKILLS: Omit<SkillStatus, "status" | "path" | "error">[] = [
  {
    name: "fsd-analyzer",
    source: "https://github.com/rogasper/system-analyst-skill",
    installArgs: [
      "skills", "add", "https://github.com/rogasper/system-analyst-skill",
      "--skill", "fsd-analyzer",
      "--agent", "opencode",
      "--yes",
    ],
  },
  {
    name: "markitdown",
    source: "https://github.com/julianobarbosa/claude-code-skills",
    installArgs: [
      "skills", "add", "https://github.com/julianobarbosa/claude-code-skills",
      "--skill", "markitdown",
      "--agent", "opencode",
      "--yes",
    ],
  },
];

function skillDir(projectRoot: string, name: string): string {
  return path.join(projectRoot, ".agents", "skills", name);
}

function hasValidSkill(projectRoot: string, name: string): boolean {
  const dir = skillDir(projectRoot, name);
  const sk = path.join(dir, "SKILL.md");
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

function run(cmd: string, args: string[], cwd: string, timeoutMs = 180_000): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"], shell: false });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch {}
      resolve({ code: -1, stdout, stderr: "installation timeout" });
    }, timeoutMs);
    proc.stdout.on("data", (d) => { stdout += d; });
    proc.stderr.on("data", (d) => { stderr += d; });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: -2, stdout, stderr: `spawn error: ${err.message}` });
    });
  });
}

export interface InstallResult {
  ok: boolean;
  installed: string[];
  skipped: string[];
  failed: { name: string; error: string }[];
  statuses: SkillStatus[];
}

/**
 * Install the required project skills into <projectRoot>/.agents/skills.
 * Only missing/invalid skills are installed; existing valid skills are skipped.
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
    try {
      fs.mkdirSync(path.join(projectRoot, ".agents"), { recursive: true });
    } catch (e: any) {
      failed.push({ name: req.name, error: `Cannot create .agents dir: ${e?.message ?? e}` });
      statuses.push({ ...req, status: "failed", path: null, error: `Cannot create .agents dir: ${e?.message ?? e}` });
      continue;
    }
    statuses.push({ ...req, status: "installing", path: null, error: null });
    const res = await run("npx", ["--yes", ...req.installArgs], projectRoot);
    if (res.code === 0 && hasValidSkill(projectRoot, req.name)) {
      installed.push(req.name);
      statuses.push({ ...req, status: "installed", path: path.join(".agents", "skills", req.name, "SKILL.md"), error: null });
    } else {
      const error = (res.stderr || res.stdout || `command exited with code ${res.code}`).trim().slice(0, 2000);
      failed.push({ name: req.name, error });
      statuses.push({ ...req, status: "failed", path: null, error });
    }
  }

  return { ok: failed.length === 0, installed, skipped, failed, statuses };
}
