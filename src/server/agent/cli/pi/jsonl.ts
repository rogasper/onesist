/**
 * Pi's RPC transport over stdio. Records are LF-delimited JSON, never split on U+2028/U+2029
 * (that is what readline would do). A command carries an `id` and is answered by a
 * `type: "response"` record with the same id; every other record is an event. A line that is
 * not JSON (an extension's log output, say) is skipped rather than ending the session.
 */
export type PiRecord = Record<string, any> & { type: string };

const DEFAULT_TIMEOUT_MS = 30_000;

export class PiJsonl {
  private nextId = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private buffer = "";
  private eventHandlers: ((r: PiRecord) => void)[] = [];
  private closedHandlers: ((reason: string) => void)[] = [];
  private closed = false;

  constructor(private readonly write: (line: string) => void) {}

  command(record: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      if (this.closed) return reject(new Error("Koneksi ke Pi sudah tertutup."));
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Perintah Pi ${String(record.type)} melewati batas waktu.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write(JSON.stringify({ ...record, id }) + "\n");
    });
  }

  send(record: Record<string, unknown>): void {
    this.write(JSON.stringify(record) + "\n");
  }

  feed(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() ?? "";
    for (const line of lines) this.handleLine(line);
  }

  onEvent(handler: (r: PiRecord) => void): void {
    this.eventHandlers.push(handler);
  }
  onClosed(handler: (reason: string) => void): void {
    this.closedHandlers.push(handler);
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
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (!line.trim()) return;
    let record: any;
    try {
      record = JSON.parse(line);
    } catch {
      return;
    }
    if (!record || typeof record.type !== "string") return;
    if (record.type === "response" && record.id !== undefined) {
      const p = this.pending.get(record.id);
      if (!p) return;
      this.pending.delete(record.id);
      clearTimeout(p.timer);
      if (record.success === false) p.reject(new Error(String(record.error ?? "Pi menolak perintah.")));
      else p.resolve(record.data);
      return;
    }
    for (const h of this.eventHandlers) h(record as PiRecord);
  }
}
