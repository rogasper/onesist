import { json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { getProject } from "../../http/route-utils";
import { listRepos } from "~/server/services/task-repos";

export const router = new Router();

// GET /api/projects/:id/repos — the repos a task can target
router.get("projects/:id/repos", ({ params }) => {
  const project = getProject(params.id);
  if (!project?.rootPath) return notFound();
  return json({ repos: listRepos(project.rootPath) });
});
