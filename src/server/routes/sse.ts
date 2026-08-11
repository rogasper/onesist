import { json } from "../http/response";
import { Router } from "../http/router";

export const router = new Router();

// /api/events/ticket
router.post("events/ticket", async () => {
  const { eventBus } = await import("../realtime/events");
  return json({ ticket: eventBus.createTicket() });
});

// /api/events — SSE stream
router.get("events", async (ctx) => {
  const { eventBus } = await import("../realtime/events");
  const ticket = ctx.query.get("ticket");
  if (!ticket || !eventBus.validateTicket(ticket)) {
    return json({ error: "Invalid or expired ticket" }, 401);
  }
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };
      const handlers: Record<string, (...args: any[]) => void> = {};
      for (const event of ["file:changed", "agent:log", "agent:status", "agent:done", "agent:error", "task:status", "fsd:conversion"]) {
        const handler = (payload: any) => send(event, payload);
        eventBus.on(event, handler);
        handlers[event] = handler;
      }
      send("connected", { message: "SSE connected" });
      const keepAlive = setInterval(() => send("keepalive", { ts: Date.now() }), 15000);
      ctx.request.signal.addEventListener("abort", () => {
        for (const [event, handler] of Object.entries(handlers)) eventBus.off(event, handler);
        clearInterval(keepAlive);
      });
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
});
