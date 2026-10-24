/**
 * Starting a task's run: one run folder holding a worktree per repo, a chat thread that works
 * in that folder, and the prompt the chat sends. Plan 3 runs in permission mode `ask`; the
 * run's state then follows the thread's chat events (see `applyRunEvent`).
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { getProvider } from "~/server/agent/config";
import { cliRuntimeFor } from "~/server/agent/runtime/registry";
import { createThread, updateThread } from "~/server/agent/store";
import { getSetting, normalizeAgentMaxSteps } from "~/server/agent/settings";
import { createWorktree, findRepo, listProjectRepos } from "~/server/agent/workspace/worktrees";
import { runGit } from "~/server/agent/workspace/git";
import { slug } from "~/server/agent/workspace/location";
import { db } from "~/server/db/client";
import { taskRunRepos, taskRuns, tasks } from "~/server/db/schema";
import { eventBus } from "~/server/realtime/events";
import { readinessProblems, PROBLEM_LABELS } from "~/lib/task-readiness";
import { parseDependencies, taskKey } from "~/lib/task-board";
import { normalizeStatus } from "~/lib/task-status";
import type { RunState, Task } from "~/shared/types";
import { getExecSettings } from "./exec-settings";

export const ACTIVE_STATES: RunState[] = ["running", "waiting_input", "validating"];

export interface RunPromptInput {
  title: string;
  code: string | null;
  description: string | null;
  criteria: string[];
  scope: string[];
  bundlePath: string;
  repos: { id: string; worktreePath: string; branch: string }[];
  doneDependencies: string[];
}

/** The prompt the run's thread gets. Pure, so the rules it states can be tested. */
export function buildRunPrompt(input: RunPromptInput): string {
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- (tidak ada)");
  return [
    `Kerjakan task ${input.code ?? input.title}: ${input.title}.`,
    "",
    input.description ? `Deskripsi:\n${input.description}` : "",
    "Acceptance criteria (harus terpenuhi semuanya):",
    list(input.criteria),
    "",
    "File yang boleh disentuh:",
    list(input.scope),
    "",
    `Folder kerja: ${input.bundlePath}`,
    "Repo dan worktree-nya:",
    list(input.repos.map((r) => `${r.id} → ${r.worktreePath} (branch ${r.branch})`)),
    "",
    "Dependensi yang sudah selesai (kodenya mungkin belum ada di branch dasar):",
    list(input.doneDependencies),
    "",
    "Aturan:",
    "- Kerja hanya di folder kerja di atas. Jangan menyentuh root project atau repo lain.",
    "- Jangan commit, jangan push, jangan membuat PR. Biarkan perubahan di working tree.",
    "- Jika ada yang ambigu atau butuh keputusan bisnis, tanya dulu; jangan menebak.",
    "- Ikuti AGENTS.md atau CLAUDE.md di repo bila ada.",
    "- Sebelum selesai, pakai helper yang sudah ada sebelum membuat fungsi baru.",
    "",
    "Akhiri dengan tepat satu blok ```onesist-report``` berisi JSON:",
    '{"summary": "...", "acceptance": [{"criterion": "...", "met": true, "evidence": ["path:line"]}], "notes": "...", "questionsAsked": []}',
  ]
    .join("\n");
}

export type StartRunResult =
  | { ok: true; runId: string; threadId: string; title: string; text: string }
  | { ok: false; status: number; error: string };

function refuse(status: number, error: string): StartRunResult {
  return { ok: false, status, error };
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

function countActive(where: { projectId?: string; taskId?: string }): number {
  const conditions = [inArray(taskRuns.state, ACTIVE_STATES)];
  if (where.projectId) conditions.push(eq(taskRuns.projectId, where.projectId));
  if (where.taskId) conditions.push(eq(taskRuns.taskId, where.taskId));
  return db.select({ id: taskRuns.id }).from(taskRuns).where(and(...conditions)).all().length;
}

/** Dependencies of a task that are already done, by code, so the prompt can name them. */
function doneDependencyCodes(task: Task, projectId: string): string[] {
  const all = db.select().from(tasks).where(eq(tasks.projectId, projectId)).all() as Task[];
  const byKey = new Map(all.map((t) => [taskKey(t), t]));
  return parseDependencies(task.dependenciesJson).filter((d) => {
    const dep = byKey.get(d);
    return !!dep && normalizeStatus(dep.status) === "done";
  });
}

export async function startTaskRun(input: { projectId: string; root: string; task: Task; baseDir: string }): Promise<StartRunResult> {
  const { projectId, root, task, baseDir } = input;
  const settings = getExecSettings(projectId);

  if (settings.taskMode === "delivery") return refuse(409, "Project ini mode delivery: task tidak dijalankan agen.");
  if (!settings.execProviderId) return refuse(409, "Pilih agen eksekusi dulu di Pengaturan project → Task.");
  const provider = getProvider(settings.execProviderId);
  if (!provider || !cliRuntimeFor(provider)) return refuse(409, "Agen eksekusi harus agen CLI (OpenCode, Claude Code, atau Codex).");
  if (provider.cliAgent === "antigravity") return refuse(409, "Antigravity belum didukung untuk eksekusi task.");

  const repos = listProjectRepos(root);
  const problems = readinessProblems(task, repos.length);
  if (problems.length > 0) return refuse(409, `Task belum siap: ${problems.map((p) => PROBLEM_LABELS[p]).join(", ")}.`);

  if (countActive({ taskId: task.id }) > 0) return refuse(409, "Task ini sudah punya run yang berjalan.");
  if (countActive({ projectId }) >= settings.maxParallel) {
    return refuse(409, `Batas paralel tercapai (${settings.maxParallel}). Tunggu salah satu run selesai.`);
  }

  const repoIds = parseList(task.reposJson);
  const resolved = repoIds.length > 0 ? repoIds : repos.length === 1 ? [repos[0].id] : [];
  const repoInfos = resolved.map((id) => findRepo(root, id));
  const missing = resolved.find((_, i) => !repoInfos[i]);
  if (missing) return refuse(409, `Repo ${missing} tidak ditemukan di project ini.`);

  const runId = randomUUID();
  const bundlePath = path.join(baseDir, "runs", runId);
  const now = new Date().toISOString();
  db.insert(taskRuns)
    .values({
      id: runId,
      taskId: task.id,
      projectId,
      bundlePath,
      providerId: provider.id,
      model: settings.execModel,
      state: "running",
      createdAt: now,
      startedAt: now,
      updatedAt: now,
    })
    .run();

  const branch = `onesist/${slug(task.code ?? task.title, 32)}-${runId.replace(/-/g, "").slice(-6)}`;
  const worktrees: { id: string; worktreePath: string; branch: string }[] = [];
  for (const repo of repoInfos.filter((r): r is NonNullable<typeof r> => r !== null)) {
    const baseRef = settings.baseBranches[repo.id] ?? null;
    const made = await createWorktree({
      repo,
      projectId,
      projectRoot: root,
      baseDir: bundlePath,
      branch,
      baseRef,
      fromOrigin: false,
    });
    if (!made.ok) {
      db.update(taskRuns).set({ state: "failed", error: made.error, endedAt: new Date().toISOString() }).where(eq(taskRuns.id, runId)).run();
      return refuse(made.status, made.error);
    }
    const head = await runGit(made.path, ["rev-parse", "HEAD"]);
    db.insert(taskRunRepos)
      .values({
        id: randomUUID(),
        runId,
        repo: repo.id,
        worktreePath: made.path,
        branch: made.branch,
        baseBranch: baseRef,
        baseCommit: head.code === 0 ? head.stdout.trim() : null,
      })
      .run();
    worktrees.push({ id: repo.id, worktreePath: made.path, branch: made.branch });
  }

  const title = task.code ? `${task.code}: ${task.title.replace(`${task.code}:`, "").trim()}` : task.title;
  const thread = createThread({
    projectId,
    title,
    mode: "agent",
    providerId: provider.id,
    model: settings.execModel,
    permissionMode: "ask",
    maxSteps: normalizeAgentMaxSteps(getSetting("agentMaxSteps")),
  });
  updateThread(thread.id, {
    workspaceStrategy: "worktree",
    workspaceRepo: worktrees[0]?.id ?? null,
    workspacePath: bundlePath,
    workspaceBranch: worktrees.length === 1 ? branch : null,
  });
  db.update(taskRuns).set({ threadId: thread.id, updatedAt: new Date().toISOString() }).where(eq(taskRuns.id, runId)).run();
  db.update(tasks).set({ status: "in_progress", updatedAt: new Date().toISOString() }).where(eq(tasks.id, task.id)).run();

  const text = buildRunPrompt({
    title: task.title,
    code: task.code,
    description: task.description,
    criteria: parseList(task.acceptanceCriteriaJson),
    scope: parseList(task.filesScopeJson),
    bundlePath,
    repos: worktrees,
    doneDependencies: doneDependencyCodes(task, projectId),
  });
  return { ok: true, runId, threadId: thread.id, title, text };
}

/**
 * A run's state follows its thread's chat events. Only threads that belong to a run count, and
 * a run that already ended (validating, failed) is not moved back by a late event.
 */
export function applyRunEvent(type: string, data: unknown): void {
  const threadId = (data as { threadId?: unknown } | null)?.threadId;
  if (typeof threadId !== "string") return;
  const run = db.select().from(taskRuns).where(eq(taskRuns.threadId, threadId)).get();
  if (!run) return;
  const now = new Date().toISOString();

  if (type === "chat:question" && run.state === "running") {
    db.update(taskRuns).set({ state: "waiting_input", updatedAt: now }).where(eq(taskRuns.id, run.id)).run();
  } else if (type === "chat:question-resolved" && run.state === "waiting_input") {
    db.update(taskRuns).set({ state: "running", updatedAt: now }).where(eq(taskRuns.id, run.id)).run();
  } else if (type === "chat:run" && ACTIVE_STATES.includes(run.state as RunState)) {
    const event = data as { status?: string; error?: string | null };
    if (event.status === "done") {
      db.update(taskRuns).set({ state: "validating", updatedAt: now }).where(eq(taskRuns.id, run.id)).run();
    } else if (event.status === "error" || event.status === "stopped" || event.status === "interrupted") {
      const reason = event.error ?? (event.status === "stopped" ? "Dihentikan." : "Agen berhenti sebelum selesai.");
      db.update(taskRuns).set({ state: "failed", error: reason, endedAt: now, updatedAt: now }).where(eq(taskRuns.id, run.id)).run();
    }
  }
}

// Registered once when the module loads (the server loads it through the task-runs route),
// the same way the chat queue listens to its own events.
for (const type of ["chat:question", "chat:question-resolved", "chat:run"]) {
  eventBus.on(type, (event: { type: string; data: unknown }) => applyRunEvent(event.type, event.data));
}
