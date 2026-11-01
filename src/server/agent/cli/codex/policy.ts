/**
 * Onesist's permission modes in Codex's terms (approval policy and sandbox), and the answers
 * to Codex's approval requests. `ask` lets Codex request approval for an action outside the
 * sandbox; `auto` (YOLO) never asks AND lifts Codex's sandbox entirely (`danger-full-access`),
 * so writes and shell commands reach anywhere the process reaches; read-only modes never write.
 */
import type { PermissionMode, ThreadMode } from "~/server/agent/types";

export const APPROVAL_OPTIONS = ["Izinkan sekali", "Selalu izinkan", "Tolak"] as const;

export type CodexSandbox = "read-only" | "workspace-write" | "danger-full-access";

export function codexPolicy(
  mode: PermissionMode,
  threadMode: ThreadMode,
): { approvalPolicy: "on-request" | "never"; sandbox: CodexSandbox; ask: boolean } {
  if (threadMode !== "agent" || mode === "readonly" || mode === "no-shell") return { approvalPolicy: "never", sandbox: "read-only", ask: false };
  if (mode === "auto") return { approvalPolicy: "never", sandbox: "danger-full-access", ask: false };
  return { approvalPolicy: "on-request", sandbox: "workspace-write", ask: true };
}

export function decisionFor(answer: string | null, kind: "command" | "file"): "accept" | "acceptForSession" | "decline" {
  void kind; // both approval kinds take the same three decisions
  if (answer === APPROVAL_OPTIONS[0]) return "accept";
  if (answer === APPROVAL_OPTIONS[1]) return "acceptForSession";
  return "decline";
}
