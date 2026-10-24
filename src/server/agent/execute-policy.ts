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
 */
export function shellCommandAllowed(command: string, allowed: string[]): boolean {
  const trimmed = command.trim();
  const cd = /^cd ([^\s;&|<>`$]+) && (.+)$/.exec(trimmed);
  if (cd && (/^[/~]/.test(cd[1]) || cd[1].split("/").includes(".."))) return false;
  const rest = cd ? cd[2].trim() : trimmed;
  if (/[;&|<>`\n\r]|\$\(/.test(rest)) return false;
  const safeGit = ["git status", "git diff", "git diff --stat", "git log", "git log --oneline"];
  return allowed.includes(rest) || safeGit.includes(rest);
}

/** The decision for an OpenCode-style permission request, or null when the user must answer. */
export function executeAutoDecision(action: string, resources: string[], folder: string, allowed: string[]): "once" | null {
  if (resources.length === 0) return null;
  if (action === "edit") {
    return resources.every((r) => isInside(path.resolve(folder, r), folder)) ? "once" : null;
  }
  if (action === "shell") {
    return resources.every((r) => shellCommandAllowed(r, allowed)) ? "once" : null;
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
