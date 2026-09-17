/**
 * Stream heartbeats (FR-B13, FR-B15).
 *
 * Why this exists — measured 2026-09-17: the HTTP server is a Bun.serve with the
 * default `idleTimeout` (10 s), and it closes a connection that has carried no
 * bytes for that long **even while a response is still being streamed**. Two
 * visible consequences, both reported by the user as "errors with no log":
 *
 *  1. A chat turn whose model goes quiet for more than ~10 s (a thinking model
 *     before its first token, or between a tool result and the next step) lost
 *     its connection: the panel showed "Load failed", the run was recorded
 *     `stopped — Koneksi klien terputus`. Measured: an SSE connection with a 15 s
 *     keepalive died after **12 s**, i.e. before its own first keepalive.
 *  2. Every SSE stream died every ~10 s and the browser silently reconnected —
 *     so `file:changed` events emitted in the gap were simply lost.
 *
 * The fix keeps bytes flowing below that window: this wrapper injects an SSE
 * comment (`: ping`) into a response stream that would otherwise be silent.
 * Comments are valid SSE and are ignored by every parser, so the payload is
 * untouched.
 */

/** Interval must stay comfortably below Bun's 10 s idle timeout. */
export const HEARTBEAT_MS = 4000;

const PING = new TextEncoder().encode(": ping\n\n");

export function withStreamHeartbeat(body: ReadableStream<Uint8Array>, everyMs = HEARTBEAT_MS): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastWrite = Date.now();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const pump = async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              lastWrite = Date.now();
              controller.enqueue(value);
            }
          }
          if (timer) clearInterval(timer);
          timer = null;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        } catch (err) {
          if (timer) clearInterval(timer);
          timer = null;
          try {
            controller.error(err);
          } catch {
            /* already errored */
          }
        }
      };
      void pump();
      // Only ping when the real stream has actually been quiet — a busy stream
      // needs no help, and extra bytes would only add noise.
      timer = setInterval(() => {
        if (Date.now() - lastWrite < everyMs) return;
        lastWrite = Date.now();
        try {
          controller.enqueue(PING);
        } catch {
          /* consumer went away; the pump's own error path handles it */
        }
      }, everyMs);
    },
    cancel(reason) {
      if (timer) clearInterval(timer);
      timer = null;
      return reader.cancel(reason);
    },
  });
}
