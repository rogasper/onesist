/**
 * A page's Generate button as a chat task: `start` asks the server for the thread and its
 * prompt, then opens the chat, which sends the prompt. The page hears the end of the run
 * through `chat:run` and refreshes what the agent wrote (`onDone`, only on success).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openChatTask } from "~/lib/chat-task";
import { subscribe } from "~/lib/event-stream";

export type AgentTaskMode = "openapi" | "rtm" | "sit";

export interface AgentTaskState {
  running: boolean;
  error: string | null;
  start(scope?: { fsd?: string; fds?: string[] }): Promise<void>;
  openChat(): void;
}

export function useAgentTask(projectId: string, mode: AgentTaskMode, onDone: () => void): AgentTaskState {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  // A second click before the first request answers would start a second task. The state
  // (`running`) lands too late to stop it, so the guard is a ref set synchronously.
  const startingRef = useRef(false);

  useEffect(() => {
    if (!threadId) return;
    return subscribe("chat:run", (data) => {
      const event = data as { threadId?: string; status?: string } | null;
      if (event?.threadId !== threadId) return;
      setRunning(false);
      if (event.status === "done") onDoneRef.current();
    });
  }, [threadId]);

  const start = useCallback(
    async (scope: { fsd?: string; fds?: string[] } = {}) => {
      if (startingRef.current) return;
      startingRef.current = true;
      setError(null);
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/agent-tasks`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode, ...scope }),
          cache: "no-store",
        });
        const body = (await res.json().catch(() => ({}))) as { threadId?: string; text?: string; error?: string };
        if (!res.ok || !body.threadId) throw new Error(body.error ?? `HTTP ${res.status}`);
        setThreadId(body.threadId);
        setRunning(true);
        openChatTask({ threadId: body.threadId, text: body.text ?? null });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Gagal memulai tugas");
      } finally {
        startingRef.current = false;
      }
    },
    [projectId, mode],
  );

  const openChat = useCallback(() => {
    if (threadId) openChatTask({ threadId });
  }, [threadId]);

  return useMemo(() => ({ running, error, start, openChat }), [running, error, start, openChat]);
}
