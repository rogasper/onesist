/**
 * The git repositories a project can work in: the project root (when it is a repo) and each
 * repo folder under `input/code/`. Read-only: nothing here writes to a repo.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export interface RepoInfo {
  /** "." for the project root, otherwise the path relative to the root (e.g. "input/code/api"). */
  id: string;
  path: string;
  isGit: boolean;
  /** The branch currently checked out, or null when git cannot tell (no commits yet, not a repo). */
  baseBranch: string | null;
}

const CODE_DIR = path.join("input", "code");

function currentBranch(dir: string): string | null {
  try {
    const out = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: dir,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
    }).trim();
    return out && out !== "HEAD" ? out : null;
  } catch {
    return null;
  }
}

function isRepo(dir: string): boolean {
  return fs.existsSync(path.join(dir, ".git"));
}

export function listRepos(root: string): RepoInfo[] {
  const repos: RepoInfo[] = [];
  if (isRepo(root)) {
    repos.push({ id: ".", path: root, isGit: true, baseBranch: currentBranch(root) });
  }
  const codeDir = path.join(root, CODE_DIR);
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(codeDir, { withFileTypes: true });
  } catch {
    return repos;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = path.join(codeDir, entry.name);
    if (!entry.isDirectory() || !isRepo(dir)) continue;
    repos.push({ id: path.join(CODE_DIR, entry.name).split(path.sep).join("/"), path: dir, isGit: true, baseBranch: currentBranch(dir) });
  }
  return repos;
}
