/**
 * The rules that let a task run (`execute` mode) act without a question, shared by every CLI
 * runtime. Writes inside the run folder are allowed. A shell command is allowed only when it is
 * one of the repo's configured checks, or one read-only git command, with nothing chained onto
 * it. A leading `cd <relative folder> &&` is allowed when the folder is inside the run.
 */
import fs from "node:fs";
import path from "node:path";
import { isInside } from "~/server/agent/workspace/location";

export const EXECUTE_POLICY_FILE = ".onesist-execute.json";

/**
 * Self-contained on purpose: the Pi extension embeds this function's source, so it must not
 * reference anything outside its own body.
 *
 * A command is judged one segment at a time (split on `&&` and `;`). Each segment must be a
 * `cd` into the run folder, one of the allowed commands, a read-only git command, an `echo`, or a
 * read-only file command (the same reads the Read, Glob, and Grep tools already allow). A leading
 * `rtk ` (the token-saving wrapper some setups add) and a trailing `2>/dev/null` are ignored. Pipes,
 * redirects, backticks, and command substitution are never allowed.
 */
export function shellCommandAllowed(command: string, allowed: string[], folder = ""): boolean {
  const trimmed = command.trim().replace(/\s*2>\/dev\/null/g, "");
  if (/[|<>`\n\r]|\$\(/.test(trimmed)) return false;
  const segments = trimmed.split(/&&|;/).map((seg) => seg.trim().replace(/^rtk\s+/, "").replace(/\$\?/g, ""));
  if (segments.length === 0 || segments.some((seg) => seg === "")) return false;
  const safeGit = ["git status", "git status --short", "git diff", "git diff --stat", "git diff --name-only", "git log", "git log --oneline"];
  const readOnly = ["ls", "cat", "head", "tail", "wc", "pwd", "rg", "grep", "read"];
  return segments.every((seg) => {
    const cd = /^cd ([^\s]+)$/.exec(seg);
    if (cd) {
      const target = cd[1];
      if (target.split("/").includes("..")) return false;
      if (!/^[/~]/.test(target)) return true;
      // An absolute folder is fine only when it is the run folder itself or inside it.
      return folder !== "" && (target === folder || target.startsWith(folder.endsWith("/") ? folder : folder + "/"));
    }
    if (/^echo( [\w=.,:\-\/"']*)?$/.test(seg)) return true;
    const word = seg.split(/\s+/)[0];
    if (readOnly.includes(word) && !/(^|\s)-(exec|delete)\b/.test(seg)) return true;
    return allowed.includes(seg) || safeGit.includes(seg);
  });
}

/** The decision for an OpenCode-style permission request, or null when the user must answer. */
export function executeAutoDecision(action: string, resources: string[], folder: string, allowed: string[]): "once" | null {
  if (resources.length === 0) return null;
  if (action === "edit") {
    return resources.every((r) => isInside(path.resolve(folder, r), folder)) ? "once" : null;
  }
  if (action === "shell") {
    return resources.every((r) => shellCommandAllowed(r, allowed, folder)) ? "once" : null;
  }
  return null;
}

export function writeExecutePolicy(folder: string, allowedCommands: string[]): void {
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, EXECUTE_POLICY_FILE), JSON.stringify({ allowedCommands }, null, 2) + "\n");
}

export function readAllowedCommands(folder: string): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(folder, EXECUTE_POLICY_FILE), "utf-8"));
    return Array.isArray(parsed?.allowedCommands) ? parsed.allowedCommands.filter((c: unknown): c is string => typeof c === "string") : [];
  } catch {
    return [];
  }
}
