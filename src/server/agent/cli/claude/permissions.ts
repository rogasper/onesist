/**
 * Onesist's permission modes for Claude Code. The SDK's own mode stays `default`; Onesist's
 * policy lives here: `disallowedTools` blocks write and shell tools outright in read-only
 * modes, and `canUseTool` answers every request Claude would prompt for — allowed in `auto`,
 * asked through the run's question in `ask`, refused in the read-only modes. Onesist's own MCP
 * tools are read-only by design and are always allowed.
 */
import type { CanUseTool, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { awaitQuestion } from "~/server/agent/run-registry";
import type { PermissionMode, ThreadMode } from "~/server/agent/types";

export type ClaudePolicy = "ask" | "auto" | "readonly" | "no-shell";

export const READ_ONLY_TOOLS: readonly string[] = ["Read", "Glob", "Grep", "LS"];
const SHELL_TOOLS: readonly string[] = ["Bash", "BashOutput", "KillShell"];
const WRITE_TOOLS: readonly string[] = ["Edit", "MultiEdit", "Write", "NotebookEdit"];
export const WRITE_AND_SHELL_TOOLS: readonly string[] = [...SHELL_TOOLS, ...WRITE_TOOLS];
export const CLAUDE_APPROVAL_OPTIONS = ["Izinkan sekali", "Selalu izinkan", "Tolak"] as const;

export function claudePolicy(mode: PermissionMode, threadMode: ThreadMode): ClaudePolicy {
  if (threadMode !== "agent" || mode === "readonly") return "readonly";
  if (mode === "no-shell") return "no-shell";
  if (mode === "auto") return "auto";
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

export function makeCanUseTool(opts: { runId: string; policy: ClaudePolicy; ask?: typeof awaitQuestion }): CanUseTool {
  const ask = opts.ask ?? awaitQuestion;
  return async (toolName, input, options) => {
    if (toolName.startsWith("mcp__onesist__")) return allow(input);
    if (options.signal.aborted) return deny("Dihentikan.");
    if (opts.policy === "auto") return allow(input);
    if (opts.policy === "readonly") return READ_ONLY_TOOLS.includes(toolName) ? allow(input) : deny("Mode hanya-baca: tindakan ini tidak diizinkan.");
    if (opts.policy === "no-shell" && SHELL_TOOLS.includes(toolName)) return deny("Perintah shell tidak diizinkan di mode ini.");
    const answers = await ask(opts.runId, [{ question: question(toolName, input), options: [...CLAUDE_APPROVAL_OPTIONS] }]);
    const answer = answers?.[0];
    if (answer === CLAUDE_APPROVAL_OPTIONS[0]) return allow(input);
    if (answer === CLAUDE_APPROVAL_OPTIONS[1]) return { behavior: "allow", updatedInput: input, updatedPermissions: options.suggestions ?? [] };
    return deny("Ditolak oleh pengguna.");
  };
}
