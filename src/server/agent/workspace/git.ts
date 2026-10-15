/**
 * Git for Fase 4C worktrees: one async runner, so a large checkout never blocks the server,
 * and the parser for `git worktree list --porcelain`. Arguments always go as an array,
 * never through a shell.
 */
import { spawn } from "node:child_process";

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runGit(cwd: string, args: string[], timeoutMs = 120_000): Promise<GitResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const done = (result: GitResult) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve(result);
    };
    let child: ReturnType<typeof spawn>;
    try {
      // GIT_TERMINAL_PROMPT=0: a fetch that needs credentials fails instead of waiting forever.
      child = spawn("git", args, { cwd, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
    } catch (err) {
      done({ code: 127, stdout: "", stderr: `git tidak bisa dijalankan: ${err instanceof Error ? err.message : String(err)}` });
      return;
    }
    timer = setTimeout(() => {
      child.kill();
      done({ code: 124, stdout, stderr: `${stderr}\ngit melewati batas waktu` });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => (stdout += chunk.toString()));
    child.stderr?.on("data", (chunk) => (stderr += chunk.toString()));
    child.on("error", (err) => done({ code: 127, stdout, stderr: `git tidak bisa dijalankan: ${err.message}` }));
    child.on("close", (code) => done({ code: code ?? 1, stdout, stderr }));
  });
}

export interface WorktreeEntry {
  path: string;
  head: string | null;
  branch: string | null;
  detached: boolean;
  bare: boolean;
  prunable: boolean;
}

/** Entries of `git worktree list --porcelain`; the first is the repo's main checkout. */
export function parseWorktreeList(porcelain: string): WorktreeEntry[] {
  const out: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;
  for (const line of porcelain.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      if (current) out.push(current);
      current = { path: line.slice("worktree ".length), head: null, branch: null, detached: false, bare: false, prunable: false };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("HEAD ")) current.head = line.slice("HEAD ".length);
    else if (line.startsWith("branch ")) current.branch = line.slice("branch ".length).replace(/^refs\/heads\//, "");
    else if (line === "detached") current.detached = true;
    else if (line === "bare") current.bare = true;
    else if (line.startsWith("prunable")) current.prunable = true;
  }
  if (current) out.push(current);
  return out;
}

/** The last non-empty line of git's output, for an error message. */
export function lastLine(text: string): string {
  return (
    text
      .trim()
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .at(-1)
      ?.trim() ?? "tanpa keterangan"
  );
}
