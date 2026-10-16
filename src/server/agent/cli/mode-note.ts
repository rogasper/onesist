/**
 * What a CLI agent is told when its thread's mode refuses shell commands. The refusal itself is
 * `autoDecision` in opencode/rules.ts; this note only tells the agent up front, so it does not try
 * shell again and again. It goes in front of the prompt the runtime receives, never in the stored
 * transcript, so the user's own message stays as they wrote it.
 */
import { autoDecision } from "./opencode/rules";
import type { PermissionMode, ThreadMode } from "~/server/agent/types";

const READ_ONLY =
  "Mode ini hanya membaca: perintah shell dan perubahan berkas tidak tersedia. Jawab dari berkas yang bisa dibaca. Kalau perlu perintah shell atau perubahan, sebutkan perintahnya dan biarkan pengguna menjalankannya sendiri, atau minta pengguna pindah ke mode Kerjakan.";
const NO_SHELL = "Perintah shell tidak tersedia di mode ini. Jangan mencoba menjalankan perintah shell.";

/** The note for a mode that refuses shell, or null when the mode allows it. */
export function modeNote(mode: PermissionMode, threadMode: ThreadMode): string | null {
  if (autoDecision(mode, threadMode, "shell") !== "reject") return null;
  return mode === "no-shell" ? NO_SHELL : READ_ONLY;
}

export function withModeNote(text: string, note: string | null): string {
  return note ? `${note}\n\n${text}` : text;
}
