/**
 * A minimal Chrome DevTools Protocol client (P4.2): request/response with ids and a timeout,
 * and event listeners. No dependency; the socket is injected so the routing can be tested.
 */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onopen: (() => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export type CdpEvent = { method: string; params: any; sessionId?: string };

export class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private listeners = new Set<(ev: CdpEvent) => void>();

  constructor(private socket: SocketLike, private timeoutMs = 30_000) {
    socket.onmessage = (ev) => this.onMessage(String(ev.data));
  }

  /** Resolves when the socket is open. */
  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.onopen = () => resolve();
      this.socket.onerror = (e) => reject(new Error(`CDP socket error: ${String((e as any)?.message ?? e)}`));
    });
  }

  send<T = any>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  on(listener: (ev: CdpEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error("CDP connection closed"));
    }
    this.pending.clear();
    this.socket.close();
  }

  /** Routes one message: a reply settles its request, anything else is an event. */
  handle(raw: string): void {
    this.onMessage(raw);
  }

  private onMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (typeof msg.id === "number") {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(String(msg.error.message ?? "CDP error")));
      else p.resolve(msg.result ?? {});
      return;
    }
    if (typeof msg.method === "string") {
      for (const l of this.listeners) l({ method: msg.method, params: msg.params, sessionId: msg.sessionId });
    }
  }
}
