/**
 * Fase 4C: a project's setup command for new worktrees. Filled in by the next task.
 */
import type { WorkspaceSetupView } from "~/lib/workspace-view";

export function setupCommandFor(_projectRoot: string, _repoId: string): string | null {
  return null;
}

export function setupState(_threadId: string): WorkspaceSetupView | null {
  return null;
}

export async function startWorktreeSetup(input: { threadId: string; cwd: string; command: string; timeoutMs?: number }): Promise<WorkspaceSetupView> {
  return { state: "failed", command: input.command, exitCode: null, tail: "" };
}
