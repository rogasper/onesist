/**
 * Fase 4C: the shapes of a thread's workspace, shared by the server and the chat UI, and
 * the one name both show for it.
 */
export type WorkspaceStrategy = "root" | "worktree" | "existing_worktree";

export interface WorkspaceView {
  /** Null = the project root. */
  strategy: WorkspaceStrategy | null;
  repo: string | null;
  path: string | null;
  branch: string | null;
}

export interface WorkspaceSetupView {
  state: "running" | "ok" | "failed";
  command: string;
  exitCode: number | null;
  tail: string;
}

export interface WorkspaceDetail extends WorkspaceView {
  label: string;
  /** The folder is gone (deleted outside Onesist). */
  missing: boolean;
  setup: WorkspaceSetupView | null;
}

export interface WorkspaceOptions {
  current: WorkspaceDetail;
  baseDir: string;
  defaultBranch: string;
  repos: { id: string; branch: string | null; worktrees: { path: string; branch: string | null }[]; setup: string | null }[];
}

export interface ProjectWorktree {
  repo: string;
  path: string;
  branch: string | null;
  missing: boolean;
  dirtyFiles: number;
  threads: { id: string; title: string | null }[];
}

export type WorkspaceRequest =
  | { strategy: "root"; repo?: string | null }
  | { strategy: "worktree"; repo: string; branch?: string | null; baseRef?: string | null; fromOrigin?: boolean }
  | { strategy: "existing_worktree"; repo: string; path: string };

export function workspaceLabel(ws: Pick<WorkspaceView, "strategy" | "repo" | "branch"> | null | undefined): string {
  if (!ws || !ws.strategy) return "Root project";
  const repo = ws.repo === "." ? "root project" : (ws.repo ?? "repo");
  if (ws.strategy === "root") return ws.branch ? `Repo ${repo} · ${ws.branch}` : `Repo ${repo}`;
  return `Worktree ${ws.branch ?? "(tanpa branch)"} · ${repo}`;
}
