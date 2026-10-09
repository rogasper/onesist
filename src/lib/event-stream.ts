/**
 * One server-sent event stream per browser tab, shared by every hook that listens.
 *
 * Several mounted components used to open their own `EventSource`. A project page with the
 * chat open held five to eight streams, and browsers allow only about six connections per
 * origin, so ordinary requests queued behind them and pages stayed on "Loading…". Now the
 * first subscriber opens the stream and the last one closes it.
 *
 * Reconnects never reuse a ticket: the browser's own retry would send the old one again, and
 * tickets expire, so every reconnect asks for a fresh ticket after a short backoff. After
 * `MAX_RETRIES` failures the stream is given up; listeners hear "lost" and may fall back.
 */

/** Gets the inner `data`, and the whole envelope (with `timestamp`) as the second argument. */
export type EventHandler = (data: any, envelope?: any) => void;
export type StreamStatus = "open" | "lost";

/** Reconnects allowed before giving up (AGENTS.md: close after a handful of errors). */
export const MAX_RETRIES = 5;
const RETRY_MS = 1500;

/** Backoff before the next attempt, or null when the stream should be given up. */
export function retryDelayMs(attempt: number): number | null {
  if (attempt < 1 || attempt > MAX_RETRIES) return null;
  return RETRY_MS * Math.min(attempt, 4);
}

/** Subscriptions per event name, with the transitions the stream needs to know about. */
export function createRegistry() {
  const handlers = new Map<string, Set<EventHandler>>();
  let total = 0;
  return {
    /** Adds a handler. `newName` is true when this is the first handler for the name. */
    add(name: string, handler: EventHandler): { newName: boolean; firstOverall: boolean } {
      const set = handlers.get(name) ?? new Set<EventHandler>();
      const newName = set.size === 0;
      const before = total;
      if (!set.has(handler)) {
        set.add(handler);
        total += 1;
      }
      handlers.set(name, set);
      return { newName, firstOverall: before === 0 && total > 0 };
    },
    /** Removes a handler. `lastOverall` is true when no handler is left at all. */
    remove(name: string, handler: EventHandler): { lastOverall: boolean } {
      const set = handlers.get(name);
      if (set?.delete(handler)) total -= 1;
      if (set && set.size === 0) handlers.delete(name);
      return { lastOverall: total === 0 };
    },
    dispatch(name: string, data: unknown, envelope?: unknown): void {
      for (const handler of [...(handlers.get(name) ?? [])]) handler(data, envelope);
    },
    names(): string[] {
      return [...handlers.keys()];
    },
    size(): number {
      return total;
    },
  };
}

/** The envelope the bus sends is `{ type, data, timestamp }`; handlers get the inner `data`. */
function payloadOf(raw: unknown): unknown {
  const envelope = (raw ?? {}) as Record<string, unknown>;
  return envelope.data !== undefined ? envelope.data : envelope;
}

const registry = createRegistry();
const statusListeners = new Set<(status: StreamStatus) => void>();

let source: EventSource | null = null;
/** True while a ticket is being requested or the source is being created. */
let opening = false;
let attempts = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped whenever the current attempt is cancelled, so late callbacks are ignored. */
let generation = 0;

function onEvent(e: Event): void {
  let raw: unknown = {};
  try {
    raw = JSON.parse(String((e as MessageEvent).data ?? "{}"));
  } catch {
    return; // a malformed event must not break the stream for everyone else
  }
  registry.dispatch(e.type, payloadOf(raw), raw);
}

function emitStatus(status: StreamStatus): void {
  for (const listener of statusListeners) listener(status);
}

function cancelRetry(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

/** Closes the stream and cancels anything pending: nobody is listening any more. */
function stopAll(): void {
  cancelRetry();
  generation += 1;
  source?.close();
  source = null;
  opening = false;
  attempts = 0;
}

function failed(gen: number): void {
  if (gen !== generation) return;
  // Close first, so the browser does not retry with the ticket it already used.
  source?.close();
  source = null;
  opening = false;
  attempts += 1;
  const delay = retryDelayMs(attempts);
  if (delay === null) {
    emitStatus("lost");
    return;
  }
  if (registry.size() > 0) {
    cancelRetry();
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void openSource();
    }, delay);
  }
}

async function openSource(): Promise<void> {
  if (opening || registry.size() === 0) return;
  cancelRetry();
  const gen = ++generation;
  opening = true;
  try {
    const res = await fetch("/api/events/ticket", { method: "POST", cache: "no-store" });
    if (!res.ok) throw new Error("ticket request failed");
    const { ticket } = (await res.json()) as { ticket?: string };
    if (!ticket) throw new Error("no ticket");
    if (gen !== generation || registry.size() === 0) {
      opening = false;
      return;
    }
    const es = new EventSource(`/api/events?ticket=${encodeURIComponent(ticket)}`);
    source = es;
    opening = false;
    for (const name of registry.names()) es.addEventListener(name, onEvent);
    es.onopen = () => {
      if (gen !== generation) return;
      attempts = 0;
      emitStatus("open");
    };
    es.onerror = () => failed(gen);
  } catch {
    failed(gen);
  }
}

/** Listens to one event name. Returns the function that stops listening. */
export function subscribe(name: string, handler: EventHandler): () => void {
  const { newName, firstOverall } = registry.add(name, handler);
  if (firstOverall) {
    attempts = 0;
    void openSource();
  } else if (newName && source) {
    source.addEventListener(name, onEvent);
  } else if (!source && !opening && retryTimer === null) {
    // The stream was given up earlier; a new listener brings it back.
    attempts = 0;
    void openSource();
  }
  return () => {
    const { lastOverall } = registry.remove(name, handler);
    if (lastOverall) stopAll();
  };
}

/**
 * Hears when the stream opens (again, after a reconnect, so a listener can replay what it
 * missed) or is given up. Returns the function that stops listening.
 */
export function onStreamStatus(listener: (status: StreamStatus) => void): () => void {
  statusListeners.add(listener);
  return () => {
    statusListeners.delete(listener);
  };
}

// A tab that was hidden may have lost its stream; reconnect when it is visible again.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && !source && !opening && retryTimer === null && registry.size() > 0) {
      attempts = 0;
      void openSource();
    }
  });
}
