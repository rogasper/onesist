import { useEffect, useState } from "react";
import { FALLBACK_CHANGELOG, loadChangelog, type ChangelogState } from "./changelog";

// One request for the whole page: the hero, the download card and the changelog share it.
let shared: Promise<ChangelogState> | null = null;

export function useChangelog(): ChangelogState {
  const [state, setState] = useState<ChangelogState>({ version: null, entries: FALLBACK_CHANGELOG, live: false });
  useEffect(() => {
    let alive = true;
    shared ??= loadChangelog();
    void shared.then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
