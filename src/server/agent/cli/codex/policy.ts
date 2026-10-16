/**
 * Onesist's permission modes in Codex's terms (approval policy and sandbox), and the answers
 * to Codex's approval requests. `ask` lets Codex request approval for an action outside the
 * sandbox; `auto` never asks, but writes stay inside the workspace; read-only modes never write.
 */
import type { PermissionMode, ThreadMode } from "~/server/agent/types";

export const APPROVAL_OPTIONS = ["Izinkan sekali", "Selalu izinkan", "Tolak"] as const;

export function codexPolicy(mode: PermissionMode, threadMode: ThreadMode): { approvalPolicy: "on-request" | "never"; sandbox: "read-only" | "workspace-write"; ask: boolean } {
  if (threadMode !== "agent" || mode === "readonly" || mode === "no-shell") return { approvalPolicy: "never", sandbox: "read-only", ask: false };
  if (mode === "auto") return { approvalPolicy: "never", sandbox: "workspace-write", ask: false };
  return { approvalPolicy: "on-request", sandbox: "workspace-write", ask: true };
}

export function decisionFor(answer: string | null, kind: "command" | "file"): "accept" | "acceptForSession" | "decline" {
  void kind; // both approval kinds take the same three decisions
  if (answer === APPROVAL_OPTIONS[0]) return "accept";
  if (answer === APPROVAL_OPTIONS[1]) return "acceptForSession";
  return "decline";
}
