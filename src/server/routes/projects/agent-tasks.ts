/**
 * POST /api/projects/:id/agent-tasks — a Generate button's task: creates the chat thread
 * and returns the prompt the chat sends in it. The thread asks before it writes files
 * (permission mode `ask`); the user can switch it to automatic in the composer.
 */
import { Router } from "../../http/router";
import { json } from "../../http/response";
import { getProject } from "../../http/route-utils";
import { createThread } from "~/server/agent/store";
import { getSetting, normalizeAgentMaxSteps } from "~/server/agent/settings";
import { buildAgentTask, isAgentTaskMode } from "~/server/services/agent-task";

export const router = new Router();

router.post("projects/:id/agent-tasks", async ({ params, body }) => {
  const project = getProject(params.id);
  if (!project?.rootPath) return json({ error: "Project tidak ditemukan atau belum punya root path." }, 404);
  const data = (await body()) as Record<string, unknown>;
  if (!isAgentTaskMode(data.mode)) return json({ error: "Mode tugas tidak dikenal." }, 400);
  const fsd = typeof data.fsd === "string" && data.fsd.trim() ? data.fsd.trim() : undefined;
  const fds = Array.isArray(data.fds) ? data.fds.filter((f): f is string => typeof f === "string" && !!f.trim()) : undefined;
  const task = buildAgentTask(project.rootPath, { mode: data.mode, fsd, fds: fds?.length ? fds : undefined });
  const thread = createThread({
    projectId: project.id,
    title: task.title,
    mode: "agent",
    permissionMode: "ask",
    maxSteps: normalizeAgentMaxSteps(getSetting("agentMaxSteps")),
  });
  return json({ threadId: thread.id, title: task.title, text: task.text }, 201);
});
