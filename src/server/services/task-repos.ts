/**
 * The git repositories a project can work in: the project root (when it is a repo) and each
 * repo folder under `input/code/`. Read-only: nothing here writes to a repo.
 */
import { execFileSync } from "node:child_process";
import { listProjectRepos } from "~/server/agent/workspace/worktrees";

export interface RepoInfo {
  /** "." for the project root, otherwise the path relative to the root (e.g. "input/code/api"). */
  id: string;
  path: string;
  isGit: boolean;
  /** The branch currently checked out, or null when git cannot tell (no commits yet, not a repo). */
  baseBranch: string | null;
}

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

/** The project's repos, with the branch each one has checked out. Detection lives in workspace/worktrees. */
export function listRepos(root: string): RepoInfo[] {
  return listProjectRepos(root).map((r) => ({ id: r.id, path: r.absPath, isGit: true, baseBranch: currentBranch(r.absPath) }));
}
