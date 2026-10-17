/**
 * Onesist's permission modes in terms of the approval extension. `ask` confirms every write,
 * edit and shell command; `auto` lets them run; the read-only modes block them without a
 * dialog. Pi itself has no permission gate, so the extension is what enforces this.
 */
import type { PermissionMode, ThreadMode } from "~/server/agent/types";

export type PiPolicy = "ask" | "auto" | "readonly";

export function piPolicy(mode: PermissionMode, threadMode: ThreadMode): PiPolicy {
  if (threadMode !== "agent" || mode === "readonly" || mode === "no-shell") return "readonly";
  if (mode === "auto") return "auto";
  return "ask";
}

/** Tools that change the workspace or run commands; the rest only read. */
export const WRITE_TOOLS = ["write", "edit", "bash"] as const;

export function PI_APPROVAL_TITLE(tool: string): string {
  return `Izinkan Pi memakai ${tool}?`;
}
