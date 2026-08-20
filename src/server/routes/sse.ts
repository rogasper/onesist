import { json } from "../http/response";
import { Router } from "../http/router";

export const router = new Router();

// /api/events/ticket
router.post("events/ticket", async () => {
  const { eventBus } = await import("../realtime/events");
  return json({ ticket: eventBus.createTicket() });
});

// Cap concurrent SSE streams so a leaky client (e.g. WKWebView silently
// reconnecting on every hide) can't accumulate unbounded eventBus listeners +
// keepAlive intervals per connection. Each stream registers 7 listeners.
let activeStreams = 0;
const MAX_STREAMS = 24;

// /api/events — SSE stream
router.get("events", async (ctx) => {
  const { eventBus } = await import("../realtime/events");
  const ticket = ctx.query.get("ticket");
  if (!ticket || !eventBus.validateTicket(ticket)) {
    return json({ error: "Invalid or expired ticket" }, 401);
  }
  if (activeStreams >= MAX_STREAMS) {
    return json({ error: "Too many event streams" }, 429);
  }
  activeStreams += 1;
  let isCleanedUp = false;
  let cleanup: (() => void) | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        if (isCleanedUp) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup?.();
        }
      };
      const handlers: Record<string, (...args: any[]) => void> = {};
      for (const event of ["file:changed", "agent:log", "agent:status", "agent:done", "agent:error", "task:status", "fsd:conversion"]) {
        const handler = (payload: any) => send(event, payload);
        eventBus.on(event, handler);
        handlers[event] = handler;
      }
      send("connected", { message: "SSE connected" });
      const keepAlive = setInterval(() => send("keepalive", { ts: Date.now() }), 15000);
      cleanup = () => {
        if (isCleanedUp) return;
        isCleanedUp = true;
        for (const [event, handler] of Object.entries(handlers)) eventBus.off(event, handler);
        clearInterval(keepAlive);
        activeStreams = Math.max(0, activeStreams - 1);
        try { controller.close(); } catch {}
      };
      ctx.request.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
});
