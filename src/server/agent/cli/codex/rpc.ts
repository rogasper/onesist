/**
 * JSON-RPC 2.0 over the stdio of `codex app-server`: one JSON object per line. The client
 * sends requests (with an id), answers the server's requests (approvals), and receives
 * notifications (no id). Framing is LF-only; a line that is not JSON is skipped, so one
 * stray line cannot end a session.
 */
export interface RpcNotification {
  method: string;
  params?: any;
}
export interface RpcServerRequest {
  id: number | string;
  method: string;
  params?: any;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class RpcClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private buffer = "";
  private notificationHandlers: ((n: RpcNotification) => void)[] = [];
  private requestHandlers: ((r: RpcServerRequest) => void)[] = [];
  private closedHandlers: ((reason: string) => void)[] = [];
  private closed = false;

  constructor(private readonly write: (line: string) => void) {}

  request<T = any>(method: string, params?: unknown, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      if (this.closed) return reject(new Error("Koneksi ke Codex sudah tertutup."));
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Permintaan ${method} melewati batas waktu.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write(JSON.stringify({ id, method, params: params ?? {} }) + "\n");
    });
  }

  notify(method: string, params?: unknown): void {
    this.write(JSON.stringify(params === undefined ? { method } : { method, params }) + "\n");
  }

  respond(id: number | string, result: unknown): void {
    this.write(JSON.stringify({ id, result }) + "\n");
  }

  feed(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) this.handleLine(line);
  }

  onNotification(handler: (n: RpcNotification) => void): void {
    this.notificationHandlers.push(handler);
  }
  onServerRequest(handler: (r: RpcServerRequest) => void): void {
    this.requestHandlers.push(handler);
  }
  /** Returns the way to stop listening, so a turn can leave when it ends. */
  onClosed(handler: (reason: string) => void): () => void {
    this.closedHandlers.push(handler);
    return () => {
      this.closedHandlers = this.closedHandlers.filter((h) => h !== handler);
    };
  }

  close(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this.pending.clear();
    for (const h of this.closedHandlers) h(reason);
  }

  private handleLine(raw: string): void {
    const line = raw.trim();
    if (!line) return;
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // not a JSON-RPC message; the server may print a log line
    }
    if (msg && typeof msg === "object" && "id" in msg && ("result" in msg || "error" in msg) && !("method" in msg)) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.error) p.reject(new Error(String(msg.error.message ?? "Codex mengembalikan error.")));
      else p.resolve(msg.result);
      return;
    }
    if (msg && typeof msg.method === "string") {
      if (msg.id !== undefined) {
        for (const h of this.requestHandlers) h({ id: msg.id, method: msg.method, params: msg.params });
      } else {
        for (const h of this.notificationHandlers) h({ method: msg.method, params: msg.params });
      }
    }
  }
}
