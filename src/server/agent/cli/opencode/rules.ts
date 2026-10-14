/**
 * Onesist's permission modes expressed as OpenCode 2 session rules, and the
 * decisions for OpenCode's permission requests.
 *
 * The last matching rule wins. Shell and read are never denied: OpenCode's free tier
 * refuses sessions whose rules deny them (t3code), so a mode that forbids shell asks
 * and the adapter refuses the request itself (`autoDecision`).
 */
import type { PermissionMode, ThreadMode } from "~/server/agent/types";

export type OcEffect = "allow" | "deny" | "ask";
export interface OcRule {
  action: string;
  resource: string;
  effect: OcEffect;
}
export type OcDecision = "once" | "always" | "reject";

export const PERMISSION_OPTIONS = ["Izinkan sekali", "Selalu izinkan", "Tolak"] as const;

const rule = (action: string, effect: OcEffect): OcRule => ({ action, resource: "*", effect });

function readOnly(mode: PermissionMode, threadMode: ThreadMode): boolean {
  return mode === "readonly" || threadMode !== "agent";
}

export function permissionRules(mode: PermissionMode, threadMode: ThreadMode): OcRule[] {
  const ro = readOnly(mode, threadMode);
  if (mode === "auto" && !ro) return [rule("*", "allow")];
  return [rule("shell", "ask"), rule("edit", ro ? "deny" : "ask"), rule("external_directory", "ask")];
}

/** A decision taken without asking the user, or `null` when the user decides. */
export function autoDecision(mode: PermissionMode, threadMode: ThreadMode, action: string): OcDecision | null {
  if (action === "shell" && (mode === "no-shell" || readOnly(mode, threadMode))) return "reject";
  if (mode === "auto" && threadMode === "agent") return "once";
  return null;
}

export function decisionFromAnswer(answer: string | null): OcDecision {
  if (answer === PERMISSION_OPTIONS[0]) return "once";
  if (answer === PERMISSION_OPTIONS[1]) return "always";
  return "reject";
}

const ACTION_LABELS: Record<string, string> = {
  shell: "menjalankan perintah",
  edit: "mengubah berkas",
  external_directory: "mengakses folder di luar project",
};

export function permissionQuestion(action: string, resources: string[]): string {
  const what = ACTION_LABELS[action] ?? `melakukan "${action}"`;
  const list = resources.slice(0, 3).join(", ");
  return `OpenCode meminta izin ${what}${list ? `: ${list}` : ""}.`;
}
