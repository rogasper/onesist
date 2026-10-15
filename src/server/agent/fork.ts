/**
 * Forking a thread for the chat (Fase 4B). `forkThread` copies the conversation up to the
 * chosen message and records the lineage. For a thread on a CLI provider the branch also
 * needs a session: a native fork copies the provider's own session when the fork point is
 * the latest message and that session has seen it (OpenCode cannot fork "before" a message
 * Onesist knows). Otherwise the branch starts without a session, and its first CLI turn is
 * handed the copied transcript by 4A (`portable_context`). A failed native fork never fails
 * the fork itself.
 */
import { resolveProvider } from "~/server/agent/config";
import { cliRuntimeFor } from "~/server/agent/runtime/registry";
import type { CliRuntime } from "~/server/agent/runtime/types";
import { getProviderSession, getThread, latestSeq, listMessages, messageSeq, saveProviderSession, updateThread } from "~/server/agent/store";
import { forkThread } from "~/server/agent/thread-edit";

export function canForkNatively(input: { forkSeq: number; latestContentSeq: number; session: { knownUptoSeq: number } | null }): boolean {
  return !!input.session && input.forkSeq >= input.latestContentSeq && input.session.knownUptoSeq >= input.forkSeq;
}

export async function forkForChat(
  input: { threadId: string; messageId: string },
  /** For tests: the runtime to fork with (null = none). */
  runtimeOverride?: CliRuntime | null,
): Promise<{ threadId: string; mode: "native" | "portable" } | null> {
  const parent = getThread(input.threadId);
  if (!parent) return null;
  const forkSeq = messageSeq(parent.id, input.messageId);
  if (forkSeq == null) return null;
  const childId = forkThread(input);
  if (!childId) return null;

  const provider = resolveProvider(parent.providerId);
  const runtime = runtimeOverride !== undefined ? runtimeOverride : provider ? cliRuntimeFor(provider) : null;
  if (!provider || !runtime?.forkSession) return { threadId: childId, mode: "portable" };

  const session = getProviderSession(parent.id, provider.id);
  const content = listMessages(parent.id).filter((r) => (r.role === "user" || r.role === "assistant") && !r.kind);
  const latestContentSeq = content.length ? content[content.length - 1].seq : 0;
  if (!session || !canForkNatively({ forkSeq, latestContentSeq, session })) return { threadId: childId, mode: "portable" };

  try {
    const childSession = await runtime.forkSession(provider, session.sessionId);
    saveProviderSession(childId, provider.id, childSession, latestSeq(childId));
    updateThread(childId, { cliSessionId: childSession });
    return { threadId: childId, mode: "native" };
  } catch (err) {
    console.warn(`[fork] native fork failed, the branch will be handed over instead: ${err instanceof Error ? err.message : String(err)}`);
    return { threadId: childId, mode: "portable" };
  }
}
