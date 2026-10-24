/**
 * Per-repo check commands (typecheck, lint, test) that validation runs in a task's worktree.
 * They are stored in `.agents/onesist-worktree.json` at the project root, next to the setup
 * commands, so a team shares them through the repo. The agent never chooses them.
 */
import fs from "node:fs";
import path from "node:path";

export interface CheckCommand {
  name: string;
  command: string;
}

/** Same file as `workspace/setup.ts` (SETUP_CONFIG); kept here so this module needs no database. */
const CONFIG_FILE = path.join(".agents", "onesist-worktree.json");
const MAX_CHECKS = 10;
const SCRIPT_NAMES = ["typecheck", "lint", "test", "build"];

interface WorktreeConfig {
  setup: Record<string, string>;
  checks: Record<string, CheckCommand[]>;
  [key: string]: unknown;
}

function readConfig(root: string): WorktreeConfig {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, CONFIG_FILE), "utf-8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return { ...parsed, setup: parsed.setup ?? {}, checks: parsed.checks ?? {} };
    }
  } catch {
    /* missing or broken: treated as empty, and rewritten only when the user saves */
  }
  return { setup: {}, checks: {} };
}

export function readWorktreeConfig(root: string): { setup: Record<string, string>; checks: Record<string, CheckCommand[]> } {
  const config = readConfig(root);
  return { setup: config.setup, checks: config.checks };
}

/** The scripts a repo's package.json defines among the usual checks, run with the runner the repo uses. */
export function suggestChecks(repoPath: string): CheckCommand[] {
  let scripts: Record<string, unknown> = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(repoPath, "package.json"), "utf-8"));
    scripts = pkg?.scripts && typeof pkg.scripts === "object" ? pkg.scripts : {};
  } catch {
    return [];
  }
  const runner = fs.existsSync(path.join(repoPath, "bun.lock")) ? "bun run" : "npm run";
  return SCRIPT_NAMES.filter((name) => typeof scripts[name] === "string").map((name) => ({ name, command: `${runner} ${name}` }));
}

export function saveChecks(root: string, repoId: string, checks: unknown): { ok: true; checks: CheckCommand[] } | { ok: false; error: string } {
  if (!Array.isArray(checks)) return { ok: false, error: "Daftar cek harus berupa daftar" };
  if (checks.length > MAX_CHECKS) return { ok: false, error: `Maksimal ${MAX_CHECKS} perintah cek` };
  const clean: CheckCommand[] = [];
  for (const item of checks) {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const command = typeof item?.command === "string" ? item.command.trim() : "";
    if (!name || name.length > 40) return { ok: false, error: "Nama cek harus 1–40 karakter" };
    if (!command) return { ok: false, error: "Perintah cek tidak boleh kosong" };
    if (command.length > 300) return { ok: false, error: "Perintah cek maksimal 300 karakter" };
    clean.push({ name, command });
  }
  const config = readConfig(root);
  config.checks = { ...config.checks, [repoId]: clean };
  const file = path.join(root, CONFIG_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
  return { ok: true, checks: clean };
}
