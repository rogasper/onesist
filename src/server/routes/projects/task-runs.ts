/**
 * Task runs over HTTP: start a run for a task, and read the latest run of every task so the
 * board can show it. Starting returns the thread and the prompt; the chat sends the prompt.
 */
import { eq, desc } from "drizzle-orm";
import { json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { getProject } from "../../http/route-utils";
import { worktreesBaseDir } from "~/server/agent/workspace/location";
import { db } from "~/server/db/client";
import { taskRunRepos, taskRuns, tasks } from "~/server/db/schema";
import { startTaskRun } from "~/server/services/task-runs";
import { validateRun } from "~/server/services/task-validation";
import { readReview, startReview } from "~/server/services/task-review";
import { runDiff } from "~/server/services/task-diff";
import { discardRun, requestRevision } from "~/server/services/task-revision";
import { approveRun } from "~/server/services/task-integration";
import { readRunFile, writeRunFile } from "~/server/services/task-files";
import type { RunState, RunSummary, RunValidation, Task } from "~/shared/types";

export const router = new Router();

function parseJson<T>(json: string | null): T | null {
  if (!json) return null;
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

export function summarize(run: typeof taskRuns.$inferSelect): RunSummary {
  const repos = db.select().from(taskRunRepos).where(eq(taskRunRepos.runId, run.id)).all();
  const stored = parseJson<{ threadId: string | null; findings: unknown[] }>(run.reviewJson);
  const review = run.reviewerThreadId
    ? { threadId: run.reviewerThreadId, findings: stored?.findings ?? [], read: stored !== null }
    : null;
  return {
    validation: parseJson<RunValidation>(run.validationJson),
    review,
    id: run.id,
    taskId: run.taskId,
    threadId: run.threadId,
    state: run.state as RunState,
    revision: run.revision,
    bundlePath: run.bundlePath,
    repos: repos.map((r: typeof taskRunRepos.$inferSelect) => ({ repo: r.repo, branch: r.branch, worktreePath: r.worktreePath })),
    error: run.error,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

// POST /api/projects/:id/tasks/:taskId/runs — starts the task's run
router.post("projects/:id/tasks/:taskId/runs", async ({ params }) => {
  const project = getProject(params.id);
  if (!project?.rootPath) return notFound();
  const task = db.select().from(tasks).where(eq(tasks.id, params.taskId)).get() as Task | undefined;
  if (!task || task.projectId !== project.id) return notFound();
  const result = await startTaskRun({ projectId: project.id, root: project.rootPath, task, baseDir: worktreesBaseDir() });
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ runId: result.runId, threadId: result.threadId, title: result.title, text: result.text }, 201);
});

// GET /api/projects/:id/task-runs — the newest run of each task in the project
router.get("projects/:id/task-runs", ({ params }) => {
  const project = getProject(params.id);
  if (!project) return notFound();
  const runs = db.select().from(taskRuns).where(eq(taskRuns.projectId, params.id)).orderBy(desc(taskRuns.createdAt)).all();
  const newest = new Map<string, typeof taskRuns.$inferSelect>();
  for (const run of runs) if (!newest.has(run.taskId)) newest.set(run.taskId, run);
  return json([...newest.values()].map(summarize));
});

// POST /api/projects/:id/task-runs/:runId/validate — runs the checks and moves the run on
router.post("projects/:id/task-runs/:runId/validate", async ({ params }) => {
  const project = getProject(params.id);
  if (!project) return notFound();
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, params.runId)).get();
  if (!run || run.projectId !== project.id) return notFound();
  const result = await validateRun(params.runId);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ state: result.state, validation: result.validation });
});

// POST /api/projects/:id/task-runs/:runId/review — opens the read-only AI reviewer's thread
router.post("projects/:id/task-runs/:runId/review", async ({ params }) => {
  const project = getProject(params.id);
  if (!project) return notFound();
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, params.runId)).get();
  if (!run || run.projectId !== project.id) return notFound();
  const result = await startReview(params.runId);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ threadId: result.threadId, title: result.title, text: result.text }, 201);
});

// GET /api/projects/:id/task-runs/:runId/review?threadId= — reads the reviewer's findings
router.get("projects/:id/task-runs/:runId/review", async ({ params, query }) => {
  const project = getProject(params.id);
  if (!project) return notFound();
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, params.runId)).get();
  if (!run || run.projectId !== project.id) return notFound();
  const result = await readReview(params.runId, query.get("threadId") ?? "");
  return result.ok ? json({ findings: result.findings }) : json({ error: result.error }, result.status);
});

// GET /api/projects/:id/task-runs/:runId/diff — what the run changed, per repo and file
router.get("projects/:id/task-runs/:runId/diff", async ({ params }) => {
  const project = getProject(params.id);
  if (!project) return notFound();
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, params.runId)).get();
  if (!run || run.projectId !== project.id) return notFound();
  return json({ repos: (await runDiff(params.runId)) ?? [] });
});

// POST /api/projects/:id/task-runs/:runId/revise — { comments, findings } becomes the next message
router.post("projects/:id/task-runs/:runId/revise", async ({ params, body }) => {
  const project = getProject(params.id);
  if (!project) return notFound();
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, params.runId)).get();
  if (!run || run.projectId !== project.id) return notFound();
  const data = (await body()) as Record<string, unknown>;
  const result = await requestRevision(params.runId, { comments: data.comments, findings: data.findings });
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ revision: result.revision, threadId: run.threadId, text: result.text });
});

// POST /api/projects/:id/task-runs/:runId/discard — ends the run; its worktrees are kept
router.post("projects/:id/task-runs/:runId/discard", async ({ params }) => {
  const project = getProject(params.id);
  if (!project) return notFound();
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, params.runId)).get();
  if (!run || run.projectId !== project.id) return notFound();
  const result = await discardRun(params.runId);
  return result.ok ? json({ ok: true }) : json({ error: result.error }, result.status);
});

// POST /api/projects/:id/task-runs/:runId/approve — Setujui: commit, then branch, PR, or merge
router.post("projects/:id/task-runs/:runId/approve", async ({ params }) => {
  const project = getProject(params.id);
  if (!project) return notFound();
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, params.runId)).get();
  if (!run || run.projectId !== project.id) return notFound();
  const result = await approveRun(params.runId);
  return result.ok ? json({ state: result.state, outcomes: result.outcomes, error: result.error }) : json({ error: result.error }, result.status);
});

// GET / PUT /api/projects/:id/task-runs/:runId/file?repo=&path= — Edit sendiri, inside the worktree only
router.get("projects/:id/task-runs/:runId/file", async ({ params, query }) => {
  const project = getProject(params.id);
  const run = project ? db.select().from(taskRuns).where(eq(taskRuns.id, params.runId)).get() : undefined;
  if (!project || !run || run.projectId !== project.id) return notFound();
  const result = await readRunFile(params.runId, query.get("repo") ?? "", query.get("path") ?? "");
  return result.ok ? json({ content: result.content }) : json({ error: result.error }, 400);
});

router.put("projects/:id/task-runs/:runId/file", async ({ params, query, body }) => {
  const project = getProject(params.id);
  const run = project ? db.select().from(taskRuns).where(eq(taskRuns.id, params.runId)).get() : undefined;
  if (!project || !run || run.projectId !== project.id) return notFound();
  const data = (await body()) as { content?: unknown };
  if (typeof data.content !== "string") return json({ error: "Isi berkas harus berupa teks." }, 400);
  const result = await writeRunFile(params.runId, query.get("repo") ?? "", query.get("path") ?? "", data.content);
  return result.ok ? json({ ok: true }) : json({ error: result.error }, 400);
});
