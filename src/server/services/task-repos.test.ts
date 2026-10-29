import { beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listRepos } from "./task-repos";

const git = (cwd: string, args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "ignore" });

let root = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-repos-"));
  git(root, ["init", "-q", "-b", "main"]);
  git(root, ["commit", "-q", "--allow-empty", "-m", "init"]);
  const api = path.join(root, "input", "code", "api");
  fs.mkdirSync(api, { recursive: true });
  git(api, ["init", "-q", "-b", "develop"]);
  git(api, ["commit", "-q", "--allow-empty", "-m", "init"]);
  fs.mkdirSync(path.join(root, "input", "code", "notes"), { recursive: true });
});

test("lists the root and each git repo under input/code, root first", () => {
  const repos = listRepos(root);
  expect(repos.map((r) => r.id)).toEqual([".", "input/code/api"]);
  expect(repos[0].baseBranch).toBe("main");
  expect(repos[1].baseBranch).toBe("develop");
  expect(repos.every((r) => r.isGit)).toBe(true);
});

test("a folder without a repo is skipped, and a missing root gives an empty list", () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-repos-empty-"));
  expect(listRepos(empty)).toEqual([]);
  expect(listRepos(path.join(empty, "does-not-exist"))).toEqual([]);
});
