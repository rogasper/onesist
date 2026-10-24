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
import type { RunState, RunSummary, Task } from "~/shared/types";

export const router = new Router();

function summarize(run: typeof taskRuns.$inferSelect): RunSummary {
  const repos = db.select().from(taskRunRepos).where(eq(taskRunRepos.runId, run.id)).all();
  return {
    id: run.id,
    taskId: run.taskId,
    threadId: run.threadId,
    state: run.state as RunState,
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
