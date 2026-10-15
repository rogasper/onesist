/**
 * Repos a thread can work in, and new worktrees outside the project.
 *
 *   bun test src/server/agent/workspace/worktrees.test.ts
 */
import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createWorktree, currentBranch, findRepo, linkedWorktrees, listProjectRepos } from "./worktrees";

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd, encoding: "utf-8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout;
}

function makeRepo(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  git(dir, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(dir, "a.txt"), "a\n");
  git(dir, "add", "a.txt");
  git(dir, "commit", "-q", "-m", "init");
}

function project(): { root: string; base: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-wt-proj-"));
  makeRepo(path.join(root, "input", "code", "api"));
  fs.mkdirSync(path.join(root, "input", "code", "bukan-repo"), { recursive: true });
  fs.writeFileSync(path.join(root, "input", "code", "lepas.ts"), "x");
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-wt-base-"));
  return { root, base };
}

test("the repos of a project are the root when it is one, and the git repos under input/code", () => {
  const { root } = project();
  expect(listProjectRepos(root).map((r) => r.id)).toEqual(["input/code/api"]);
  makeRepo(root);
  const repos = listProjectRepos(root);
  expect(repos.map((r) => r.id)).toEqual([".", "input/code/api"]);
  expect(repos[1].absPath).toBe(fs.realpathSync(path.join(root, "input", "code", "api")));
  expect(findRepo(root, "input/code/api")?.id).toBe("input/code/api");
  expect(findRepo(root, "input/code/bukan-repo")).toBeNull();
  expect(findRepo(root, "../..")).toBeNull();
});

test("a new worktree gets its own branch, outside the project, and is listed by its repo", async () => {
  const { root, base } = project();
  const repo = findRepo(root, "input/code/api")!;
  const made = await createWorktree({ repo, projectId: "p1", projectRoot: root, baseDir: base, branch: "onesist/fitur", baseRef: null, fromOrigin: false });
  expect(made).toEqual({ ok: true, path: path.join(fs.realpathSync(base), "p1", "api-fitur"), branch: "onesist/fitur" });
  if (!made.ok) return;
  expect(fs.existsSync(path.join(made.path, "a.txt"))).toBe(true);
  expect(await currentBranch(made.path)).toBe("onesist/fitur");
  expect(await currentBranch(repo.absPath)).toBe("main");
  const linked = await linkedWorktrees(repo);
  expect(linked.map((w) => [w.path, w.branch])).toEqual([[made.path, "onesist/fitur"]]);
});

test("an existing branch is refused with a hint, and nothing is created", async () => {
  const { root, base } = project();
  const repo = findRepo(root, "input/code/api")!;
  git(repo.absPath, "branch", "onesist/ada");
  const made = await createWorktree({ repo, projectId: "p1", projectRoot: root, baseDir: base, branch: "onesist/ada", baseRef: null, fromOrigin: false });
  expect(made.ok).toBe(false);
  if (made.ok) return;
  expect(made.status).toBe(409);
  expect(made.error).toContain("sudah ada");
  expect(await linkedWorktrees(repo)).toEqual([]);
});

test("unsafe branch and base names are refused before git worktree add", async () => {
  const { root, base } = project();
  const repo = findRepo(root, "input/code/api")!;
  for (const branch of ["-x", "bad..x", "a b", ""]) {
    const made = await createWorktree({ repo, projectId: "p1", projectRoot: root, baseDir: base, branch, baseRef: null, fromOrigin: false });
    expect(made.ok ? 0 : made.status).toBe(400);
  }
  for (const baseRef of ["--orphan", "tidak-ada"]) {
    const made = await createWorktree({ repo, projectId: "p1", projectRoot: root, baseDir: base, branch: "onesist/ok", baseRef, fromOrigin: false });
    expect(made.ok ? 0 : made.status).toBe(400);
  }
  expect(await linkedWorktrees(repo)).toEqual([]);
});

test("a worktree base inside the project root is refused", async () => {
  const { root } = project();
  const repo = findRepo(root, "input/code/api")!;
  const made = await createWorktree({ repo, projectId: "p1", projectRoot: root, baseDir: path.join(root, ".worktrees"), branch: "onesist/x", baseRef: null, fromOrigin: false });
  expect(made.ok).toBe(false);
  if (made.ok) return;
  expect(made.status).toBe(400);
  expect(made.error).toContain("SA_WORKTREES_DIR");
  expect(fs.existsSync(path.join(root, ".worktrees"))).toBe(false);
});
