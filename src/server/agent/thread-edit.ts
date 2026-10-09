/**
 * Editing a conversation: resend from an earlier message, and fork a thread from one.
 *
 * Resending rewrites the conversation from a user message onwards. The messages
 * after it are removed, together with their tool calls, ledger rows, checkpoints
 * and search entries. The file changes of those turns can be undone as well, so
 * the workspace matches the conversation again. The caller then sends the new text
 * as an ordinary message.
 *
 * Forking copies the conversation up to a message into a new thread. The workspace
 * is shared, so file changes are not copied.
 */
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "~/server/db/client";
import { chatCheckpoints, chatMessages, chatThreadFiles, chatToolCalls } from "~/server/db/schema";
import { applyTurnAction, turnChanges } from "./checkpoints";
import { getRunForThread } from "./run-registry";
import { appendMessage, createThread, getThread, messageSeq, type MessageRow } from "./store";

export type TruncateResult =
  | { ok: true; removedIds: string[]; undone: string[] }
  | { ok: false; status: number; error: string; conflicts?: { path: string; state: string }[] };

/**
 * Removes a user message and everything after it, and (unless `conversationOnly`)
 * undoes the file changes of the removed turns. Nothing is removed when the file
 * changes cannot be undone safely and `conversationOnly` is not set.
 */
export function truncateFromMessage(input: {
  threadId: string;
  root: string;
  messageId: string;
  resetFiles: boolean;
  conversationOnly: boolean;
}): TruncateResult {
  const thread = getThread(input.threadId);
  if (!thread) return { ok: false, status: 404, error: "Thread tidak ditemukan." };
  if (getRunForThread(input.threadId)) {
    return { ok: false, status: 409, error: "Masih ada run yang berjalan di percakapan ini. Hentikan dulu." };
  }
  if (thread.summary) {
    return {
      ok: false,
      status: 409,
      error: "Percakapan ini sudah diringkas, jadi pesan sebelum ringkasan tidak bisa diedit. Buat cabang dari pesan ini.",
    };
  }
  const seq = messageSeq(input.threadId, input.messageId);
  if (seq == null) return { ok: false, status: 404, error: "Pesan tidak ditemukan." };
  const target = db.select().from(chatMessages).where(eq(chatMessages.id, input.messageId)).get() as MessageRow;
  if (target.role !== "user") return { ok: false, status: 400, error: "Hanya pesan user yang bisa dikirim ulang." };

  const removed = db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.threadId, input.threadId), gte(chatMessages.seq, seq)))
    .orderBy(asc(chatMessages.seq))
    .all() as MessageRow[];
  const removedIds = removed.map((m) => m.id);

  // Turns that wrote files, latest first: they are undone in that order.
  const turns = removed.filter((m) => m.role === "assistant").reverse();
  const undone: string[] = [];
  if (input.resetFiles && !input.conversationOnly) {
    const plans = turns.map((t) => ({ id: t.id, files: turnChanges(input.threadId, input.root, t.id) }));
    const blocked = plans.flatMap((p) => p.files.filter((f) => f.state === "changed" || f.state === "unverifiable"));
    if (blocked.length) {
      return {
        ok: false,
        status: 409,
        error: "Ada berkas yang sudah berubah setelah giliran itu, jadi tidak dibatalkan otomatis.",
        conflicts: blocked.map((f) => ({ path: f.path, state: f.state })),
      };
    }
    for (const plan of plans) {
      const applied = plan.files.filter((f) => f.canUndo).map((f) => f.path);
      if (!applied.length) continue;
      applyTurnAction(input.threadId, input.root, plan.id, "undo", applied);
      undone.push(plan.id);
    }
  }

  if (removedIds.length) {
    for (const id of removedIds) {
      db.run(sql`DELETE FROM chat_fts WHERE message_id = ${id}`);
    }
    db.delete(chatToolCalls).where(inArray(chatToolCalls.messageId, removedIds)).run();
    db.delete(chatThreadFiles).where(inArray(chatThreadFiles.messageId, removedIds)).run();
    db.delete(chatCheckpoints).where(inArray(chatCheckpoints.messageId, removedIds)).run();
  }
  db.delete(chatMessages)
    .where(and(eq(chatMessages.threadId, input.threadId), gte(chatMessages.seq, seq)))
    .run();
  return { ok: true, removedIds, undone };
}

/**
 * A new thread holding the conversation up to and including `messageId`. The new
 * thread keeps the provider, model and mode of the original; file changes are not
 * copied (the workspace is shared).
 */
export function forkThread(input: { threadId: string; messageId: string }): string | null {
  const thread = getThread(input.threadId);
  if (!thread) return null;
  const seq = messageSeq(input.threadId, input.messageId);
  if (seq == null) return null;
  const rows = db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.threadId, input.threadId), sql`${chatMessages.seq} <= ${seq}`))
    .orderBy(asc(chatMessages.seq))
    .all() as MessageRow[];

  const title = `Cabang: ${thread.title ?? "Percakapan"}`.slice(0, 80);
  const copy = createThread({
    projectId: thread.projectId,
    title,
    mode: thread.mode as any,
    providerId: thread.providerId,
    model: thread.model,
    permissionMode: thread.permissionMode as any,
    maxSteps: thread.maxSteps,
  });
  for (const row of rows) {
    let parts: unknown[] = [];
    try {
      parts = row.contentJson ? JSON.parse(row.contentJson) : [];
    } catch {
      parts = [];
    }
    appendMessage({
      threadId: copy.id,
      role: row.role as "user" | "assistant" | "system",
      parts,
      kind: row.kind,
      providerId: row.providerId,
      model: row.model,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      reasoningMs: row.reasoningMs,
      status: (row.status as "ok" | "error" | "aborted" | null) ?? undefined,
    } as any);
  }
  return copy.id;
}
