import { useEffect, useState } from "react";
import { canWriteWith, serverClaimFrom, type ServerClaim } from "./doc-claim";
import { onStreamStatus, subscribe } from "./event-stream";
import { claimFile, fileOwner, releaseFile, subscribeFileLocks } from "./pane-file-lock";
import { windowClientId } from "./window-client";

async function claimOnServer(key: string): Promise<ServerClaim> {
  try {
    const res = await fetch("/api/locks/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, clientId: windowClientId() }),
      cache: "no-store",
    });
    return serverClaimFrom(res.status, await res.json().catch(() => null));
  } catch {
    return "unavailable";
  }
}

function releaseOnServer(key: string): void {
  void fetch("/api/locks/release", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, clientId: windowClientId() }),
    cache: "no-store",
    // A closing window still sends it; if it does not, the closed stream releases the lock.
    keepalive: true,
  }).catch(() => {});
}

/**
 * Claims `key` for `owner` while mounted and returns whether this pane may write. Panes of
 * this window decide through pane-file-lock; other windows through the server (Fase 5E). A
 * pane that lost either race claims again when any lock changes or the stream reopens.
 * `null` = nothing open, always writable.
 */
export function useFileClaim(key: string | null, owner: string): boolean {
  const [local, setLocal] = useState(true);
  const [server, setServer] = useState<ServerClaim>("ok");
  useEffect(() => {
    if (!key) {
      setLocal(true);
      setServer("ok");
      return;
    }
    let alive = true;
    setServer("pending");
    const sync = () => {
      const mine = claimFile(key, owner);
      setLocal(mine);
      if (!mine) return;
      void claimOnServer(key).then((answer) => {
        if (alive) setServer(answer);
      });
    };
    sync();
    const offLocal = subscribeFileLocks(sync);
    // Subscribing also keeps this window's stream open, which keeps its locks alive.
    const offChanged = subscribe("lock:changed", (data: any) => {
      if (data?.key === key) sync();
    });
    const offStatus = onStreamStatus((status) => {
      if (status === "open") sync();
      else if (alive) setServer("unavailable");
    });
    return () => {
      alive = false;
      offLocal();
      offChanged();
      offStatus();
      if (fileOwner(key) === owner) {
        releaseFile(key, owner);
        releaseOnServer(key);
      }
    };
  }, [key, owner]);
  return canWriteWith(local, server);
}
