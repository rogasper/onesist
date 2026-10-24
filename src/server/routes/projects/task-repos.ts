import { badRequest, json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { getProject } from "../../http/route-utils";
import { listRepos } from "~/server/services/task-repos";
import { readWorktreeConfig, saveChecks, suggestChecks } from "~/server/services/task-checks";

export const router = new Router();

// GET /api/projects/:id/repos — the repos a task can target, with their check commands.
// `suggestedChecks` appears only for a repo that has no checks configured yet.
router.get("projects/:id/repos", ({ params }) => {
  const project = getProject(params.id);
  if (!project?.rootPath) return notFound();
  const config = readWorktreeConfig(project.rootPath);
  const repos = listRepos(project.rootPath).map((repo) => {
    const checks = config.checks[repo.id] ?? [];
    return {
      ...repo,
      checks,
      suggestedChecks: checks.length === 0 ? suggestChecks(repo.path) : [],
    };
  });
  return json({ repos });
});

// PUT /api/projects/:id/repo-checks — { repoId, checks } replaces that repo's check commands
router.put("projects/:id/repo-checks", async ({ params, body }) => {
  const project = getProject(params.id);
  if (!project?.rootPath) return notFound();
  const data = (await body()) as Record<string, unknown>;
  const repoId = typeof data.repoId === "string" ? data.repoId : "";
  if (!listRepos(project.rootPath).some((r) => r.id === repoId)) return badRequest("Repo tidak ditemukan di project ini");
  const result = saveChecks(project.rootPath, repoId, data.checks);
  return result.ok ? json({ checks: result.checks }) : badRequest(result.error);
});
