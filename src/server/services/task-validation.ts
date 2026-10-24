/**
 * Validation of a finished task run, before it reaches In Review. Mechanical checks (the repo's
 * configured commands, run in each worktree) decide pass or fail. Scope and acceptance criteria
 * are reported but never block: they are for the reviewer to read.
 */
import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { runGit } from "~/server/agent/workspace/git";
import { db } from "~/server/db/client";
import { projects, taskRunRepos, taskRuns, tasks } from "~/server/db/schema";
import { listMessages, messageText, parseParts } from "~/server/agent/store";
import { criterionStatus, parseRunReport, type RunReport } from "~/lib/run-report";
import { outsideScope } from "~/lib/file-scope";
import type { RunValidation } from "~/shared/types";
import { readWorktreeConfig } from "./task-checks";

export const CHECK_TIMEOUT_MS = 10 * 60_000;
const TAIL_CHARS = 4_000;

/** The environment a check sees: the basics, and nothing that carries the user's secrets. */
function cleanEnv(): NodeJS.ProcessEnv {
  const keep = ["PATH", "HOME", "LANG", "TERM", "TMPDIR"];
  return Object.fromEntries(keep.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]!]));
}

/** Runs one check through the shell in `cwd`. A check that outlives `timeoutMs` is killed and fails. */
export function runCommand(cwd: string, command: string, timeoutMs: number): Promise<{ ok: boolean; exitCode: number | null; tail: string }> {
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const child = spawn("sh", ["-c", command], { cwd, env: cleanEnv(), stdio: ["ignore", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-TAIL_CHARS);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.on("close", (code) => {
      clearTimeout(timer);
      const tail = timedOut ? `${output}\n(dihentikan: melewati batas waktu)` : output;
      resolve({ ok: !timedOut && code === 0, exitCode: code, tail: tail.slice(-TAIL_CHARS) });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, exitCode: null, tail: String(err) });
    });
  });
}

/** Files changed since the run's base commit, including new ones, as paths from the project root. */
async function changedFiles(worktree: string, repoId: string, baseCommit: string | null): Promise<string[]> {
  const prefix = repoId === "." ? "" : `${repoId}/`;
  const tracked = baseCommit ? await runGit(worktree, ["diff", "--name-only", baseCommit]) : { code: 0, stdout: "", stderr: "" };
  const untracked = await runGit(worktree, ["ls-files", "--others", "--exclude-standard"]);
  const files = [...tracked.stdout.split("\n"), ...untracked.stdout.split("\n")].map((f) => f.trim()).filter(Boolean);
  return [...new Set(files.map((f) => `${prefix}${f}`))];
}

function lastReport(threadId: string | null): RunReport | null {
  if (!threadId) return null;
  const last = listMessages(threadId).filter((m) => m.role === "assistant").at(-1);
  if (!last) return null;
  const parsed = parseRunReport(messageText(parseParts(last.contentJson)));
  return parsed.ok ? parsed.report : null;
}

function parseList(json: string | null): string[] {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export type ValidateResult =
  | { ok: true; state: "in_review" | "failed"; validation: RunValidation }
  | { ok: false; status: number; error: string };

/** A run can be validated while it is validating, or after a failed check (once it is fixed). */
function canValidate(state: string, error: string | null): boolean {
  return state === "validating" || (state === "failed" && (error ?? "").startsWith("Cek gagal"));
}

export async function validateRun(runId: string): Promise<ValidateResult> {
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, runId)).get();
  if (!run) return { ok: false, status: 404, error: "Run tidak ditemukan." };
  if (!canValidate(run.state, run.error)) return { ok: false, status: 409, error: "Run ini tidak bisa divalidasi sekarang." };

  const project = db.select().from(projects).where(eq(projects.id, run.projectId)).get();
  const task = db.select().from(tasks).where(eq(tasks.id, run.taskId)).get();
  if (!project?.rootPath || !task) return { ok: false, status: 409, error: "Task atau project run tidak ditemukan." };

  const repos = db.select().from(taskRunRepos).where(eq(taskRunRepos.runId, runId)).all();
  const config = readWorktreeConfig(project.rootPath);
  const checks: RunValidation["checks"] = [];
  const changed: string[] = [];
  for (const repo of repos) {
    if (!repo.worktreePath) continue;
    for (const check of config.checks[repo.repo] ?? []) {
      const result = await runCommand(repo.worktreePath, check.command, CHECK_TIMEOUT_MS);
      checks.push({ repo: repo.repo, name: check.name, command: check.command, ok: result.ok, exitCode: result.exitCode, tail: result.tail });
    }
    changed.push(...(await changedFiles(repo.worktreePath, repo.repo, repo.baseCommit)));
  }

  const report = lastReport(run.threadId);
  const scope = parseList(task.filesScopeJson);
  const validation: RunValidation = {
    ranAt: new Date().toISOString(),
    passed: checks.every((c) => c.ok),
    checks,
    outsideScope: scope.length > 0 ? outsideScope(changed, scope) : changed,
    acceptance: parseList(task.acceptanceCriteriaJson).map((criterion) => ({
      criterion,
      status: report ? criterionStatus(report, criterion) : "missing",
    })),
    reportFound: !!report,
  };

  const now = new Date().toISOString();
  const failing = checks.find((c) => !c.ok);
  if (validation.passed) {
    db.update(taskRuns).set({ state: "in_review", error: null, validationJson: JSON.stringify(validation), endedAt: now, updatedAt: now }).where(eq(taskRuns.id, runId)).run();
    db.update(tasks).set({ status: "in_review", updatedAt: now }).where(eq(tasks.id, run.taskId)).run();
    return { ok: true, state: "in_review", validation };
  }
  const reason = `Cek gagal: ${failing!.name} (${failing!.repo})`;
  db.update(taskRuns).set({ state: "failed", error: reason, validationJson: JSON.stringify(validation), updatedAt: now }).where(eq(taskRuns.id, runId)).run();
  return { ok: true, state: "failed", validation };
}


