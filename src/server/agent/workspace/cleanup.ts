/**
 * Fase 4C: Onesist's worktrees in a project, for the separate clean-up step. Nothing here
 * runs on its own: deleting a thread or a project leaves its worktree and branch alone.
 * Removing a worktree checks for local changes first. Its branch always stays, and the
 * threads that worked there go back to the project root with a notice.
 */
import fs from "node:fs";
import { eq } from "drizzle-orm";
import type { ProjectWorktree } from "~/lib/workspace-view";
import { getRunForThread } from "~/server/agent/run-registry";
import { appendMessage, resetProviderSessions, updateThread } from "~/server/agent/store";
import { db } from "~/server/db/client";
import { chatThreads } from "~/server/db/schema";
import { eventBus } from "~/server/realtime/events";
import { lastLine, runGit } from "./git";
import { isInside, realOrResolved, worktreesBaseDir } from "./location";
import { linkedWorktrees, listProjectRepos } from "./worktrees";

function threadsWithWorkspace(projectId: string): { id: string; title: string | null; workspacePath: string }[] {
  return (
    db
      .select({ id: chatThreads.id, title: chatThreads.title, workspacePath: chatThreads.workspacePath })
      .from(chatThreads)
      .where(eq(chatThreads.projectId, projectId))
      .all() as { id: string; title: string | null; workspacePath: string | null }[]
  ).filter((t): t is { id: string; title: string | null; workspacePath: string } => !!t.workspacePath);
}

/** Onesist's = under the worktree base, used by a thread here, or on an `onesist/` branch (older bases). */
export async function listOnesistWorktrees(projectId: string, projectRoot: string, baseDir = worktreesBaseDir()): Promise<ProjectWorktree[]> {
  const users = threadsWithWorkspace(projectId);
  const out: ProjectWorktree[] = [];
  for (const repo of listProjectRepos(projectRoot)) {
    for (const w of await linkedWorktrees(repo)) {
      const threads = users.filter((t) => t.workspacePath === w.path).map(({ id, title }) => ({ id, title }));
      const ours = isInside(w.path, baseDir) || threads.length > 0 || !!w.branch?.startsWith("onesist/");
      if (!ours) continue;
      const missing = !fs.existsSync(w.path);
      const status = missing ? null : await runGit(w.path, ["status", "--porcelain"]);
      const dirtyFiles = status ? status.stdout.split(/\r?\n/).filter((l) => l.trim()).length : 0;
      out.push({ repo: repo.id, path: w.path, branch: w.branch, missing, dirtyFiles, threads });
    }
  }
  return out;
}

export type RemoveResult = { ok: true; resetThreads: number } | { ok: false; status: number; error: string; dirtyFiles?: number };

export async function removeOnesistWorktree(input: { projectId: string; projectRoot: string; path: string; force: boolean; baseDir?: string }): Promise<RemoveResult> {
  const wanted = realOrResolved(input.path);
  // Only a path from the list; anything else (the repo itself, /etc, …) is refused before git runs.
  const target = (await listOnesistWorktrees(input.projectId, input.projectRoot, input.baseDir)).find((w) => w.path === wanted);
  if (!target) return { ok: false, status: 404, error: "Worktree itu bukan worktree Onesist di project ini." };
  if (target.threads.some((t) => getRunForThread(t.id))) return { ok: false, status: 409, error: "Ada agent yang sedang bekerja di worktree itu." };
  if (target.dirtyFiles > 0 && !input.force) {
    return { ok: false, status: 409, error: `Worktree punya ${target.dirtyFiles} berkas yang berubah atau belum di-commit.`, dirtyFiles: target.dirtyFiles };
  }
  const repo = listProjectRepos(input.projectRoot).find((r) => r.id === target.repo);
  if (!repo) return { ok: false, status: 404, error: "Repo worktree itu tidak ditemukan lagi." };
  const res = target.missing
    ? await runGit(repo.absPath, ["worktree", "prune"])
    : await runGit(repo.absPath, ["worktree", "remove", ...(input.force ? ["--force"] : []), target.path]);
  if (res.code !== 0) return { ok: false, status: 500, error: `Gagal menghapus worktree: ${lastLine(res.stderr)}` };

  for (const t of target.threads) {
    updateThread(t.id, { workspaceStrategy: null, workspaceRepo: null, workspacePath: null, workspaceBranch: null });
    resetProviderSessions(t.id);
    appendMessage({
      threadId: t.id,
      role: "system",
      kind: "workspaceNotice",
      parts: [{ type: "data-notice", data: { kind: "workspace", label: "Root project", reason: "removed" } }],
    });
    eventBus.emitChatWorkspace({ threadId: t.id });
  }
  return { ok: true, resetThreads: target.threads.length };
}
