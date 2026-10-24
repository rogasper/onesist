import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeAutoDecision, readAllowedCommands, shellCommandAllowed, writeExecutePolicy } from "./execute-policy";

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-execute-policy-"));
fs.mkdirSync(path.join(folder, "api"), { recursive: true });
const allowed = ["bun run typecheck", "bun test"];

test("shell: configured checks and read-only git run without a question", () => {
  expect(shellCommandAllowed("bun test", allowed)).toBe(true);
  expect(shellCommandAllowed("git status", allowed)).toBe(true);
  expect(shellCommandAllowed("git diff --stat", allowed)).toBe(true);
});

test("shell: a cd into the run folder is allowed before a check", () => {
  expect(shellCommandAllowed("cd api && bun test", allowed)).toBe(true);
  expect(shellCommandAllowed("cd /etc && bun test", allowed)).toBe(false);
  expect(shellCommandAllowed("cd ../elsewhere && bun test", allowed)).toBe(false);
});

test("shell: anything else, or any chaining, asks", () => {
  expect(shellCommandAllowed("rm -rf api", allowed)).toBe(false);
  expect(shellCommandAllowed("bun test && rm -rf api", allowed)).toBe(false);
  expect(shellCommandAllowed("bun test; rm x", allowed)).toBe(false);
  expect(shellCommandAllowed("echo `whoami`", allowed)).toBe(false);
  expect(shellCommandAllowed("git push origin main", allowed)).toBe(false);
  expect(shellCommandAllowed("git diff --output=/tmp/x", allowed)).toBe(false);
});

test("edits: inside the run folder need no question, outside asks", () => {
  expect(executeAutoDecision("edit", [path.join(folder, "api", "a.ts")], folder, allowed)).toBe("once");
  expect(executeAutoDecision("edit", ["api/b.ts"], folder, allowed)).toBe("once");
  expect(executeAutoDecision("edit", ["/etc/hosts"], folder, allowed)).toBeNull();
  expect(executeAutoDecision("edit", [], folder, allowed)).toBeNull();
});

test("shell requests use the command as the resource; external folders always ask", () => {
  expect(executeAutoDecision("shell", ["bun test"], folder, allowed)).toBe("once");
  expect(executeAutoDecision("shell", ["rm -rf /"], folder, allowed)).toBeNull();
  expect(executeAutoDecision("external_directory", [folder], folder, allowed)).toBeNull();
});

test("the allowed commands live in the run folder and round-trip", () => {
  writeExecutePolicy(folder, ["bun test"]);
  expect(readAllowedCommands(folder)).toEqual(["bun test"]);
  expect(readAllowedCommands(os.tmpdir() + "/does-not-exist-onesist")).toEqual([]);
});

test("a chain of allowed segments runs; the same chain with one unknown segment asks", () => {
  expect(shellCommandAllowed("node test.js; echo exit=$?; git status --short", ["node test.js"])).toBe(true);
  expect(shellCommandAllowed("rtk git status --short", allowed)).toBe(true);
  expect(shellCommandAllowed("cd api && bun test && echo ok", allowed)).toBe(true);
  expect(shellCommandAllowed("bun test; rm -rf api", allowed)).toBe(false);
  expect(shellCommandAllowed("bun test; echo $(id)", allowed)).toBe(false);
  expect(shellCommandAllowed("bun test | tee out.txt", allowed)).toBe(false);
  expect(shellCommandAllowed("echo hi > x.txt", allowed)).toBe(false);
  expect(shellCommandAllowed("bun test;", allowed)).toBe(false);
});

test("read-only file commands, an absolute cd into the run folder, and 2>/dev/null are allowed", () => {
  expect(shellCommandAllowed(`cd ${folder}/api && rtk ls -a && rtk read src/sum.js test.js`, allowed, folder)).toBe(true);
  expect(shellCommandAllowed("rtk ls AGENTS.md CLAUDE.md 2>/dev/null", allowed, folder)).toBe(true);
  expect(shellCommandAllowed("cat src/sum.js", allowed, folder)).toBe(true);
  expect(shellCommandAllowed("cd /etc && cat hosts", allowed, folder)).toBe(false);
  expect(shellCommandAllowed("cd /private/tmp/elsewhere && cat x", allowed, folder)).toBe(false);
  expect(shellCommandAllowed("find . -exec rm {} ;", allowed, folder)).toBe(false);
  expect(shellCommandAllowed("grep -r foo . -exec x", allowed, folder)).toBe(false);
});

test("a pipe is allowed only into a text viewer", () => {
  expect(shellCommandAllowed("cat src/sum.js | head -5", allowed, folder)).toBe(true);
  expect(shellCommandAllowed("echo hi | grep h", allowed, folder)).toBe(true);
  expect(shellCommandAllowed("rtk git log --oneline | head", allowed, folder)).toBe(true);
  expect(shellCommandAllowed("node test.js | sh", ["node test.js"], folder)).toBe(false);
  expect(shellCommandAllowed("bun test | tee out.txt", allowed, folder)).toBe(false);
  expect(shellCommandAllowed("cat x || rm y", allowed, folder)).toBe(false);
  expect(shellCommandAllowed("echo hi > x.txt", allowed, folder)).toBe(false);
});

test("read-only git with a count flag is allowed; git commands that write are not", () => {
  expect(shellCommandAllowed("git log --oneline -3", allowed, folder)).toBe(true);
  expect(shellCommandAllowed("git log -3", allowed, folder)).toBe(true);
  expect(shellCommandAllowed("git diff --output=/tmp/x", allowed, folder)).toBe(false);
  expect(shellCommandAllowed("git push origin main", allowed, folder)).toBe(false);
});
