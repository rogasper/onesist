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

/**
 * The chat opens one thread at a time. When several tasks arrive together, the newest opens
 * and the earlier ones that carry a prompt are returned as `queued`: the chat puts their
 * prompts in those threads' queues, so no task is left as an empty thread.
 */
export function splitChatTasks(tasks: ChatTaskRequest[]): { open: ChatTaskRequest | undefined; queued: ChatTaskRequest[] } {
  const open = tasks.at(-1);
  return { open, queued: tasks.slice(0, -1).filter((t) => !!t.text) };
}
