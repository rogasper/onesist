import { useEffect, useState } from "react";
import { claimFile, releaseFile, subscribeFileLocks } from "./pane-file-lock";

/**
 * Claims `key` for `owner` while mounted and returns whether this pane may write.
 * A pane that lost the race re-tries whenever any lock changes, so it becomes the
 * writer as soon as the owner lets go. `null` = nothing open, always writable.
 */
export function useFileClaim(key: string | null, owner: string): boolean {
  const [canWrite, setCanWrite] = useState(true);
  useEffect(() => {
    if (!key) {
      setCanWrite(true);
      return;
    }
    const sync = () => setCanWrite(claimFile(key, owner));
    sync();
    const unsubscribe = subscribeFileLocks(sync);
    return () => {
      unsubscribe();
      releaseFile(key, owner);
    };
  }, [key, owner]);
  return canWrite;
}
