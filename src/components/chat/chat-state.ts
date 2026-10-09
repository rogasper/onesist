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
