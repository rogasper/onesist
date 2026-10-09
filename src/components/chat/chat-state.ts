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

/**
 * Whether a finished run should hold the queue.
 *
 * A Stop or a failure holds it, so the next queued message does not go out right
 * after the user interrupted. "Jalankan sekarang" stops on purpose to send the
 * promoted message next, so it does not hold the queue.
 */
export function shouldPauseQueue(end: { isAbort: boolean; isError: boolean }, runNow: boolean): boolean {
  return (end.isAbort || end.isError) && !runNow;
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
}

export function chatActivity(input: { streaming: boolean; watching: boolean }): ChatActivity {
  const runningElsewhere = input.watching && !input.streaming;
  const busy = input.streaming || runningElsewhere;
  return {
    runningElsewhere,
    busy,
    liveEvents: busy,
    approvalsOn: busy,
  };
}

/** The send timer of the queue head, if one is pending. */
export interface ScheduledSend {
  id: string;
  timer: ReturnType<typeof setTimeout>;
}

export type QueueStep =
  /** Nothing can be sent now: cancel any pending timer. */
  | { kind: "idle" }
  /** A send for this head is already scheduled. Keep it; do not restart its delay. */
  | { kind: "keep" }
  /** The head was sent and its turn has not started yet, within the grace period. */
  | { kind: "wait" }
  /** The head failed to start too many times: stop and let the user retry. */
  | { kind: "stuck" }
  /** Schedule a send for the head. `retry` means it was sent before and did not start. */
  | { kind: "schedule"; retry: boolean };

export interface QueueStepInput {
  headId: string | null;
  /** Busy, no provider, paused, or the head is stuck. */
  blocked: boolean;
  scheduledId: string | null;
  inFlightId: string | null;
  inFlightAt: number;
  now: number;
  tries: number;
  graceMs: number;
  maxTries: number;
}

/**
 * Decides what the queue does on this tick.
 *
 * The timer is only restarted for a different head. Re-running the decision on
 * an unrelated change (the 500 ms tick, for one) must return `keep`, not restart
 * the delay: restarting it on every tick meant a queued message was never sent.
 */
export function planQueueStep(input: QueueStepInput): QueueStep {
  if (!input.headId || input.blocked) return { kind: "idle" };
  if (input.scheduledId === input.headId) return { kind: "keep" };
  if (input.inFlightId === input.headId) {
    if (input.now - input.inFlightAt < input.graceMs) return { kind: "wait" };
    if (input.tries + 1 >= input.maxTries) return { kind: "stuck" };
    return { kind: "schedule", retry: true };
  }
  return { kind: "schedule", retry: false };
}
