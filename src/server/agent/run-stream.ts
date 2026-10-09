/**
 * Live output of each active run, kept in memory so a client that comes back
 * (reload, thread switch, network blip) gets everything produced so far and then
 * the rest of the run, instead of waiting for the saved transcript.
 *
 * Memory is bounded by the run: a hub exists from the first chunk until the run's
 * stream closes, and is dropped then. The database stays the record; this is only
 * the live tail.
 */

const END = Symbol("end");
type Listener = (chunk: unknown | typeof END) => void;
interface Hub {
  chunks: unknown[];
  listeners: Set<Listener>;
  closed: boolean;
}

const HUBS = new Map<string, Hub>();

export function openRunStream(runId: string): void {
  HUBS.set(runId, { chunks: [], listeners: new Set(), closed: false });
}

/** Records one chunk and hands it to everyone currently attached. */
export function pushRunChunk(runId: string, chunk: unknown): void {
  const hub = HUBS.get(runId);
  if (!hub || hub.closed) return;
  hub.chunks.push(chunk);
  for (const listener of hub.listeners) listener(chunk);
}

export function closeRunStream(runId: string): void {
  const hub = HUBS.get(runId);
  if (!hub) return;
  hub.closed = true;
  for (const listener of hub.listeners) listener(END);
  hub.listeners.clear();
  HUBS.delete(runId);
}

/**
 * A stream that replays every chunk so far and then follows the run until it
 * closes. Null when the run has no live output (finished, or never started).
 * Replay and attach happen in one synchronous step, so no chunk is missed or
 * duplicated between them.
 */
export function subscribeRunStream(runId: string): ReadableStream<unknown> | null {
  const hub = HUBS.get(runId);
  if (!hub || hub.closed) return null;
  let listener: Listener | null = null;
  return new ReadableStream<unknown>({
    start(controller) {
      for (const chunk of hub.chunks) controller.enqueue(chunk);
      listener = (chunk) => {
        if (chunk === END) {
          hub.listeners.delete(listener!);
          try {
            controller.close();
          } catch {
            /* already closed by the client */
          }
          return;
        }
        try {
          controller.enqueue(chunk);
        } catch {
          /* the client went away; the hub drops this listener on cancel */
        }
      };
      hub.listeners.add(listener);
    },
    cancel() {
      if (listener) hub.listeners.delete(listener);
    },
  });
}

/** Test and diagnostics helper. */
export function hasRunStream(runId: string): boolean {
  return HUBS.has(runId);
}
