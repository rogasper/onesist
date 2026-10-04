/**
 * Native-notification decisions for chat runs (Fase 5.6, FR-B16).
 *
 * Everything here is pure on purpose: what to say, whether to say it, and how
 * two events for the same run are deduplicated. The IO (SSE subscription,
 * Tauri plugin call, permission prompt) lives in `use-run-notifications.ts`,
 * so the rules that decide whether a user gets interrupted stay testable
 * without a desktop shell.
 *
 * Two triggers, and only these two (ROADMAP 5.6):
 *   1. a run reaches a terminal status while the window is not focused
 *   2. a run parks waiting for the user's approval
 */

export type RunTerminalStatus = "done" | "error" | "stopped" | "interrupted";

export interface ChatRunEvent {
  runId: string;
  threadId: string;
  projectId: string;
  status: RunTerminalStatus;
  error?: string | null;
  projectName?: string | null;
  threadTitle?: string | null;
}

export interface ChatApprovalEvent {
  runId: string;
  threadId: string;
  projectId: string;
  toolCallId: string;
  name: string;
  preview: string;
  projectName?: string | null;
  threadTitle?: string | null;
}

export interface RunNotification {
  /** Dedupe key: one run may finish only once, but the SSE stream can be
   *  reconnected and the approval event can be re-delivered. */
  key: string;
  title: string;
  body: string;
}

/** Longest single-line excerpt put into a notification body. Previews and
 *  provider errors can run to thousands of characters; a notification is a
 *  glance, not a transcript. */
export const NOTIFICATION_EXCERPT_CHARS = 140;

function excerpt(text: string, max = NOTIFICATION_EXCERPT_CHARS): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** Which conversation this is about. The user may have several projects open
 *  in a day and one of them finished — a body that says only "Agent selesai"
 *  forces them to open the window to find out whether it mattered. */
function whereLabel(event: { projectName?: string | null; threadTitle?: string | null }): string {
  const parts = [event.projectName?.trim(), event.threadTitle?.trim()].filter(Boolean) as string[];
  return parts.length ? parts.join(" — ") : "Onesist";
}

const RUN_TITLES: Record<RunTerminalStatus, string> = {
  done: "Agent selesai",
  error: "Agent berhenti karena error",
  stopped: "Agent dihentikan",
  interrupted: "Run terputus",
};

export function runNotificationFor(event: ChatRunEvent): RunNotification {
  const lines = [whereLabel(event)];
  if (event.error?.trim()) lines.push(excerpt(event.error));
  return {
    key: `run:${event.runId}:${event.status}`,
    title: RUN_TITLES[event.status] ?? "Agent berhenti",
    body: lines.join("\n"),
  };
}

export function approvalNotificationFor(event: ChatApprovalEvent): RunNotification {
  const detail = `${event.name}${event.preview?.trim() ? `: ${excerpt(event.preview)}` : ""}`;
  return {
    key: `approval:${event.runId}:${event.toolCallId}`,
    title: "Agent menunggu izin",
    body: `${whereLabel(event)}\n${detail}`,
  };
}

/**
 * Whether this event should interrupt the user at all.
 *
 * Focus is the whole gate: a focused window already shows the result in the
 * transcript, and interrupting there is noise. In a web build there is no
 * notification channel, so the whole path is inert (same gate the update
 * banner uses).
 */
export function shouldNotify(input: { focused: boolean; isDesktopShell: boolean; alreadySeen: boolean }): boolean {
  if (!input.isDesktopShell) return false;
  if (input.focused) return false;
  return !input.alreadySeen;
}

/** True only inside the Tauri shell; false in every browser/web build. */
export function isDesktopShell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
