/**
 * Fase 4C: where a thread's CLI agent works. Null strategy = the project root.
 *
 * Moving the workspace drops the thread's CLI sessions, because they belong to the old
 * directory. The next CLI turn then starts a new session in the new directory, and 4A hands
 * it the conversation (t3code's `restart_and_resume`). Native turns always work in the
 * project root: their tools, memory, skills and checkpoints are rooted there. They get a
 * note so the model knows its edits do not land in the thread's worktree.
 */
import fs from "node:fs";
import { eq } from "drizzle-orm";
import { workspaceLabel, type WorkspaceDetail, type WorkspaceOptions, type WorkspaceRequest, type WorkspaceView } from "~/lib/workspace-view";
import { getRunForThread } from "~/server/agent/run-registry";
import { appendMessage, getThread, resetProviderSessions, updateThread, type ThreadRow } from "~/server/agent/store";
import { db } from "~/server/db/client";
import { projects } from "~/server/db/schema";
import { eventBus } from "~/server/realtime/events";
import { defaultBranchName, realOrResolved, worktreesBaseDir } from "./location";
import { setupCommandFor, setupState, startWorktreeSetup } from "./setup";
import { createWorktree, currentBranch, findRepo, linkedWorktrees, listProjectRepos } from "./worktrees";

const BUSY = "Tunggu sampai agent selesai sebelum memindahkan workspace.";

export function threadWorkspace(thread: ThreadRow): WorkspaceView {
  return {
    strategy: (thread.workspaceStrategy as WorkspaceView["strategy"]) ?? null,
    repo: thread.workspaceRepo ?? null,
    path: thread.workspacePath ?? null,
    branch: thread.workspaceBranch ?? null,
  };
}

export function workspaceDetail(thread: ThreadRow): WorkspaceDetail {
  const ws = threadWorkspace(thread);
  return { ...ws, label: workspaceLabel(ws), missing: !!ws.path && !fs.existsSync(ws.path), setup: setupState(thread.id) };
}

function projectRoot(projectId: string): string | null {
  const row = db.select().from(projects).where(eq(projects.id, projectId)).get() as { rootPath?: string | null } | undefined;
  return row?.rootPath?.trim() || null;
}

/** What the workspace dialog offers: the repos, their worktrees, and a branch name for this thread. */
export async function workspaceOptions(thread: ThreadRow, root: string): Promise<WorkspaceOptions> {
  const repos: WorkspaceOptions["repos"] = [];
  for (const repo of listProjectRepos(root)) {
    const worktrees = (await linkedWorktrees(repo)).filter((w) => fs.existsSync(w.path)).map((w) => ({ path: w.path, branch: w.branch }));
    repos.push({ id: repo.id, branch: await currentBranch(repo.absPath), worktrees, setup: setupCommandFor(root, repo.id) });
  }
  return { current: workspaceDetail(thread), baseDir: worktreesBaseDir(), defaultBranch: defaultBranchName(thread.title, thread.id), repos };
}

export type TurnWorkspace = { ok: true; cwd: string; note: string | null } | { ok: false; error: string };

/** The directory a turn works in. Only a CLI turn needs the folder to exist. */
export function resolveTurnWorkspace(thread: ThreadRow, root: string, isCli: boolean): TurnWorkspace {
  const ws = threadWorkspace(thread);
  if (!ws.path) return { ok: true, cwd: root, note: null };
  if (!isCli) {
    return {
      ok: true,
      cwd: root,
      note:
        `Catatan workspace: agent CLI di thread ini bekerja di ${workspaceLabel(ws)} (${ws.path}). ` +
        "Anda bekerja di root project, jadi berkas yang Anda ubah tidak masuk ke workspace itu.",
    };
  }
  if (!fs.existsSync(ws.path)) {
    return { ok: false, error: `Workspace thread ini tidak ditemukan (${ws.path}). Pilih workspace lain lewat strip workspace di atas percakapan.` };
  }
  return { ok: true, cwd: ws.path, note: null };
}

export type SetWorkspaceResult =
  | { ok: true; workspace: WorkspaceView; changed: boolean; setupStarted: boolean }
  | { ok: false; error: string; status: number };

export async function setThreadWorkspace(threadId: string, req: WorkspaceRequest, opts: { baseDir?: string } = {}): Promise<SetWorkspaceResult> {
  const thread = getThread(threadId);
  if (!thread) return { ok: false, status: 404, error: "Thread tidak ditemukan." };
  const root = projectRoot(thread.projectId);
  if (!root) return { ok: false, status: 400, error: "Project belum punya root path." };
  if (getRunForThread(threadId)) return { ok: false, status: 409, error: BUSY };

  let next: WorkspaceView;
  let created = false;
  if (req.strategy === "root" && !req.repo) {
    next = { strategy: null, repo: null, path: null, branch: null };
  } else {
    // Only a repo the server found; a client-named path never reaches git.
    const repo = findRepo(root, String(req.repo ?? ""));
    if (!repo) return { ok: false, status: 400, error: "Repo tidak dikenal di project ini." };
    if (req.strategy === "root") {
      next = { strategy: "root", repo: repo.id, path: repo.absPath, branch: await currentBranch(repo.absPath) };
    } else if (req.strategy === "existing_worktree") {
      const wanted = realOrResolved(String(req.path ?? ""));
      const entry = (await linkedWorktrees(repo)).find((w) => w.path === wanted);
      if (!entry || !fs.existsSync(entry.path)) return { ok: false, status: 400, error: "Worktree itu tidak terdaftar di repo ini." };
      next = { strategy: "existing_worktree", repo: repo.id, path: entry.path, branch: entry.branch };
    } else if (req.strategy === "worktree") {
      const made = await createWorktree({
        repo,
        projectId: thread.projectId,
        projectRoot: root,
        baseDir: opts.baseDir ?? worktreesBaseDir(),
        branch: req.branch?.trim() || defaultBranchName(thread.title, thread.id),
        baseRef: req.baseRef ?? null,
        fromOrigin: !!req.fromOrigin,
      });
      if (!made.ok) return made;
      next = { strategy: "worktree", repo: repo.id, path: made.path, branch: made.branch };
      created = true;
    } else {
      return { ok: false, status: 400, error: "Strategi workspace tidak dikenal." };
    }
  }
  // Checked again after the awaits: a turn may have started meanwhile. A worktree created
  // above stays; it shows up in the clean-up list.
  if (getRunForThread(threadId)) return { ok: false, status: 409, error: BUSY };

  const before = threadWorkspace(thread);
  const rootReal = realOrResolved(root);
  const changed = (before.path ?? rootReal) !== (next.path ?? rootReal);
  updateThread(threadId, { workspaceStrategy: next.strategy, workspaceRepo: next.repo, workspacePath: next.path, workspaceBranch: next.branch });
  if (!changed) return { ok: true, workspace: next, changed: false, setupStarted: false };

  resetProviderSessions(threadId);
  appendMessage({
    threadId,
    role: "system",
    kind: "workspaceNotice",
    parts: [{ type: "data-notice", data: { kind: "workspace", label: workspaceLabel(next), path: next.path } }],
  });
  eventBus.emitChatWorkspace({ threadId });

  const command = created && next.repo ? setupCommandFor(root, next.repo) : null;
  if (command && next.path) void startWorktreeSetup({ threadId, cwd: next.path, command });
  return { ok: true, workspace: next, changed: true, setupStarted: !!command };
}
