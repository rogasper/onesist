import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface AgentCliConfig {
  name: string;
  command: string;
  minVersion: string;
  found: boolean;
  version: string | null;
  path: string | null;
}

const AGENTS: { name: string; command: string; minVersion: string }[] = [
  { name: "opencode", command: "opencode", minVersion: "1.0.0" },
  { name: "claude-code", command: "claude", minVersion: "2.0.0" },
  { name: "codex", command: "codex", minVersion: "0.1.0" },
  { name: "antigravity", command: "agy", minVersion: "1.0.0" },
];

const IS_WIN = process.platform === "win32";

// Windows appends these extensions when resolving bare names (PATHEXT);
// .cmd/.bat scripts additionally need a shell (cmd.exe) to run.
const WIN_EXTS = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD")
  .split(";")
  .filter(Boolean)
  .map((e) => e.toLowerCase());

/**
 * Resolve a command name to an absolute executable path across platforms.
 * Unix: scans $PATH for an executable (falls back to `which`). Windows:
 * scans $PATH for name + each PATHEXT extension, since `which` doesn't
 * exist natively and bare names aren't resolved by the filesystem.
 */
export function resolveExecutable(command: string): string | null {
  const hasExt = path.extname(command) !== "";

  if (IS_WIN) {
    const searchDirs = (process.env.PATH || "").split(path.delimiter);
    for (const dir of searchDirs) {
      if (!dir) continue;
      const candidates = hasExt
        ? [path.join(dir, command)]
        : WIN_EXTS.map((ext) => path.join(dir, command + ext));
      for (const candidate of candidates) {
        try {
          if (fs.statSync(candidate).isFile()) return candidate;
        } catch {}
      }
    }
    // Last resort: `where` (available on Windows 10+, also in Git Bash).
    try {
      const out = execSync(`where ${command}`, {
        encoding: "utf-8",
        windowsHide: true,
      }).trim();
      const first = out.split("\r\n")[0].split("\n")[0].trim();
      if (first) return first;
    } catch {}
    return null;
  }

  // Unix: scan $PATH for an executable file directly (no `which` dependency).
  const searchDirs = (process.env.PATH || "").split(path.delimiter);
  for (const dir of searchDirs) {
    if (!dir) continue;
    const candidate = path.join(dir, command);
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  try {
    const out = execSync(`which ${command} 2>/dev/null`, { encoding: "utf-8" }).trim();
    if (out) return out;
  } catch {}
  return null;
}

/** True when the resolved path is a shell script (.cmd/.bat) on Windows. */
export function needsShell(exePath: string | null): boolean {
  if (!IS_WIN || !exePath) return false;
  const ext = path.extname(exePath).toLowerCase();
  return ext === ".cmd" || ext === ".bat";
}

export function detectAllAgents(): AgentCliConfig[] {
  return AGENTS.map((agent) => {
    const exePath = resolveExecutable(agent.command);
    if (!exePath) return { ...agent, found: false, version: null, path: null };

    let version: string | null = null;
    try {
      // execFileSync (not execSync) so args aren't reinterpreted by a shell;
      // .cmd/.bat need the shell flag so cmd.exe executes them. When a shell
      // is used, the executable path must be pre-quoted — Node does NOT quote
      // it for you, and "C:\Program Files\..." would be split at the space.
      const shellCmd = needsShell(exePath) ? `"${exePath}"` : exePath;
      const out = execFileSync(shellCmd, ["--version"], {
        encoding: "utf-8",
        windowsHide: true,
        shell: needsShell(exePath),
        timeout: 5000,
      });
      version = out.trim().split("\n")[0] || null;
    } catch {
      try {
        // Some CLIs (older codex) print --version to stderr or take it as -v.
        const out = execSync(`"${exePath}" --version 2>&1`, {
          encoding: "utf-8",
          windowsHide: true,
          timeout: 5000,
        });
        version = out.trim().split("\n")[0] || null;
      } catch {}
    }
    return { ...agent, found: true, version, path: exePath };
  });
}

export function findFirstAvailableAgent(): AgentCliConfig | null {
  return detectAllAgents().find((a) => a.found) ?? null;
}

export interface AgentModels {
  models: string[];
  supported: boolean;
}

/** List selectable models for an agent CLI. Only opencode (`opencode models`)
 *  and antigravity (`agy models` → one `slug  Human Label` per line) expose a
 *  model list; claude/codex don't have an equivalent command. */
export function listAgentModels(agentName: string): AgentModels {
  if (agentName === "opencode") {
    try {
      const out = execSync("opencode models", { encoding: "utf-8", timeout: 15000 }).trim();
      const models = out.split("\n").map((l) => l.trim()).filter(Boolean);
      return { models, supported: true };
    } catch {
      return { models: [], supported: false };
    }
  }
  if (agentName === "antigravity") {
    try {
      // `agy models` prints one line per model: "<slug>     <Human Label>".
      // The slug (first column) is what --model accepts.
      const out = execSync("agy models", { encoding: "utf-8", timeout: 15000 }).trim();
      const models = out.split("\n").map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
      return { models, supported: true };
    } catch {
      return { models: [], supported: false };
    }
  }
  return { models: [], supported: false };
}
