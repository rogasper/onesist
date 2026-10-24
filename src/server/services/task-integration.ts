/**
 * Setujui: the run's work is committed and integrated, per repo, in the way the project chose.
 *   branch — the work stays on the run's branch.
 *   pr     — the branch is pushed and a pull request is opened with `gh`.
 *   merge  — the branch is merged into the repo's base branch, only when that is clean.
 * Each repo is done on its own, so a repo that failed can be retried without redoing the others.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { runGit } from "~/server/agent/workspace/git";
import { listProjectRepos } from "~/server/agent/workspace/worktrees";
import { db } from "~/server/db/client";
import { projects, taskRunRepos, taskRuns, tasks } from "~/server/db/schema";
import { criterionStatus } from "~/lib/run-report";
import { buildRunBody } from "~/lib/run-body";
import { getExecSettings } from "./exec-settings";
import { lastReport } from "./task-validation";
import { promoteQueued } from "./task-runs";

type Integration = "pr" | "branch" | "merge";

/** Runs a program and returns its output. Used for `gh`, which runs with the user's own login. */
function exec(file: string, args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(file, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c: Buffer) => (stdout += c.toString()));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    child.on("error", (err) => resolve({ code: 1, stdout, stderr: String(err) }));
  });
}

/** The commit title: the task title, which already starts with its code when it has one. */
export function commitTitle(task: { code: string | null; title: string }): string {
  return task.code && !task.title.startsWith(task.code) ? `${task.code}: ${task.title}` : task.title;
}

const IDENTITY = ["-c", "user.name=Onesist", "-c", "user.email=onesist@localhost"];

/** Commits whatever the run still has uncommitted, and returns HEAD. */
async function commitLeftovers(worktree: string, message: string): Promise<string | null> {
  const status = await runGit(worktree, ["status", "--porcelain"]);
  if (status.stdout.trim()) {
    await runGit(worktree, ["add", "-A"]);
    await runGit(worktree, [...IDENTITY, "commit", "-q", "-m", message]);
  }
  const head = await runGit(worktree, ["rev-parse", "HEAD"]);
  return head.code === 0 ? head.stdout.trim() : null;
}

/** The state GitHub reports for a PR, from `gh pr view --json state`. Anything else is unknown. */
export function parsePrState(stdout: string): "OPEN" | "MERGED" | "CLOSED" | null {
  const state = stdout.trim().toUpperCase();
  return state === "OPEN" || state === "MERGED" || state === "CLOSED" ? state : null;
}

/** Refreshes the state of every PR the project's runs opened. A PR that cannot be read keeps its last state. */
export async function refreshPrStates(projectId: string): Promise<void> {
  const rows = db
    .select({ id: taskRunRepos.id, prUrl: taskRunRepos.prUrl, worktreePath: taskRunRepos.worktreePath })
    .from(taskRunRepos)
    .innerJoin(taskRuns, eq(taskRunRepos.runId, taskRuns.id))
    .where(eq(taskRuns.projectId, projectId))
    .all();
  for (const row of rows) {
    if (!row.prUrl || !row.worktreePath) continue;
    const viewed = await exec("gh", ["pr", "view", row.prUrl, "--json", "state", "--jq", ".state"], row.worktreePath);
    const state = viewed.code === 0 ? parsePrState(viewed.stdout) : null;
    if (state) db.update(taskRunRepos).set({ prState: state }).where(eq(taskRunRepos.id, row.id)).run();
  }
}

export interface ApproveOutcome {
  repo: string;
  integrated: Integration | null;
  prUrl: string | null;
  error: string | null;
}

export type ApproveResult =
  | { ok: true; state: "approved" | "in_review"; outcomes: ApproveOutcome[]; error: string | null }
  | { ok: false; status: number; error: string };

export async function approveRun(runId: string): Promise<ApproveResult> {
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, runId)).get();
  if (!run) return { ok: false, status: 404, error: "Run tidak ditemukan." };
  if (run.state !== "in_review") return { ok: false, status: 409, error: "Hanya run yang sudah lolos cek bisa disetujui." };
  const task = db.select().from(tasks).where(eq(tasks.id, run.taskId)).get();
  const project = db.select().from(projects).where(eq(projects.id, run.projectId)).get();
  if (!task || !project?.rootPath) return { ok: false, status: 409, error: "Task atau project run tidak ditemukan." };

  const settings = getExecSettings(run.projectId);
  const integration = settings.integration as Integration;
  const title = commitTitle(task);
  const repos = db.select().from(taskRunRepos).where(eq(taskRunRepos.runId, runId)).all();
  const absPaths = new Map(listProjectRepos(project.rootPath).map((r) => [r.id, r.absPath]));
  const report = lastReport(run.threadId);
  const validation = run.validationJson ? (JSON.parse(run.validationJson) as { checks: { repo: string; name: string; ok: boolean }[]; acceptance: { criterion: string; status: "met" | "no-evidence" | "not-met" | "missing" }[] }) : null;
  const acceptance = (JSON.parse(task.acceptanceCriteriaJson ?? "[]") as string[]).map((criterion) => ({
    criterion,
    status: report ? criterionStatus(report, criterion) : ("missing" as const),
  }));

  const outcomes: ApproveOutcome[] = [];
  for (const repo of repos) {
    if (repo.integrated) {
      outcomes.push({ repo: repo.repo, integrated: repo.integrated as Integration, prUrl: repo.prUrl, error: null });
      continue;
    }
    const outcome: ApproveOutcome = { repo: repo.repo, integrated: null, prUrl: null, error: null };
    if (!repo.worktreePath || !repo.branch) {
      outcome.error = "Worktree atau branch repo tidak tercatat.";
      outcomes.push(outcome);
      continue;
    }
    const sha = await commitLeftovers(repo.worktreePath, `${title}\n\nRevisi: ${run.revision}`);
    db.update(taskRunRepos).set({ commitSha: sha }).where(eq(taskRunRepos.id, repo.id)).run();

    if (integration === "branch") {
      outcome.integrated = "branch";
    } else if (integration === "merge") {
      const base = repo.baseBranch ?? "main";
      const abs = absPaths.get(repo.repo);
      const current = abs ? await runGit(abs, ["rev-parse", "--abbrev-ref", "HEAD"]) : null;
      const dirty = abs ? await runGit(abs, ["status", "--porcelain"]) : null;
      if (!abs || !current || current.stdout.trim() !== base) {
        outcome.error = `Repo ${repo.repo} tidak sedang di branch ${base}.`;
      } else if (dirty && dirty.stdout.trim()) {
        outcome.error = `Repo ${repo.repo} punya perubahan lokal. Commit atau simpan dulu, lalu coba lagi.`;
      } else {
        const merged = await runGit(abs, [...IDENTITY, "merge", "--no-ff", "-q", "-m", title, repo.branch]);
        if (merged.code === 0) {
          outcome.integrated = "merge";
        } else {
          await runGit(abs, ["merge", "--abort"]);
          outcome.error = `Merge ${repo.branch} ke ${base} gagal (mungkin konflik).`;
        }
      }
    } else {
      const pushed = await runGit(repo.worktreePath, ["push", "-u", "origin", repo.branch]);
      if (pushed.code !== 0) {
        outcome.error = `Push gagal: ${pushed.stderr.trim().split("\n").at(-1) ?? "tidak diketahui"}`;
      } else {
        const body = buildRunBody({
          code: task.code,
          title: task.title,
          summary: report?.summary ?? "",
          revision: run.revision,
          acceptance,
          checks: validation?.checks ?? [],
          siblings: [],
        });
        const bodyFile = path.join(os.tmpdir(), `onesist-pr-${repo.id}.md`);
        fs.writeFileSync(bodyFile, body);
        const created = await exec("gh", ["pr", "create", "--base", repo.baseBranch ?? "main", "--head", repo.branch, "--title", title, "--body-file", bodyFile], repo.worktreePath);
        fs.rmSync(bodyFile, { force: true });
        const url = created.stdout.trim().split("\n").at(-1) ?? "";
        if (created.code === 0 && url.startsWith("http")) {
          outcome.integrated = "pr";
          outcome.prUrl = url;
        } else {
          outcome.error = `gh pr create gagal: ${created.stderr.trim().split("\n").at(-1) ?? "tidak diketahui"}`;
        }
      }
    }

    if (outcome.integrated) {
      db.update(taskRunRepos).set({ integrated: outcome.integrated, prUrl: outcome.prUrl, integrationError: null }).where(eq(taskRunRepos.id, repo.id)).run();
    } else {
      db.update(taskRunRepos).set({ integrationError: outcome.error }).where(eq(taskRunRepos.id, repo.id)).run();
    }
    outcomes.push(outcome);
  }

  const failed = outcomes.filter((o) => !o.integrated);
  const now = new Date().toISOString();
  if (failed.length === 0) {
    db.update(taskRuns).set({ state: "approved", error: null, endedAt: now, updatedAt: now }).where(eq(taskRuns.id, runId)).run();
    db.update(tasks).set({ status: "done", updatedAt: now }).where(eq(tasks.id, run.taskId)).run();
    void promoteQueued(run.projectId).catch((err) => console.error("[task-integration] promote failed:", err));
    return { ok: true, state: "approved", outcomes, error: null };
  }
  const error = failed.map((f) => `${f.repo}: ${f.error}`).join(" · ");
  db.update(taskRuns).set({ error, updatedAt: now }).where(eq(taskRuns.id, runId)).run();
  return { ok: true, state: "in_review", outcomes, error };
}
