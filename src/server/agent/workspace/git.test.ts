/**
 * Git plumbing and worktree locations for Fase 4C.
 *
 *   bun test src/server/agent/workspace/git.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lastLine, parseWorktreeList, runGit } from "./git";
import { defaultBranchName, isInside, realOrResolved, slug, worktreeDirFor, worktreesBaseDir } from "./location";

test("worktree list porcelain becomes entries, the main checkout first", () => {
  const porcelain = [
    "worktree /repo/api",
    "HEAD 1111111111111111111111111111111111111111",
    "branch refs/heads/main",
    "",
    "worktree /wt/p1/api-fitur",
    "HEAD 2222222222222222222222222222222222222222",
    "branch refs/heads/onesist/fitur",
    "",
    "worktree /wt/p1/api-lepas",
    "HEAD 3333333333333333333333333333333333333333",
    "detached",
    "prunable gitdir file points to non-existent location",
    "",
  ].join("\n");
  expect(parseWorktreeList(porcelain)).toEqual([
    { path: "/repo/api", head: "1111111111111111111111111111111111111111", branch: "main", detached: false, bare: false, prunable: false },
    { path: "/wt/p1/api-fitur", head: "2222222222222222222222222222222222222222", branch: "onesist/fitur", detached: false, bare: false, prunable: false },
    { path: "/wt/p1/api-lepas", head: "3333333333333333333333333333333333333333", branch: null, detached: true, bare: false, prunable: true },
  ]);
  expect(parseWorktreeList("")).toEqual([]);
});

test("runGit reports the exit code and output, and never throws", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-git-run-"));
  const version = await runGit(dir, ["--version"]);
  expect(version.code).toBe(0);
  expect(version.stdout).toContain("git version");
  const notRepo = await runGit(dir, ["rev-parse", "--show-toplevel"]);
  expect(notRepo.code).not.toBe(0);
  expect(lastLine(notRepo.stderr)).toContain("not a git repository");
  expect(lastLine("")).toBe("tanpa keterangan");
});

test("the worktree base comes from the env, never from the working directory", () => {
  expect(worktreesBaseDir({ SA_WORKTREES_DIR: "/data/wt" } as any)).toBe(path.resolve("/data/wt"));
  expect(worktreesBaseDir({ SA_DB_PATH: "/app/support/data.db" } as any)).toBe(path.join("/app/support", "worktrees"));
  expect(worktreesBaseDir({} as any)).toBe(path.join(os.homedir(), ".onesist", "worktrees"));
});

test("paths compare by their real location, also for folders that do not exist yet", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-loc-"));
  expect(isInside(path.join(root, "input", "baru"), root)).toBe(true);
  expect(isInside(root, root)).toBe(true);
  expect(isInside(path.join(root, "..", "lain"), root)).toBe(false);
  // os.tmpdir() is a symlink on macOS: the real form of a missing child keeps the real parent.
  expect(realOrResolved(path.join(root, "belum", "ada"))).toBe(path.join(fs.realpathSync(root), "belum", "ada"));
});

test("branch and folder names are slugs, with a suffix when the folder is taken", () => {
  expect(slug("Tambah Tabel Audit — Klaim!")).toBe("tambah-tabel-audit-klaim");
  expect(slug("***")).toBe("thread");
  // The last 6 alphanumerics of the id, lower-cased: "…90ABCD" → "90abcd".
  expect(defaultBranchName("ERD klaim", "thr_abcdef1234567890ABCD")).toBe("onesist/erd-klaim-90abcd");
  expect(defaultBranchName(null, "thr_x1y2z3")).toBe("onesist/thread-x1y2z3");

  const base = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-wtdir-"));
  const first = worktreeDirFor({ baseDir: base, projectId: "p1", repoId: "input/code/api", branch: "onesist/fitur" });
  expect(first).toBe(path.join(base, "p1", "api-fitur"));
  fs.mkdirSync(first, { recursive: true });
  expect(worktreeDirFor({ baseDir: base, projectId: "p1", repoId: "input/code/api", branch: "onesist/fitur" })).toBe(`${first}-2`);
  expect(worktreeDirFor({ baseDir: base, projectId: "p1", repoId: ".", branch: "fitur" })).toBe(path.join(base, "p1", "root-fitur"));
});
