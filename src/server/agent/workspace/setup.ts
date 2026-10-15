/**
 * Fase 4C: a project's setup command runs in each new worktree (install dependencies and
 * the like). It is configured per repo in `<project>/.agents/onesist-worktree.json`:
 *
 *   { "setup": { "input/code/api": "bun install" } }
 *
 * It runs in the background. The result becomes a notice in the thread, and a
 * `chat:workspace` event goes out when it starts and when it ends. The command is the
 * user's own, written in their project; it never comes from the model.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { WorkspaceSetupView } from "~/lib/workspace-view";
import { appendMessage } from "~/server/agent/store";
import { eventBus } from "~/server/realtime/events";

export const SETUP_CONFIG = path.join(".agents", "onesist-worktree.json");
export const SETUP_TAIL_CHARS = 4000;
export const SETUP_TIMEOUT_MS = 10 * 60_000;

/** The last state per thread, for the workspace strip. Survives hot reloads, not restarts. */
const states: Map<string, WorkspaceSetupView> = ((globalThis as any).__onesistWorktreeSetup ??= new Map());

export function setupCommandFor(projectRoot: string, repoId: string): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(projectRoot, SETUP_CONFIG), "utf-8"));
    const command = parsed?.setup?.[repoId];
    return typeof command === "string" && command.trim() ? command.trim() : null;
  } catch {
    return null;
  }
}

export function setupState(threadId: string): WorkspaceSetupView | null {
  return states.get(threadId) ?? null;
}

export function shellFor(command: string, platform: NodeJS.Platform = process.platform): [string, string[]] {
  return platform === "win32" ? ["cmd.exe", ["/d", "/s", "/c", command]] : ["/bin/sh", ["-c", command]];
}

export function startWorktreeSetup(input: { threadId: string; cwd: string; command: string; timeoutMs?: number }): Promise<WorkspaceSetupView> {
  states.set(input.threadId, { state: "running", command: input.command, exitCode: null, tail: "" });
  eventBus.emitChatWorkspace({ threadId: input.threadId });

  return new Promise((resolve) => {
    let output = "";
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const keep = (chunk: Buffer | string) => {
      output = (output + chunk.toString()).slice(-SETUP_TAIL_CHARS);
    };
    const finish = (exitCode: number | null, extra = "") => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      const done: WorkspaceSetupView = {
        state: exitCode === 0 ? "ok" : "failed",
        command: input.command,
        exitCode,
        tail: (output + extra).slice(-SETUP_TAIL_CHARS),
      };
      states.set(input.threadId, done);
      try {
        appendMessage({
          threadId: input.threadId,
          role: "system",
          kind: "workspaceSetupNotice",
          parts: [{ type: "data-notice", data: { kind: "workspaceSetup", ok: done.state === "ok", exitCode, command: input.command, tail: done.tail } }],
        });
      } catch (err) {
        // The thread may have been deleted while the setup ran.
        console.error("[worktree-setup] could not record the result:", err);
      }
      eventBus.emitChatWorkspace({ threadId: input.threadId });
      resolve(done);
    };

    const [bin, args] = shellFor(input.command);
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(bin, args, { cwd: input.cwd, windowsHide: true, env: process.env });
    } catch (err) {
      finish(null, `\n${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    timer = setTimeout(() => {
      child.kill();
      finish(null, "\n(setup dihentikan: melewati batas waktu)");
    }, input.timeoutMs ?? SETUP_TIMEOUT_MS);
    child.stdout?.on("data", keep);
    child.stderr?.on("data", keep);
    child.on("error", (err) => finish(null, `\n${err.message}`));
    child.on("close", (code) => finish(code ?? null));
  });
}
