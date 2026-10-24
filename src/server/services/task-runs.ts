/**
 * Starting a task's run: one run folder holding a worktree per repo, a chat thread that works
 * in that folder, and the prompt the chat sends. Plan 3 runs in permission mode `ask`; the
 * run's state then follows the thread's chat events (see `applyRunEvent`).
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getProvider } from "~/server/agent/config";
import { cliRuntimeFor } from "~/server/agent/runtime/registry";
import { createThread, updateThread } from "~/server/agent/store";
import { getSetting, normalizeAgentMaxSteps } from "~/server/agent/settings";
import { createWorktree, findRepo, listProjectRepos, type RepoInfo } from "~/server/agent/workspace/worktrees";
import { enqueue, kick } from "~/server/agent/queue";
import { runGit } from "~/server/agent/workspace/git";
import { slug } from "~/server/agent/workspace/location";
import { writeExecutePolicy } from "~/server/agent/execute-policy";
import { readWorktreeConfig } from "./task-checks";
import { db } from "~/server/db/client";
import { projects, taskRunRepos, taskRuns, tasks } from "~/server/db/schema";
import { eventBus } from "~/server/realtime/events";
import { readinessProblems, PROBLEM_LABELS } from "~/lib/task-readiness";
import { parseDependencies, taskKey } from "~/lib/task-board";
import { normalizeStatus } from "~/lib/task-status";
import type { RunState, Task } from "~/shared/types";
import { getExecSettings } from "./exec-settings";

export const ACTIVE_STATES: RunState[] = ["running", "waiting_input", "validating"];

/** CLI runtimes whose `execute` mode checks every shell command against the run rules. */
const EXECUTE_RUNTIMES = ["claude", "opencode", "pi"];

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
  | { ok: true; runId: string; threadId: string | null; title: string; text: string | null; queued: boolean; position: number | null }
  | { ok: false; status: number; error: string };

function refuse(status: number, error: string): StartRunResult {
  return { ok: false, status, error };
}

function fail(status: number, error: string): { ok: false; status: number; error: string } {
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

interface StartContext {
  projectId: string;
  root: string;
  task: Task;
  bundlePath: string;
  providerId: string;
  model: string | null;
  cliAgent: string | null;
  maxSteps: number;
  maxParallel: number;
  baseBranches: Record<string, string>;
  repoInfos: RepoInfo[];
}

/**
 * Everything a run needs before it may start: the provider, readiness, and the repos. Shared by
 * a start now and a start from the queue later, so both refuse for the same reasons.
 */
function prepareStart(projectId: string, root: string, task: Task, baseDir: string): { ok: true; ctx: Omit<StartContext, "bundlePath"> } | { ok: false; status: number; error: string } {
  const settings = getExecSettings(projectId);
  if (settings.taskMode === "delivery") return fail(409, "Project ini mode delivery: task tidak dijalankan agen.");
  if (!settings.execProviderId) return fail(409, "Pilih agen eksekusi dulu di Pengaturan project → Task.");
  const provider = getProvider(settings.execProviderId);
  if (!provider || !cliRuntimeFor(provider)) return fail(409, "Agen eksekusi harus agen CLI (OpenCode, Claude Code, atau Codex).");
  if (provider.cliAgent === "antigravity") return fail(409, "Antigravity belum didukung untuk eksekusi task.");

  const repos = listProjectRepos(root);
  const problems = readinessProblems(task, repos.length);
  if (problems.length > 0) return fail(409, `Task belum siap: ${problems.map((p) => PROBLEM_LABELS[p]).join(", ")}.`);

  const repoIds = parseList(task.reposJson);
  const resolved = repoIds.length > 0 ? repoIds : repos.length === 1 ? [repos[0].id] : [];
  const repoInfos = resolved.map((id) => findRepo(root, id));
  const missing = resolved.find((_, i) => !repoInfos[i]);
  if (missing) return fail(409, `Repo ${missing} tidak ditemukan di project ini.`);

  void baseDir;
  return {
    ok: true,
    ctx: {
      projectId,
      root,
      task,
      providerId: provider.id,
      model: settings.execModel,
      cliAgent: provider.cliAgent ?? null,
      maxSteps: normalizeAgentMaxSteps(getSetting("agentMaxSteps")),
      maxParallel: settings.maxParallel,
      baseBranches: settings.baseBranches,
      repoInfos: repoInfos as RepoInfo[],
    },
  };
}

/**
 * Creates the run's folder, worktrees, and thread, then queues its prompt on the thread so the
 * server sends it, with or without a client open.
 */
async function launchRun(runId: string, ctx: StartContext): Promise<StartRunResult> {
  const { projectId, root, task, bundlePath } = ctx;
  const config = readWorktreeConfig(root);
  writeExecutePolicy(bundlePath, ctx.repoInfos.flatMap((r) => (config.checks[r.id] ?? []).map((c) => c.command)));

  const branch = `onesist/${slug(task.code ?? task.title, 32)}-${runId.replace(/-/g, "").slice(-6)}`;
  const worktrees: { id: string; worktreePath: string; branch: string }[] = [];
  for (const repo of ctx.repoInfos) {
    const baseRef = ctx.baseBranches[repo.id] ?? null;
    const made = await createWorktree({ repo, projectId, projectRoot: root, baseDir: bundlePath, branch, baseRef, fromOrigin: false });
    if (!made.ok) {
      db.update(taskRuns).set({ state: "failed", error: made.error, endedAt: new Date().toISOString() }).where(eq(taskRuns.id, runId)).run();
      return refuse(made.status, made.error);
    }
    const head = await runGit(made.path, ["rev-parse", "HEAD"]);
    db.insert(taskRunRepos)
      .values({ id: randomUUID(), runId, repo: repo.id, worktreePath: made.path, branch: made.branch, baseBranch: baseRef, baseCommit: head.code === 0 ? head.stdout.trim() : null })
      .run();
    worktrees.push({ id: repo.id, worktreePath: made.path, branch: made.branch });
  }

  const title = task.code ? `${task.code}: ${task.title.replace(`${task.code}:`, "").trim()}` : task.title;
  const thread = createThread({
    projectId,
    title,
    mode: "agent",
    providerId: ctx.providerId,
    model: ctx.model,
    // `execute` where the run's rules reach every shell command (Claude Code, OpenCode, Pi). Codex
    // runs its own shell inside the sandbox without asking, so its runs keep `ask`.
    permissionMode: EXECUTE_RUNTIMES.includes(ctx.cliAgent ?? "") ? "execute" : "ask",
    maxSteps: ctx.maxSteps,
  });
  updateThread(thread.id, {
    workspaceStrategy: "worktree",
    workspaceRepo: worktrees[0]?.id ?? null,
    workspacePath: bundlePath,
    workspaceBranch: worktrees.length === 1 ? branch : null,
  });
  const now = new Date().toISOString();
  db.update(taskRuns).set({ threadId: thread.id, state: "running", startedAt: now, updatedAt: now }).where(eq(taskRuns.id, runId)).run();
  db.update(tasks).set({ status: "in_progress", updatedAt: now }).where(eq(tasks.id, task.id)).run();

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
  // The server sends the prompt through the thread's queue, so the run starts even with no client open.
  enqueue(thread.id, [text]);
  void kick(thread.id);
  return { ok: true, runId, threadId: thread.id, title, text, queued: false, position: null };
}

/**
 * Starts the task's run now, or queues it when the project is at its parallel limit. A queued
 * run is started by `promoteQueued` when a slot frees up.
 */
export async function startTaskRun(input: { projectId: string; root: string; task: Task; baseDir: string }): Promise<StartRunResult> {
  const { projectId, root, task, baseDir } = input;
  const prepared = prepareStart(projectId, root, task, baseDir);
  if (!prepared.ok) return refuse(prepared.status, prepared.error);
  if (countActive({ taskId: task.id }) > 0) return refuse(409, "Task ini sudah punya run yang berjalan.");

  const runId = randomUUID();
  const bundlePath = path.join(baseDir, "runs", runId);
  const ctx: StartContext = { ...prepared.ctx, bundlePath };
  const now = new Date().toISOString();
  const atLimit = countActive({ projectId }) >= prepared.ctx.maxParallel;
  db.insert(taskRuns)
    .values({
      id: runId,
      taskId: task.id,
      projectId,
      bundlePath,
      providerId: prepared.ctx.providerId,
      model: prepared.ctx.model,
      state: atLimit ? "queued" : "running",
      createdAt: now,
      startedAt: atLimit ? null : now,
      updatedAt: now,
    })
    .run();

  if (atLimit) {
    db.update(tasks).set({ status: "in_progress", updatedAt: now }).where(eq(tasks.id, task.id)).run();
    const position = db.select({ id: taskRuns.id }).from(taskRuns).where(and(eq(taskRuns.projectId, projectId), eq(taskRuns.state, "queued"))).all().length;
    return { ok: true, runId, threadId: null, title: task.title, text: null, queued: true, position };
  }
  return launchRun(runId, ctx);
}

/**
 * Starts queued runs, oldest first, while the project has a free slot. Called whenever a run
 * leaves an active state (approved, discarded, failed, or validated).
 */
export async function promoteQueued(projectId: string): Promise<void> {
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get();
  if (!project?.rootPath) return;
  for (;;) {
    const maxParallel = getExecSettings(projectId).maxParallel;
    if (countActive({ projectId }) >= maxParallel) return;
    const next = db
      .select()
      .from(taskRuns)
      .where(and(eq(taskRuns.projectId, projectId), eq(taskRuns.state, "queued")))
      .orderBy(asc(taskRuns.createdAt))
      .get();
    if (!next) return;
    const task = db.select().from(tasks).where(eq(tasks.id, next.taskId)).get() as Task | undefined;
    // Claim the slot before any await, so two promotions cannot take the same one.
    db.update(taskRuns).set({ state: "running", updatedAt: new Date().toISOString() }).where(eq(taskRuns.id, next.id)).run();
    const prepared = task ? prepareStart(projectId, project.rootPath, task, next.bundlePath) : { ok: false as const, status: 404, error: "Task tidak ditemukan." };
    if (!prepared.ok) {
      db.update(taskRuns).set({ state: "failed", error: prepared.error, endedAt: new Date().toISOString() }).where(eq(taskRuns.id, next.id)).run();
      continue;
    }
    await launchRun(next.id, { ...prepared.ctx, bundlePath: next.bundlePath });
  }
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
      void promoteQueued(run.projectId).catch((err) => console.error("[task-runs] promote failed:", err));
    }
  }
}

// Registered once when the module loads (the server loads it through the task-runs route),
// the same way the chat queue listens to its own events.
for (const type of ["chat:question", "chat:question-resolved", "chat:run"]) {
  eventBus.on(type, (event: { type: string; data: unknown }) => applyRunEvent(event.type, event.data));
}
