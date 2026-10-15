/**
 * One CLI turn's starting point (Fase 4A): which of the provider's sessions it runs in, and
 * what that session must be told before the new message — nothing, the whole story so far
 * (handoff), or only what happened since it last spoke (delta).
 */
import { decideTransition, handoffBudgetBytes, handoffItemsFromRows, renderHandoff, selectHandoffItems, withHandoff, type HandoffItem, type Transition } from "~/server/agent/handoff";
import { getProviderSession, latestSeq, listMessages, messageSeq, type MessageRow, type ProviderSession, type ThreadRow } from "~/server/agent/store";

export interface PreparedCliTurn {
  sessionId: string | null;
  /** What the runtime sends: the new message, preceded by a handoff when one is needed. */
  text: string;
  transition: Transition;
  included: number;
  omitted: number;
  /** The new message's seq: the session has seen the thread up to here once it takes the prompt. */
  currentSeq: number;
}

/**
 * A thread whose OpenCode session was made before chat_provider_sessions existed: its
 * `cli_session_id` belongs to the provider that wrote the last CLI reply, and to no other.
 */
function legacySession(thread: ThreadRow, providerId: string, rows: MessageRow[]): ProviderSession | null {
  if (!thread.cliSessionId) return null;
  const own = [...rows].reverse().find((r) => r.role === "assistant" && r.providerId === providerId);
  return own ? { sessionId: thread.cliSessionId, knownUptoSeq: own.seq } : null;
}

export function prepareCliTurn(input: {
  thread: ThreadRow;
  providerId: string;
  userText: string;
  userMessageId: string | null;
  contextWindow: number | null;
}): PreparedCliTurn {
  const { thread } = input;
  const rows = listMessages(thread.id);
  const currentSeq = (input.userMessageId ? messageSeq(thread.id, input.userMessageId) : null) ?? latestSeq(thread.id) + 1;
  const session = getProviderSession(thread.id, input.providerId) ?? legacySession(thread, input.providerId, rows);
  const content = rows.filter((r) => (r.role === "user" || r.role === "assistant") && !r.kind);
  const transition = decideTransition({ session, currentSeq, contentSeqs: content.map((r) => r.seq) });
  const sessionId = session?.sessionId ?? null;

  if (transition.kind === "fresh" || transition.kind === "reuse") {
    return { sessionId, text: input.userText, transition, included: 0, omitted: 0, currentSeq };
  }

  const cutoff = transition.kind === "delta" ? transition.afterSeq : (thread.summaryUptoSeq ?? 0);
  const items: HandoffItem[] = handoffItemsFromRows(content.filter((r) => r.seq > cutoff && r.seq < currentSeq));
  if (transition.kind === "handoff" && thread.summary?.trim()) items.unshift({ seq: 0, kind: "summary", text: thread.summary.trim() });
  const { chosen, omitted } = selectHandoffItems(items, handoffBudgetBytes(input.contextWindow));
  const context = renderHandoff({ mode: transition.kind, threadId: thread.id, chosen, omitted });
  return { sessionId, text: withHandoff(context, input.userText), transition, included: chosen.length, omitted, currentSeq };
}
