/**
 * True when the server runs a turn on this thread. A failed read counts as idle: the send then
 * reports its own error, instead of holding the message back on a guess.
 */
export async function threadHasRunningTurn(threadId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/chat/threads/${threadId}`, { cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as { activeRun?: unknown };
    return !!data.activeRun;
  } catch {
    return false;
  }
}
