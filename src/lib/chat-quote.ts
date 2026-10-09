/**
 * Quotes sent from the artifact viewers (FSD, API spec) to the chat (M4 item 21).
 *
 * A viewer can send a quote when no chat thread is open: the quote then waits in the
 * queue, and the chat takes it when it mounts. Listeners are told at once, so the
 * project page can open the chat panel.
 */
export interface ChatQuote {
  text: string;
  /** Where the text came from, shown above the quote, e.g. "API spec · Auth". */
  source: string;
}

const pending: ChatQuote[] = [];
const listeners = new Set<(quote: ChatQuote) => void>();

export function sendQuoteToChat(quote: ChatQuote): void {
  pending.push(quote);
  for (const listener of listeners) listener(quote);
}

/** Subscribes to new quotes; returns the function that unsubscribes. */
export function subscribeQuotes(listener: (quote: ChatQuote) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The quotes that arrived while no chat was listening, oldest first. Each is handed out once. */
export function takePendingQuotes(): ChatQuote[] {
  return pending.splice(0, pending.length);
}
