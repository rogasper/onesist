import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readWorktreeConfig, saveChecks, suggestChecks } from "./task-checks";

let root = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-checks-"));
});

const configPath = () => path.join(root, ".agents", "onesist-worktree.json");

test("a missing or broken config reads as empty", () => {
  expect(readWorktreeConfig(root)).toEqual({ setup: {}, checks: {} });
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), "{ not json");
  expect(readWorktreeConfig(root)).toEqual({ setup: {}, checks: {} });
});

test("saving checks keeps the setup commands and other repos", () => {
  fs.writeFileSync(configPath(), JSON.stringify({ setup: { "input/code/api": "bun install" }, checks: { ".": [{ name: "lint", command: "bun run lint" }] } }));
  const res = saveChecks(root, "input/code/api", [{ name: "test", command: "bun test" }]);
  expect(res.ok).toBe(true);
  const config = JSON.parse(fs.readFileSync(configPath(), "utf-8"));
  expect(config.setup).toEqual({ "input/code/api": "bun install" });
  expect(config.checks["input/code/api"]).toEqual([{ name: "test", command: "bun test" }]);
  expect(config.checks["."]).toEqual([{ name: "lint", command: "bun run lint" }]);
});

test("invalid checks are refused with an Indonesian message", () => {
  const empty = saveChecks(root, ".", [{ name: "test", command: "   " }]);
  expect(empty.ok).toBe(false);
  if (!empty.ok) expect(empty.error).toBe("Perintah cek tidak boleh kosong");
  expect(saveChecks(root, ".", "nope").ok).toBe(false);
  expect(saveChecks(root, ".", Array.from({ length: 11 }, (_, i) => ({ name: `c${i}`, command: "x" }))).ok).toBe(false);
});

test("suggested checks come from package.json scripts, with the runner the repo uses", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-checks-repo-"));
  fs.writeFileSync(path.join(repo, "package.json"), JSON.stringify({ scripts: { typecheck: "tsc", test: "bun test", dev: "vite" } }));
  expect(suggestChecks(repo)).toEqual([
    { name: "typecheck", command: "npm run typecheck" },
    { name: "test", command: "npm run test" },
  ]);
  fs.writeFileSync(path.join(repo, "bun.lock"), "");
  expect(suggestChecks(repo)[0].command).toBe("bun run typecheck");
  expect(suggestChecks(os.tmpdir() + "/does-not-exist")).toEqual([]);
});
