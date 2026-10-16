/**
 * One agy turn's command line, and Onesist's permission modes in agy's terms. Headless agy
 * (`-p`) has two settings only: refuse every action that needs permission (the default), or
 * allow all of them (`--dangerously-skip-permissions`). It cannot ask in the middle of a turn
 * (2026-10-16 spike), so "ask" means: refuse, then ask the user, then continue if allowed.
 */
import type { PermissionMode, ThreadMode } from "~/server/agent/types";
import type { AgyDenied } from "./stream-mapper";

/** agy's own default (5m) is shorter than many agent turns. */
export const AGY_PRINT_TIMEOUT = "60m";
/** Windows caps a whole command line at 32,767 characters; this leaves room for the rest. */
export const WINDOWS_ARG_LIMIT = 30_000;

export type AgyPolicy = "skip" | "deny" | "ask";

export function agyPolicy(mode: PermissionMode, threadMode: ThreadMode): AgyPolicy {
  if (threadMode !== "agent" || mode === "readonly" || mode === "no-shell") return "deny";
  if (mode === "auto") return "skip";
  return "ask";
}

export function agyArgs(o: { text: string; sessionId: string | null; model: string | null; skipPermissions: boolean }): string[] {
  // A prompt that starts with "-" could be read as a flag; a leading space changes nothing for the model.
  const prompt = o.text.startsWith("-") ? ` ${o.text}` : o.text;
  const args = ["-p", prompt, "--output-format", "stream-json", "--print-timeout", AGY_PRINT_TIMEOUT];
  if (o.sessionId) args.push("--conversation", o.sessionId);
  if (o.model) args.push("--model", o.model);
  if (o.skipPermissions) args.push("--dangerously-skip-permissions");
  return args;
}

export function promptTooLong(text: string, platform: NodeJS.Platform = process.platform): boolean {
  return platform === "win32" && text.length > WINDOWS_ARG_LIMIT;
}

export const ESCALATE_OPTIONS = ["Izinkan semua & lanjutkan", "Tolak"] as const;

function deniedNames(denied: AgyDenied[]): string {
  return [...new Set(denied.map((d) => String(d.display_name || d.action || "tindakan")))].join(", ");
}

export function deniedQuestion(denied: AgyDenied[]): string {
  return `Antigravity tidak bisa meminta izin di tengah giliran, jadi tindakan ini ditolak: ${deniedNames(denied)}. Izinkan Antigravity menjalankan semua tindakan untuk melanjutkan giliran ini?`;
}

export function continueText(denied: AgyDenied[]): string {
  return `Izin untuk tindakan yang tadi ditolak (${deniedNames(denied)}) sekarang diberikan. Lanjutkan tugas dari pesan sebelumnya.`;
}
