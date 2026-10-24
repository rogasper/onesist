/**
 * What a run changed, per repo and per file, for the review. Read-only: git only reads here.
 */
import { eq } from "drizzle-orm";
import { runGit } from "~/server/agent/workspace/git";
import { db } from "~/server/db/client";
import { taskRunRepos, taskRuns } from "~/server/db/schema";

export const PATCH_LIMIT = 40_000;

export interface DiffFile {
  path: string;
  status: "modified" | "added" | "deleted" | "untracked";
  patch: string;
  truncated: boolean;
}

export interface RepoDiff {
  repo: string;
  files: DiffFile[];
}

const STATUS: Record<string, DiffFile["status"]> = { M: "modified", A: "added", D: "deleted" };

function cut(patch: string): { patch: string; truncated: boolean } {
  return patch.length > PATCH_LIMIT ? { patch: patch.slice(0, PATCH_LIMIT), truncated: true } : { patch, truncated: false };
}

/** Diff of every repo of a run against its base commit, untracked files included. Null when the run does not exist. */
export async function runDiff(runId: string): Promise<RepoDiff[] | null> {
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, runId)).get();
  if (!run) return null;
  const repos = db.select().from(taskRunRepos).where(eq(taskRunRepos.runId, runId)).all();
  const out: RepoDiff[] = [];
  for (const repo of repos) {
    if (!repo.worktreePath) continue;
    const files: DiffFile[] = [];
    if (repo.baseCommit) {
      const names = await runGit(repo.worktreePath, ["diff", "--name-status", repo.baseCommit]);
      for (const line of names.stdout.split("\n").filter(Boolean)) {
        const [code, ...rest] = line.split("\t");
        const path = rest.join("\t");
        const status = STATUS[code[0]] ?? "modified";
        const patch = await runGit(repo.worktreePath, ["diff", repo.baseCommit, "--", path]);
        files.push({ path, status, ...cut(patch.stdout) });
      }
    }
    const untracked = await runGit(repo.worktreePath, ["ls-files", "--others", "--exclude-standard"]);
    for (const path of untracked.stdout.split("\n").filter(Boolean)) {
      // `--no-index` exits 1 when the files differ, which is the normal case here.
      const patch = await runGit(repo.worktreePath, ["diff", "--no-index", "--", "/dev/null", path]);
      files.push({ path, status: "untracked", ...cut(patch.stdout) });
    }
    out.push({ repo: repo.repo, files });
  }
  return out;
}
