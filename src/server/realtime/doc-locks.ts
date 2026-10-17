/**
 * Document write locks across windows (Fase 5E). A window is identified by a client id it
 * sends when it opens the SSE stream (`/api/events?client=…`). A lock belongs to a client,
 * and every lock of a client is released when its last stream closes — a closed or crashed
 * window never keeps a document locked, and nothing polls. Within one window, panes still
 * decide among themselves with `lib/pane-file-lock.ts`.
 */
export type ClaimResult = { ok: true } | { ok: false; reason: "held"; holder: string } | { ok: false; reason: "not_connected" };

export interface DocLocks {
  connect(clientId: string): void;
  /** Returns the keys released because this was the client's last stream. */
  disconnect(clientId: string): string[];
  isConnected(clientId: string): boolean;
  claim(key: string, clientId: string): ClaimResult;
  release(key: string, clientId: string): boolean;
  holderOf(key: string): string | undefined;
}

export function createDocLocks(): DocLocks {
  const streams = new Map<string, number>();
  const holders = new Map<string, string>();
  const locks: DocLocks = {
    connect(clientId) {
      streams.set(clientId, (streams.get(clientId) ?? 0) + 1);
    },
    disconnect(clientId) {
      const left = (streams.get(clientId) ?? 0) - 1;
      if (left > 0) {
        streams.set(clientId, left);
        return [];
      }
      streams.delete(clientId);
      const released: string[] = [];
      for (const [key, holder] of holders) {
        if (holder === clientId) {
          holders.delete(key);
          released.push(key);
        }
      }
      return released;
    },
    isConnected(clientId) {
      return (streams.get(clientId) ?? 0) > 0;
    },
    claim(key, clientId) {
      if (!locks.isConnected(clientId)) return { ok: false, reason: "not_connected" };
      const holder = holders.get(key);
      if (holder !== undefined && holder !== clientId) return { ok: false, reason: "held", holder };
      holders.set(key, clientId);
      return { ok: true };
    },
    release(key, clientId) {
      if (holders.get(key) !== clientId) return false;
      holders.delete(key);
      return true;
    },
    holderOf(key) {
      return holders.get(key);
    },
  };
  return locks;
}

export const docLocks: DocLocks = ((globalThis as any).__onesistDocLocks ??= createDocLocks());
