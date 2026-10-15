/**
 * The git repos a thread can work in, and new worktrees for them (Fase 4C). Everything a
 * client names (repo, worktree path, branch, base) is checked against what the server finds
 * or against git's own ref rules before git runs.
 */
import fs from "node:fs";
import path from "node:path";
import { lastLine, parseWorktreeList, runGit, type WorktreeEntry } from "./git";
import { isInside, realOrResolved, worktreeDirFor } from "./location";

export interface RepoInfo {
  /** "." = the project root itself; otherwise `input/code/<name>`. */
  id: string;
  absPath: string;
}

/** The project root when it is a repo, then each repo directly under input/code. */
export function listProjectRepos(projectRoot: string): RepoInfo[] {
  const repos: RepoInfo[] = [];
  if (fs.existsSync(path.join(projectRoot, ".git"))) repos.push({ id: ".", absPath: realOrResolved(projectRoot) });
  const codeDir = path.join(projectRoot, "input", "code");
  let names: string[] = [];
  try {
    names = fs
      .readdirSync(codeDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    names = [];
  }
  for (const name of names) {
    const abs = path.join(codeDir, name);
    if (fs.existsSync(path.join(abs, ".git"))) repos.push({ id: `input/code/${name}`, absPath: realOrResolved(abs) });
  }
  return repos;
}

export function findRepo(projectRoot: string, repoId: string): RepoInfo | null {
  return listProjectRepos(projectRoot).find((r) => r.id === repoId) ?? null;
}

/** The repo's other worktrees (its main checkout left out), with real paths. */
export async function linkedWorktrees(repo: RepoInfo): Promise<WorktreeEntry[]> {
  const res = await runGit(repo.absPath, ["worktree", "list", "--porcelain"]);
  if (res.code !== 0) return [];
  return parseWorktreeList(res.stdout)
    .map((w) => ({ ...w, path: realOrResolved(w.path) }))
    .filter((w) => !w.bare && w.path !== repo.absPath);
}

export async function currentBranch(absPath: string): Promise<string | null> {
  const res = await runGit(absPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const name = res.stdout.trim();
  return res.code === 0 && name && name !== "HEAD" ? name : null;
}

export type CreateResult = { ok: true; path: string; branch: string } | { ok: false; error: string; status: number };

/** Plain ref names only: no options, no revision syntax (`^`, `~`, `:`), no spaces. */
const SAFE_REF = /^[A-Za-z0-9._/-]+$/;

export async function createWorktree(input: {
  repo: RepoInfo;
  projectId: string;
  projectRoot: string;
  baseDir: string;
  branch: string;
  baseRef: string | null;
  fromOrigin: boolean;
}): Promise<CreateResult> {
  const { repo } = input;
  if (isInside(input.baseDir, input.projectRoot)) {
    return {
      ok: false,
      status: 400,
      error: `Lokasi worktree (${input.baseDir}) ada di dalam folder project. Atur SA_WORKTREES_DIR ke folder di luar project.`,
    };
  }
  const branch = input.branch.trim();
  const branchOk =
    !!branch && !branch.startsWith("-") && SAFE_REF.test(branch) && (await runGit(repo.absPath, ["check-ref-format", "--branch", branch])).code === 0;
  if (!branchOk) return { ok: false, status: 400, error: `Nama branch "${branch}" tidak valid.` };
  if ((await runGit(repo.absPath, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`])).code === 0) {
    return { ok: false, status: 409, error: `Branch "${branch}" sudah ada. Pilih nama lain, atau pakai "Worktree yang sudah ada".` };
  }

  let base = (input.baseRef ?? "").trim() || (await currentBranch(repo.absPath)) || "HEAD";
  if (base.startsWith("-") || !SAFE_REF.test(base)) return { ok: false, status: 400, error: `Base "${base}" tidak valid.` };
  if (input.fromOrigin) {
    const fetched = await runGit(repo.absPath, ["fetch", "origin", base], 300_000);
    if (fetched.code !== 0) return { ok: false, status: 502, error: `Gagal mengambil origin/${base}: ${lastLine(fetched.stderr)}` };
    base = `origin/${base}`;
  }
  if ((await runGit(repo.absPath, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`])).code !== 0) {
    return { ok: false, status: 400, error: `Base "${base}" tidak ditemukan di repo ${repo.id}.` };
  }

  const dir = worktreeDirFor({ baseDir: input.baseDir, projectId: input.projectId, repoId: repo.id, branch });
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const added = await runGit(repo.absPath, ["worktree", "add", "-b", branch, dir, base], 300_000);
  if (added.code !== 0) return { ok: false, status: 500, error: `git worktree add gagal: ${lastLine(added.stderr)}` };
  return { ok: true, path: realOrResolved(dir), branch };
}
