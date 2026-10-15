/**
 * Where Fase 4C worktrees live. Always outside the project root: the file watcher and the
 * index watch the project root, and a worktree inside it would flood `file:changed` and be
 * indexed twice. Never derived from the working directory (macOS desktop starts with CWD=/).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** SA_WORKTREES_DIR, else beside the database (desktop: app data), else ~/.onesist/worktrees. */
export function worktreesBaseDir(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.SA_WORKTREES_DIR?.trim();
  if (explicit) return path.resolve(explicit);
  const dbPath = env.SA_DB_PATH?.trim();
  if (dbPath) return path.join(path.dirname(path.resolve(dbPath)), "worktrees");
  // Not beside a CWD-relative data.db: in web dev that is the Onesist repo itself.
  return path.join(os.homedir(), ".onesist", "worktrees");
}

/**
 * The real path (macOS /var → /private/var). For a path that does not exist yet, the real
 * path of its nearest existing ancestor plus the rest, so it still compares equal later.
 */
export function realOrResolved(p: string): string {
  const abs = path.resolve(p);
  let dir = abs;
  const rest: string[] = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(dir), ...rest);
    } catch {
      const parent = path.dirname(dir);
      if (parent === dir) return abs;
      rest.unshift(path.basename(dir));
      dir = parent;
    }
  }
}

export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(realOrResolved(parent), realOrResolved(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function slug(text: string, max = 40): string {
  const s = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/, "");
  return s || "thread";
}

/** `onesist/<title>-<last 6 of the thread id>`: readable, and unique per thread. */
export function defaultBranchName(title: string | null, threadId: string): string {
  const tail = threadId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toLowerCase();
  return `onesist/${slug(title ?? "", 32)}-${tail}`;
}

/** `<base>/<project>/<repo>-<branch>`, with -2, -3… when the folder is taken. */
export function worktreeDirFor(input: { baseDir: string; projectId: string; repoId: string; branch: string }): string {
  const repoPart = input.repoId === "." ? "root" : slug(path.basename(input.repoId), 24);
  const name = `${repoPart}-${slug(input.branch.replace(/^onesist\//, ""), 40)}`;
  const dir = path.join(input.baseDir, slug(input.projectId, 64), name);
  if (!fs.existsSync(dir)) return dir;
  for (let i = 2; ; i++) {
    const candidate = `${dir}-${i}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
}
