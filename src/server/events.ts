import { EventEmitter } from "node:events";

type EventName = "file:changed" | "agent:log" | "agent:status" | "agent:done" | "agent:error" | "task:status" | "fsd:conversion";

interface EventPayload {
  type: EventName;
  data: Record<string, unknown>;
  timestamp: number;
}

class AppEventBus extends EventEmitter {
  private tickets = new Map<string, number>();

  emitFileChanged(route: string, filePath: string) {
    this.emitAppEvent({ type: "file:changed", data: { route, path: filePath } });
  }

  emitAgentLog(level: string, message: string, sessionId?: string) {
    this.emitAppEvent({ type: "agent:log", data: { level, message, sessionId } });
  }

  emitAgentStatus(sessionId: string, status: string, message?: string) {
    this.emitAppEvent({ type: "agent:status", data: { sessionId, status, message } });
  }

  emitAgentDone(sessionId: string, artifacts?: Record<string, string[]>) {
    this.emitAppEvent({ type: "agent:done", data: { sessionId, artifacts } });
  }

  emitAgentError(sessionId: string, error: string) {
    this.emitAppEvent({ type: "agent:error", data: { sessionId, error } });
  }

  emitTaskStatus(taskId: string, status: string, preview?: string) {
    this.emitAppEvent({ type: "task:status", data: { taskId, status, preview } });
  }

  emitFsdConversion(sessionId: string, status: "converting" | "converted" | "failed", error?: string | null, contentLength?: number) {
    this.emitAppEvent({ type: "fsd:conversion", data: { sessionId, status, error, contentLength } });
  }

  private emitAppEvent(payload: Omit<EventPayload, "timestamp">) {
    const event: EventPayload = { ...payload, timestamp: Date.now() };
    this.emit(payload.type, event);
  }

  createTicket(): string {
    const ticket = crypto.randomUUID();
    this.tickets.set(ticket, Date.now() + 60000);
    return ticket;
  }

  validateTicket(ticket: string): boolean {
    const expires = this.tickets.get(ticket);
    if (!expires) return false;
    if (Date.now() > expires) { this.tickets.delete(ticket); return false; }
    return true;
  }
}

export const eventBus = new AppEventBus();
