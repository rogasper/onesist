/**
 * Lengkapi dengan AI. The agent answers in a read-only thread; the proposal is read from that
 * answer, checked, and only saved when the user confirms (`fill/apply`). Nothing is written
 * before that.
 */
import { eq } from "drizzle-orm";
import { badRequest, json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { getProject } from "../../http/route-utils";
import { db } from "~/server/db/client";
import { tasks } from "~/server/db/schema";
import { createThread, getThread, listMessages, messageText, parseParts } from "~/server/agent/store";
import { getSetting, normalizeAgentMaxSteps } from "~/server/agent/settings";
import { listRepos } from "~/server/services/task-repos";
import { buildFillPrompt, parseFillProposal, validateFillProposal, type FillProposal } from "~/server/services/task-fill";

export const router = new Router();

const parseList = (json: string | null): string[] => {
  if (!json) return [];
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
};

function findTask(projectId: string, taskId: string) {
  return db.select().from(tasks).where(eq(tasks.id, taskId)).get();
}

// POST /api/projects/:id/tasks/:taskId/fill — opens a read-only thread that proposes the fields
router.post("projects/:id/tasks/:taskId/fill", ({ params }) => {
  const project = getProject(params.id);
  if (!project?.rootPath) return notFound();
  const task = findTask(project.id, params.taskId);
  if (!task || task.projectId !== project.id) return notFound();
  const repoIds = listRepos(project.rootPath).map((r) => r.id);
  const title = `Lengkapi · ${task.code ?? task.title}`;
  const thread = createThread({
    projectId: project.id,
    title,
    mode: "agent",
    permissionMode: "readonly",
    maxSteps: normalizeAgentMaxSteps(getSetting("agentMaxSteps")),
  });
  return json({ threadId: thread.id, title, text: buildFillPrompt(task, repoIds) }, 201);
});

// GET /api/projects/:id/tasks/:taskId/fill/preview?threadId= — reads the proposal, saves nothing
router.get("projects/:id/tasks/:taskId/fill/preview", ({ params, query }) => {
  const project = getProject(params.id);
  if (!project?.rootPath) return notFound();
  const task = findTask(project.id, params.taskId);
  if (!task || task.projectId !== project.id) return notFound();
  const threadId = query.get("threadId") ?? "";
  const thread = threadId ? getThread(threadId) : undefined;
  if (!thread || thread.projectId !== project.id) return notFound();

  const lastAnswer = listMessages(threadId).filter((m) => m.role === "assistant").at(-1);
  const parsed = parseFillProposal(lastAnswer ? messageText(parseParts(lastAnswer.contentJson)) : "");
  if (!parsed.ok) return json({ error: parsed.error }, 422);
  const { proposal, dropped } = validateFillProposal(parsed.proposal, listRepos(project.rootPath).map((r) => r.id));
  return json({
    proposal,
    dropped,
    current: {
      repos: parseList(task.reposJson),
      filesScope: parseList(task.filesScopeJson),
      acceptanceCriteria: parseList(task.acceptanceCriteriaJson),
    },
  });
});

// POST /api/projects/:id/tasks/:taskId/fill/apply — { proposal }, validated again, then saved
router.post("projects/:id/tasks/:taskId/fill/apply", async ({ params, body }) => {
  const project = getProject(params.id);
  if (!project?.rootPath) return notFound();
  const task = findTask(project.id, params.taskId);
  if (!task || task.projectId !== project.id) return notFound();
  const data = (await body()) as { proposal?: unknown };
  if (!data.proposal || typeof data.proposal !== "object") return badRequest("Usulan tidak ada");
  const raw = data.proposal as Partial<FillProposal>;
  const { proposal } = validateFillProposal(
    { repos: Array.isArray(raw.repos) ? raw.repos : [], filesScope: Array.isArray(raw.filesScope) ? raw.filesScope : [], acceptanceCriteria: Array.isArray(raw.acceptanceCriteria) ? raw.acceptanceCriteria : [] },
    listRepos(project.rootPath).map((r) => r.id),
  );
  // Only the fields the proposal fills are written; an empty list leaves the stored value alone.
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (proposal.repos.length > 0) updates.reposJson = JSON.stringify(proposal.repos);
  if (proposal.filesScope.length > 0) updates.filesScopeJson = JSON.stringify(proposal.filesScope);
  if (proposal.acceptanceCriteria.length > 0) updates.acceptanceCriteriaJson = JSON.stringify(proposal.acceptanceCriteria);
  db.update(tasks).set(updates).where(eq(tasks.id, task.id)).run();
  return json(findTask(project.id, task.id));
});
