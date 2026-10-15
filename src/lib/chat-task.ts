/**
 * Tasks sent to the chat from another page (Generate OpenAPI/RTM/SIT): open a thread,
 * and send `text` in it once when given. Same shape as chat-quote.ts — a request made
 * while no chat listens waits until the chat mounts and takes it; listeners are told at
 * once so the project page can open the chat panel.
 */
export interface ChatTaskRequest {
  threadId: string;
  /** Sent in the thread once when it opens; absent = just open the thread. */
  text?: string | null;
}

const pending: ChatTaskRequest[] = [];
const listeners = new Set<(request: ChatTaskRequest) => void>();

export function openChatTask(request: ChatTaskRequest): void {
  pending.push(request);
  for (const listener of listeners) listener(request);
}

export function subscribeChatTasks(listener: (request: ChatTaskRequest) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The requests not taken yet, oldest first. Each is handed out once. */
export function takePendingChatTasks(): ChatTaskRequest[] {
  return pending.splice(0, pending.length);
}
