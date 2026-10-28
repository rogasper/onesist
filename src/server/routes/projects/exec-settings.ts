import { json, notFound, badRequest } from "../../http/response";
import { Router } from "../../http/router";
import { getProject } from "../../http/route-utils";
import { getExecSettings, updateExecSettings, type ExecSettingsPatch } from "~/server/services/exec-settings";

export const router = new Router();

const PATCH_KEYS = [
  "taskMode",
  "execProviderId",
  "execModel",
  "reviewerProviderId",
  "reviewerModel",
  "maxParallel",
  "integration",
  "baseBranches",
] as const;

/** Copies only the known fields, so unknown keys from the client never reach the database. */
function pickPatch(data: Record<string, unknown>): ExecSettingsPatch {
  const patch: Record<string, unknown> = {};
  for (const key of PATCH_KEYS) {
    if (data[key] !== undefined) patch[key] = data[key];
  }
  return patch as ExecSettingsPatch;
}

// GET /api/projects/:id/exec-settings
router.get("projects/:id/exec-settings", ({ params }) => {
  if (!getProject(params.id)) return notFound();
  return json(getExecSettings(params.id));
});

// PUT /api/projects/:id/exec-settings — partial update, returns the merged settings
router.put("projects/:id/exec-settings", async ({ params, body }) => {
  if (!getProject(params.id)) return notFound();
  const result = updateExecSettings(params.id, pickPatch(await body()));
  return result.ok ? json(result.settings) : badRequest(result.error);
});
