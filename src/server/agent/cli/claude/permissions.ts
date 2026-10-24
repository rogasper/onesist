/**
 * Onesist's permission modes for Claude Code. The SDK's own mode stays `default`; Onesist's
 * policy lives here: `disallowedTools` blocks write and shell tools outright in read-only
 * modes, and `canUseTool` answers every request Claude would prompt for — allowed in `auto`,
 * asked through the run's question in `ask`, refused in the read-only modes. Onesist's own MCP
 * tools are read-only by design and are always allowed.
 */
import path from "node:path";
import type { CanUseTool, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { awaitQuestion } from "~/server/agent/run-registry";
import type { PermissionMode, ThreadMode } from "~/server/agent/types";
import { isInside } from "~/server/agent/workspace/location";
import { readAllowedCommands, shellCommandAllowed } from "~/server/agent/execute-policy";

export type ClaudePolicy = "ask" | "auto" | "readonly" | "no-shell" | "execute";

export const READ_ONLY_TOOLS: readonly string[] = ["Read", "Glob", "Grep", "LS"];
const SHELL_TOOLS: readonly string[] = ["Bash", "BashOutput", "KillShell"];
const WRITE_TOOLS: readonly string[] = ["Edit", "MultiEdit", "Write", "NotebookEdit"];
export const WRITE_AND_SHELL_TOOLS: readonly string[] = [...SHELL_TOOLS, ...WRITE_TOOLS];
export const CLAUDE_APPROVAL_OPTIONS = ["Izinkan sekali", "Selalu izinkan", "Tolak"] as const;

export function claudePolicy(mode: PermissionMode, threadMode: ThreadMode): ClaudePolicy {
  if (threadMode !== "agent" || mode === "readonly") return "readonly";
  if (mode === "no-shell") return "no-shell";
  if (mode === "auto") return "auto";
  if (mode === "execute") return "execute";
  return "ask";
}

export function disallowedToolsFor(policy: ClaudePolicy): string[] {
  if (policy === "readonly") return [...WRITE_AND_SHELL_TOOLS];
  if (policy === "no-shell") return [...SHELL_TOOLS];
  return [];
}

function question(toolName: string, input: Record<string, unknown>): string {
  if (SHELL_TOOLS.includes(toolName) && typeof input.command === "string") return `Claude Code meminta izin menjalankan perintah: ${input.command}`;
  const file = input.file_path ?? input.notebook_path ?? input.path;
  if (WRITE_TOOLS.includes(toolName) && typeof file === "string") return `Claude Code meminta izin mengubah berkas: ${file}`;
  return `Claude Code meminta izin memakai ${toolName}.`;
}

const allow = (input: Record<string, unknown>): PermissionResult => ({ behavior: "allow", updatedInput: input });
const deny = (message: string): PermissionResult => ({ behavior: "deny", message });

/** The file a write tool targets, when it names one. */
function targetOf(input: Record<string, unknown>): string | null {
  const file = input.file_path ?? input.notebook_path ?? input.path;
  return typeof file === "string" && file !== "" ? file : null;
}

export function makeCanUseTool(opts: { runId: string; policy: ClaudePolicy; cwd?: string; ask?: typeof awaitQuestion }): CanUseTool {
  const ask = opts.ask ?? awaitQuestion;
  return async (toolName, input, options) => {
    if (toolName.startsWith("mcp__onesist__")) return allow(input);
    if (options.signal.aborted) return deny("Dihentikan.");
    if (opts.policy === "auto") return allow(input);
    if (opts.policy === "execute") {
      if (READ_ONLY_TOOLS.includes(toolName)) return allow(input);
      // Writes inside the run folder need no question; everything else falls through to the question.
      const file = targetOf(input);
      if (WRITE_TOOLS.includes(toolName) && file && opts.cwd && isInside(path.resolve(opts.cwd, file), opts.cwd)) return allow(input);
      // A shell command is allowed only when the run's rules name it (checks, read-only git).
      if (toolName === "Bash" && opts.cwd && typeof input.command === "string" && shellCommandAllowed(input.command, readAllowedCommands(opts.cwd))) {
        return allow(input);
      }
    }
    if (opts.policy === "readonly") return READ_ONLY_TOOLS.includes(toolName) ? allow(input) : deny("Mode hanya-baca: tindakan ini tidak diizinkan.");
    if (opts.policy === "no-shell" && SHELL_TOOLS.includes(toolName)) return deny("Perintah shell tidak diizinkan di mode ini.");
    const answers = await ask(opts.runId, [{ question: question(toolName, input), options: [...CLAUDE_APPROVAL_OPTIONS] }]);
    const answer = answers?.[0];
    if (answer === CLAUDE_APPROVAL_OPTIONS[0]) return allow(input);
    // "Always" lasts for this session only: the SDK's suggestions may target project settings,
    // which would write a rule into the user's workspace.
    if (answer === CLAUDE_APPROVAL_OPTIONS[1]) {
      const updatedPermissions = (options.suggestions ?? []).map((s) => ({ ...s, destination: "session" as const }));
      return { behavior: "allow", updatedInput: input, updatedPermissions };
    }
    return deny("Ditolak oleh pengguna.");
  };
}
