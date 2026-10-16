/**
 * The Claude Code binary the Agent SDK runs: always the user's own `claude`, never the SDK's
 * bundled copy, and never a Windows launcher shim the SDK cannot spawn.
 *
 *   bun test src/server/agent/cli/claude/executable.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveClaudeExecutable } from "./executable";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-claude-exe-"));
const fake = path.join(dir, "claude");
fs.writeFileSync(fake, "#!/bin/sh\necho 2.1.296\n", { mode: 0o755 });

test("a configured path that exists is used as it is", () => {
  expect(resolveClaudeExecutable(` ${fake} `)).toEqual({ ok: true, path: fake });
});

test("a configured path that does not exist says Claude Code was not found", () => {
  const r = resolveClaudeExecutable(path.join(dir, "tidak-ada"));
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toContain("Claude Code tidak ditemukan");
});

test("a Windows launcher shim is refused with a pointer to claude.exe", () => {
  const shim = path.join(dir, "claude.cmd");
  fs.writeFileSync(shim, "@echo off\n");
  const r = resolveClaudeExecutable(shim, "win32");
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error).toContain("claude.exe");
  // On other platforms a .cmd file is just a file.
  expect(resolveClaudeExecutable(shim, "darwin")).toEqual({ ok: true, path: shim });
});
