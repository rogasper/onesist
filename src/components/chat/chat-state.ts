/**
 * Pure decisions behind the chat queue, steering and run-watching.
 *
 * Kept free of React so the rules that caused past bugs (a steer sent twice, a
 * send timer reset on every tick, an approval that could not be answered) can be
 * checked directly. `ChatSurface` only applies what these functions decide.
 */

/** A message the user handed to the running turn ("Arahkan"). */
export interface SteerItem {
  id: string;
  text: string;
  /** The server confirmed the model took it (`chat:steer`). */
  taken?: boolean;
}

/** Marks the steers the server reported as taken. */
export function markTaken(items: SteerItem[], takenIds: readonly string[]): SteerItem[] {
  return items.map((m) => (takenIds.includes(m.id) ? { ...m, taken: true } : m));
}

export interface SteerSettlement {
  /** A steer the run confirmed is missing from this read: the read is older than
   *  the run's last write. Nothing is settled; the next read will settle it. */
  wait: boolean;
  /** Texts that were never taken and go back to the front of the queue. */
  restore: string[];
  /** The local steer list can be dropped: every entry is either stored or restored. */
  clear: boolean;
  /** Every streamed message is in the stored read, so the live transcript may be
   *  replaced by the stored one. */
  syncTranscript: boolean;
}

/**
 * Settles the steers once the stored transcript has been re-read after a run.
 *
 * The database decides: a steer counts as taken when it is stored. A steer the
 * server confirmed (`taken`) is never sent again, even if this read is older
 * than the run's last write, because re-sending it would duplicate the message.
 */
export function settleSteers(items: SteerItem[], storedIds: ReadonlySet<string>, transcriptIds: readonly string[]): SteerSettlement {
  if (items.some((m) => m.taken && !storedIds.has(m.id))) {
    return { wait: true, restore: [], clear: false, syncTranscript: false };
  }
  return {
    wait: false,
    restore: items.filter((m) => !m.taken && !storedIds.has(m.id)).map((m) => m.text),
    clear: items.length > 0,
    syncTranscript: !transcriptIds.some((id) => !storedIds.has(id)),
  };
}

export interface ChatActivity {
  /** A run on this thread is going, but this client is not streaming it. */
  runningElsewhere: boolean;
  /** Queued messages must wait: streaming, or a run started elsewhere. */
  busy: boolean;
  /** Subscribe to live thread events (`chat:run`, `chat:steer`). */
  liveEvents: boolean;
  /** Load pending approvals. A run started elsewhere can be parked on one, and the
   *  card must stay answerable here, or that run waits forever. */
  approvalsOn: boolean;
  /** Hentikan is offered whenever a run is known, started here or elsewhere. */
  stoppable: boolean;
}

export function chatActivity(input: { streaming: boolean; watching: boolean }): ChatActivity {
  const runningElsewhere = input.watching && !input.streaming;
  const busy = input.streaming || runningElsewhere;
  return {
    runningElsewhere,
    busy,
    liveEvents: busy,
    approvalsOn: busy,
    stoppable: busy,
  };
}

/** Shortest gap between two renders of the streamed transcript (ms). Chunks that arrive
 *  closer together are merged, so a fast stream does not re-render the whole chat per chunk. */
export const CHAT_STREAM_THROTTLE_MS = 50;

/** Shown when a send, retry or edit must wait for the run that is still going. */
export const RUN_STILL_GOING = "Masih ada run yang berjalan. Tunggu sampai selesai, atau tekan Hentikan.";

/**
 * What to do when this client's stream ended. An error while the server still runs
 * a turn is followed, not shown as a failure: the run keeps going on the server, and
 * a dropped connection no longer stops it.
 */
export function afterStreamEnded(input: { errored: boolean; serverRunning: boolean }): "follow" | "show-error" | "idle" {
  if (!input.errored) return "idle";
  return input.serverRunning ? "follow" : "show-error";
}

/** The reason a retry or edit cannot go yet, or null when it can. */
export function resendBlock(input: { busy: boolean; serverRunning: boolean }): string | null {
  return input.busy || input.serverRunning ? RUN_STILL_GOING : null;
}

/**
 * What the status line says while the provider refuses a request and the SDK retries
 * it. Null when no retry is running (`attempt` 0 ends it). The next attempt is the one
 * after the last refused answer.
 */
export function providerRetryLabel(info: { status: number; attempt: number } | null): string | null {
  if (!info || info.attempt <= 0) return null;
  const reason = info.status === 429 ? "penyedia membatasi permintaan (429)" : `penyedia gagal merespons (${info.status})`;
  return `${reason}, percobaan ke ${info.attempt + 1}`;
}

/** The badges a thread shows in the list: a run going, and what it waits for (M5 item 23). */
export function threadBadges(activity: { running: boolean; pendingApprovals: number; pendingQuestions: number } | undefined): { tone: "run" | "wait"; label: string }[] {
  if (!activity) return [];
  const badges: { tone: "run" | "wait"; label: string }[] = [];
  if (activity.running) badges.push({ tone: "run", label: "Berjalan" });
  const waiting = activity.pendingApprovals + activity.pendingQuestions;
  if (waiting > 0) badges.push({ tone: "wait", label: waiting === 1 ? "Menunggu 1 jawaban" : `Menunggu ${waiting} jawaban` });
  return badges;
}

/**
 * True when a loaded thread detail belongs to the thread the panel has selected. A detail of the
 * previous selection must not be rendered: its composer would send to that thread.
 */
export function isDetailFor(detail: { thread: { id: string } } | null, activeId: string | null): boolean {
  return !!detail && !!activeId && detail.thread.id === activeId;
}

/**
 * What the chat reports to the server log when a stream fails: the message, the stack when there
 * is one, and which thread and run were involved. The stack is what a React error needs to be
 * traced, and the server log otherwise has only the message.
 */
export function chatErrorReport(
  error: Error,
  where: { threadId: string; runId: string | null; streaming: boolean },
): { where: string; message: string; stack: string; context: string } {
  return {
    where: "chat-stream",
    message: String(error.message ?? ""),
    stack: typeof error.stack === "string" ? error.stack : "",
    context: `thread=${where.threadId} run=${where.runId ?? "-"} streaming=${where.streaming}`,
  };
}

/**
 * The report for an error that a React render threw: the error's own stack, then the
 * component stack React attaches (it is not on the error). Cut to the server's limits
 * (`/api/system/client-error`: stack 1500, context 200), so the log line stays readable.
 */
export function renderErrorReport(error: unknown, componentStack: string, context: string): { where: "chat-render"; message: string; stack: string; context: string } {
  const isError = error instanceof Error;
  const message = isError ? String(error.message ?? "") : String(error ?? "");
  const own = isError && typeof error.stack === "string" ? error.stack : "";
  const stack = componentStack.trim() ? `${own}\ncomponent stack:\n${componentStack.trim()}` : own;
  return { where: "chat-render", message, stack: stack.slice(0, 1500), context: context.slice(0, 200) };
}
