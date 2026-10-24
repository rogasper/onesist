import { eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { projectExecSettings } from "~/server/db/schema";
import type { ExecSettings, Integration, TaskMode } from "~/shared/types";

const TASK_MODES: readonly TaskMode[] = ["execution", "delivery"];
const INTEGRATIONS: readonly Integration[] = ["pr", "branch", "merge"];
const MAX_PARALLEL_LIMIT = 8;

export type ExecSettingsPatch = Partial<ExecSettings>;

export function defaultExecSettings(): ExecSettings {
  return {
    taskMode: "execution",
    execProviderId: null,
    execModel: null,
    reviewerProviderId: null,
    reviewerModel: null,
    maxParallel: 2,
    integration: "pr",
    baseBranches: {},
  };
}

/** Keeps only non-empty string values, so a malformed column reads as no overrides. */
function parseBaseBranches(json: string | null): Record<string, string> {
  if (!json) return {};
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1] !== ""),
    );
  } catch {
    return {};
  }
}

export function getExecSettings(projectId: string): ExecSettings {
  const row = db.select().from(projectExecSettings).where(eq(projectExecSettings.projectId, projectId)).get();
  if (!row) return defaultExecSettings();
  return {
    taskMode: row.taskMode as TaskMode,
    execProviderId: row.execProviderId,
    execModel: row.execModel,
    reviewerProviderId: row.reviewerProviderId,
    reviewerModel: row.reviewerModel,
    maxParallel: row.maxParallel,
    integration: row.integration as Integration,
    baseBranches: parseBaseBranches(row.baseBranchesJson),
  };
}

/** Validates the patch, then merges it over the stored settings (defaults when none are stored yet). */
export function updateExecSettings(
  projectId: string,
  patch: ExecSettingsPatch,
): { ok: true; settings: ExecSettings } | { ok: false; error: string } {
  if (patch.taskMode !== undefined && !TASK_MODES.includes(patch.taskMode)) {
    return { ok: false, error: "Mode task tidak dikenal" };
  }
  if (patch.integration !== undefined && !INTEGRATIONS.includes(patch.integration)) {
    return { ok: false, error: "Cara integrasi tidak dikenal" };
  }
  if (
    patch.maxParallel !== undefined &&
    (!Number.isInteger(patch.maxParallel) || patch.maxParallel < 1 || patch.maxParallel > MAX_PARALLEL_LIMIT)
  ) {
    return { ok: false, error: `Batas paralel harus 1–${MAX_PARALLEL_LIMIT}` };
  }

  const next = { ...getExecSettings(projectId), ...patch };
  const now = new Date().toISOString();
  const values = {
    taskMode: next.taskMode,
    execProviderId: next.execProviderId,
    execModel: next.execModel,
    reviewerProviderId: next.reviewerProviderId,
    reviewerModel: next.reviewerModel,
    maxParallel: next.maxParallel,
    integration: next.integration,
    baseBranchesJson: JSON.stringify(next.baseBranches),
    updatedAt: now,
  };
  db.insert(projectExecSettings)
    .values({ projectId, ...values })
    .onConflictDoUpdate({ target: projectExecSettings.projectId, set: values })
    .run();
  return { ok: true, settings: getExecSettings(projectId) };
}
