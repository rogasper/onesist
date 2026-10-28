/**
 * "Buka penuh": a card's drawer asks the project page to show the review pane for a run. The
 * request waits if the pane is not mounted yet, the same way chat tasks do.
 */
let pending: string | null = null;
const listeners = new Set<(runId: string) => void>();

export function openReviewPane(runId: string): void {
  pending = runId;
  for (const listener of listeners) listener(runId);
}

export function subscribeReviewPane(listener: (runId: string) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The run a request is waiting for, handed out once. */
export function takePendingReviewRun(): string | null {
  const value = pending;
  pending = null;
  return value;
}
