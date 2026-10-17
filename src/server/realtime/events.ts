import { EventEmitter } from "node:events";

type EventName =
  | "file:changed"
  | "task:status"
  | "fsd:conversion"
  // Chat run lifecycle (Fase 5.6). Deliberately NOT a transcript channel: the
  // payload is a few fields for a native notification, and history still comes
  // from the DB (FR-B13). See ROADMAP 5.6 for why the notification is driven
  // from here rather than from the client's own stream.
  | "chat:run"
  | "chat:approval"
  // A steered message was handed to the model at a step boundary. Lets the
  // open thread drop its "menunggu disisipkan" marker while the run continues.
  | "chat:steer"
  // A pending approval was answered, timed out, or its run ended: remove the card.
  | "chat:approval-resolved"
  // The agent asked the user something and waits for the answers.
  | "chat:question"
  | "chat:question-resolved"
  // The message queue of a thread changed: re-read it.
  | "chat:queue"
  // A turn started on a thread (possibly from the queue, with no client streaming
  // it): a client viewing the thread can reattach to the live output.
  | "chat:turn"
  // The provider refused a request that the SDK is retrying (429 or 5xx). Lets the
  // status line say so instead of a silent wait. `attempt` 0 means the retries ended.
  | "chat:provider-retry"
  // Context compaction of a thread: start, then done or failed. Lets the transcript show a
  // divider while the summary is written, without waiting for the turn's stream.
  | "chat:compaction"
  // Fase 4C: a thread's workspace moved, or its worktree setup started or finished.
  | "chat:workspace"
  // Fase 5E: a document's write lock moved between windows (claimed, released, or its
  // holder's stream closed). Windows waiting on it claim again.
  | "lock:changed";

interface EventPayload {
  type: EventName;
  data: Record<string, unknown>;
  timestamp: number;
}

class AppEventBus extends EventEmitter {
  constructor() {
    super();
    // Allow up to 64 listeners without EventEmitter warning (supports MAX_STREAMS)
    this.setMaxListeners(64);
  }

  private tickets = new Map<string, number>();

  /** Drop expired tickets so the Map never grows without bound (each SSE
   *  connection creates one; unvalidated tickets would linger forever). */
  private pruneTickets() {
    const now = Date.now();
    for (const [ticket, expires] of this.tickets) {
      if (now > expires) this.tickets.delete(ticket);
    }
  }

  emitFileChanged(route: string, filePath: string, root?: string) {
    // `root` is additive: the watcher knows which project tree changed, and the
    // indexer needs it to refresh only that project. Existing listeners use
    // `route`/`path` and are unaffected.
    this.emitAppEvent({ type: "file:changed", data: { route, path: filePath, root } });
  }





  emitTaskStatus(taskId: string, status: string, preview?: string) {
    this.emitAppEvent({ type: "task:status", data: { taskId, status, preview } });
  }

  emitFsdConversion(sessionId: string, status: "converting" | "converted" | "failed", error?: string | null, contentLength?: number) {
    this.emitAppEvent({ type: "fsd:conversion", data: { sessionId, status, error, contentLength } });
  }

  /** A chat run reached a terminal status (Fase 5.6, FR-B16).
   *
   *  `projectName` + `threadTitle` ride along so the desktop shell can write a
   *  notification that says WHICH conversation finished without having to query
   *  anything — a notification for an unfocused window has no UI to look things
   *  up in, and the client that receives this may be on another project. */
  emitChatRun(input: {
    runId: string;
    threadId: string;
    projectId: string;
    status: "done" | "error" | "stopped" | "interrupted";
    error?: string | null;
    projectName?: string | null;
    threadTitle?: string | null;
  }) {
    this.emitAppEvent({ type: "chat:run", data: { ...input, error: input.error ?? null } });
  }

  /** A chat run is parked waiting for the user's decision (FR-E3/FR-E4).
   *  This is the higher-value trigger of the two: the run stays blocked until
   *  someone answers, so a hidden window means it waits forever. */
  emitChatApproval(input: {
    runId: string;
    threadId: string;
    projectId: string;
    toolCallId: string;
    name: string;
    preview: string;
    projectName?: string | null;
    threadTitle?: string | null;
  }) {
    this.emitAppEvent({ type: "chat:approval", data: { ...input } });
  }

  /** Steered messages the model has taken, identified by their message ids. */
  emitChatSteer(input: { threadId: string; messageIds: string[] }) {
    this.emitAppEvent({ type: "chat:steer", data: { ...input } });
  }

  emitChatQuestion(input: { threadId: string; runId: string; questionId: string; questions: unknown[] }) {
    this.emitAppEvent({ type: "chat:question", data: { ...input } });
  }

  emitChatQuestionResolved(input: { threadId: string; questionId: string }) {
    this.emitAppEvent({ type: "chat:question-resolved", data: { ...input } });
  }

  emitChatQueue(input: { threadId: string }) {
    this.emitAppEvent({ type: "chat:queue", data: { ...input } });
  }

  emitChatTurn(input: { threadId: string; runId: string }) {
    this.emitAppEvent({ type: "chat:turn", data: { ...input } });
  }

  emitChatWorkspace(input: { threadId: string }) {
    this.emitAppEvent({ type: "chat:workspace", data: { ...input } });
  }

  emitChatProviderRetry(input: { threadId: string; status: number; attempt: number }) {
    this.emitAppEvent({ type: "chat:provider-retry", data: { ...input } });
  }

  emitChatCompaction(input: {
    threadId: string;
    phase: "start" | "done" | "failed";
    at: "before-turn" | "in-run" | "manual";
    estimatedBefore?: number;
    estimatedAfter?: number;
  }) {
    this.emitAppEvent({ type: "chat:compaction", data: { ...input } });
  }

  emitLockChanged(input: { key: string }) {
    this.emitAppEvent({ type: "lock:changed", data: { ...input } });
  }

  emitChatApprovalResolved(input: { threadId: string; toolCallId: string }) {
    this.emitAppEvent({ type: "chat:approval-resolved", data: { ...input } });
  }

  private emitAppEvent(payload: Omit<EventPayload, "timestamp">) {
    const event: EventPayload = { ...payload, timestamp: Date.now() };
    this.emit(payload.type, event);
  }

  createTicket(): string {
    const ticket = crypto.randomUUID();
    if (this.tickets.size > 512) this.pruneTickets();
    // Long TTL: tickets only gate the initial SSE connect, and agent runs can
    // take minutes — a 60s expiry made EventSource auto-reconnects 401 mid-run
    // (clients silently deaf to the completion events). Local single-user app.
    this.tickets.set(ticket, Date.now() + 30 * 60 * 1000);
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
