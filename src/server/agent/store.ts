/**
 * Chat persistence (FR-B13, FR-C4).
 *
 * History is written to SQLite; SSE/stream is only the display path. That is what
 * sets it apart from the old `AgentStream`, whose history was just a 300-event
 * in-memory ring buffer lost on server restart.
 */
import crypto from "node:crypto";
import { and, asc, desc, eq, max } from "drizzle-orm";
import { db } from "~/server/db/client";
import { chatMessages, chatRuns, chatThreadFiles, chatThreadReads, chatThreads, chatToolCalls, subagents } from "~/server/db/schema";
import type { FileOp, PermissionMode, ThreadMode } from "./types";

export type ThreadRow = typeof chatThreads.$inferSelect;
export type MessageRow = typeof chatMessages.$inferSelect;
export type ToolCallRow = typeof chatToolCalls.$inferSelect;

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thread
// ─────────────────────────────────────────────────────────────────────────────

export function listThreads(projectId: string, includeArchived = false): ThreadRow[] {
  const rows = db
    .select()
    .from(chatThreads)
    .where(eq(chatThreads.projectId, projectId))
    .orderBy(desc(chatThreads.updatedAt))
    .all() as ThreadRow[];
  return includeArchived ? rows : rows.filter((r) => !r.archived);
}

export function getThread(id: string): ThreadRow | undefined {
  return db.select().from(chatThreads).where(eq(chatThreads.id, id)).get() as ThreadRow | undefined;
}

export function createThread(input: {
  projectId: string;
  title?: string | null;
  mode?: ThreadMode;
  providerId?: string | null;
  model?: string | null;
  permissionMode?: PermissionMode;
  maxSteps?: number;
}): ThreadRow {
  const now = new Date().toISOString();
  const row: typeof chatThreads.$inferInsert = {
    id: newId("thr"),
    projectId: input.projectId,
    title: input.title ?? null,
    mode: input.mode ?? "agent",
    providerId: input.providerId ?? null,
    model: input.model ?? null,
    permissionMode: input.permissionMode ?? "ask",
    maxSteps: input.maxSteps ?? 30,
    tokensUsed: 0,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(chatThreads).values(row).run();
  return getThread(row.id!)!;
}

export function updateThread(id: string, patch: Partial<typeof chatThreads.$inferInsert>): void {
  db.update(chatThreads)
    .set({ ...patch, updatedAt: new Date().toISOString() })
    .where(eq(chatThreads.id, id))
    .run();
}

export function touchThread(id: string): void {
  try {
    db.update(chatThreads).set({ updatedAt: new Date().toISOString() }).where(eq(chatThreads.id, id)).run();
  } catch {
    /* not critical */
  }
}

export function deleteThread(id: string): void {
  // Child tables do not use ON DELETE CASCADE, so they are cleaned up manually —
  // and `foreign_keys = ON` (set in client.ts) makes thread deletion fail with
  // SQLITE_CONSTRAINT_FOREIGNKEY if any child is missed.
  // `chat_runs` MUST be deleted too; it was once left out.
  db.delete(chatToolCalls).where(eq(chatToolCalls.threadId, id)).run();
  db.delete(chatThreadFiles).where(eq(chatThreadFiles.threadId, id)).run();
  db.delete(chatThreadReads).where(eq(chatThreadReads.threadId, id)).run();
  db.delete(chatMessages).where(eq(chatMessages.threadId, id)).run();
  db.delete(chatRuns).where(eq(chatRuns.threadId, id)).run();
  db.delete(chatThreads).where(eq(chatThreads.id, id)).run();
}

export function addTokens(threadId: string, inputTokens: number, outputTokens: number): void {
  const row = getThread(threadId);
  if (!row) return;
  updateThread(threadId, { tokensUsed: (row.tokensUsed ?? 0) + inputTokens + outputTokens });
}

/** Auto title from the first message — so the thread list stays readable without
 *  forcing the user to name it themselves. */
export function autoTitleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 60 ? `${clean.slice(0, 57)}…` : clean || "Percakapan baru";
}

// ─────────────────────────────────────────────────────────────────────────────
// Messages
// ─────────────────────────────────────────────────────────────────────────────

function nextSeq(threadId: string): number {
  const row = db.select({ n: max(chatMessages.seq) }).from(chatMessages).where(eq(chatMessages.threadId, threadId)).get() as { n: number | null } | undefined;
  return (row?.n ?? 0) + 1;
}

export function appendMessage(input: {
  threadId: string;
  role: "system" | "user" | "assistant" | "tool";
  /** Message parts in AI SDK UIMessage format, stored as JSON. */
  parts?: unknown;
  toolCalls?: unknown;
  toolCallId?: string | null;
  kind?: string | null;
  providerId?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  reasoningMs?: number | null;
  status?: "ok" | "error" | "aborted";
  error?: string | null;
  id?: string;
}): MessageRow {
  // The id is ALWAYS filled in here. The UI stream can send an empty id, and an
  // empty id as primary key lets the FIRST reply occupy the "" key and then EVERY
  // later reply fails with "UNIQUE constraint failed: chat_messages.id" — with
  // no message to the user at all, because the run still closes. Symptom: the
  // conversation loses its replies as soon as the app is reloaded.
  const id = input.id?.trim() ? input.id.trim() : newId("msg");
  db.insert(chatMessages)
    .values({
      id,
      threadId: input.threadId,
      seq: nextSeq(input.threadId),
      role: input.role,
      contentJson: input.parts === undefined ? null : JSON.stringify(input.parts),
      toolCallsJson: input.toolCalls === undefined ? null : JSON.stringify(input.toolCalls),
      toolCallId: input.toolCallId ?? null,
      kind: input.kind ?? null,
      providerId: input.providerId ?? null,
      model: input.model ?? null,
      inputTokens: input.inputTokens ?? null,
      outputTokens: input.outputTokens ?? null,
      reasoningMs: input.reasoningMs ?? null,
      status: input.status ?? "ok",
      error: input.error ?? null,
      createdAt: new Date().toISOString(),
    })
    .run();
  touchThread(input.threadId);
  return db.select().from(chatMessages).where(eq(chatMessages.id, id)).get() as MessageRow;
}

export function listMessages(threadId: string): MessageRow[] {
  return db.select().from(chatMessages).where(eq(chatMessages.threadId, threadId)).orderBy(asc(chatMessages.seq)).all() as MessageRow[];
}

/** Convert stored rows into `UIMessage[]` for `useChat` and for continuing
 *  the conversation with the provider.
 *
 *  `metadata` is carried along because the transcript renders `↑in ↓out` and
 *  thinking duration from it (FR-B12, FR-B5). Without this, both are only
 *  visible on the turn currently running and disappear after reload. */
export function toUIMessages(rows: MessageRow[]): {
  id: string;
  role: "user" | "assistant" | "system";
  parts: any[];
  metadata?: Record<string, unknown>;
}[] {
  const out: { id: string; role: "user" | "assistant" | "system"; parts: any[]; metadata?: Record<string, unknown> }[] = [];
  for (const row of rows) {
    if (row.role === "tool") continue; // tool results already live inside the assistant parts
    let parts: any[] = [];
    if (row.contentJson) {
      try {
        const parsed = JSON.parse(row.contentJson);
        parts = Array.isArray(parsed) ? parsed : [];
      } catch {
        parts = [];
      }
    }
    const metadata: Record<string, unknown> = {};
    if (row.inputTokens != null) metadata.inputTokens = row.inputTokens;
    if (row.outputTokens != null) metadata.outputTokens = row.outputTokens;
    if (row.reasoningMs != null) metadata.reasoningMs = row.reasoningMs;
    if (row.model) metadata.model = row.model;
    if (row.status && row.status !== "ok") metadata.status = row.status;
    if (row.createdAt) metadata.createdAt = row.createdAt;
    out.push({ id: row.id, role: row.role as any, parts, ...(Object.keys(metadata).length ? { metadata } : {}) });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool calls & file changes
// ─────────────────────────────────────────────────────────────────────────────

export function recordToolCall(input: {
  threadId: string;
  messageId?: string | null;
  toolCallId: string;
  name: string;
  args?: unknown;
  resultPreview?: string | null;
  isError?: boolean;
  diff?: unknown;
  approval?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
}): void {
  const existing = db
    .select()
    .from(chatToolCalls)
    .where(and(eq(chatToolCalls.threadId, input.threadId), eq(chatToolCalls.toolCallId, input.toolCallId)))
    .get() as ToolCallRow | undefined;
  const values = {
    threadId: input.threadId,
    messageId: input.messageId ?? null,
    toolCallId: input.toolCallId,
    name: input.name,
    argsJson: input.args === undefined ? null : JSON.stringify(input.args),
    resultPreview: input.resultPreview ?? null,
    isError: input.isError ?? false,
    diffJson: input.diff === undefined ? null : JSON.stringify(input.diff),
    approval: input.approval ?? null,
    startedAt: input.startedAt ?? null,
    endedAt: input.endedAt ?? null,
  };
  if (existing) {
    db.update(chatToolCalls).set(values).where(eq(chatToolCalls.id, existing.id)).run();
  } else {
    db.insert(chatToolCalls).values({ id: newId("tc"), ...values }).run();
  }
}

/**
 * Record files touched by a thread (FR-C4). The unique index on
 * (thread_id, path) makes this idempotent: a repeated file just gets updated,
 * so the "Changed files" card does not pile up duplicates.
 */
export function upsertThreadFile(input: {
  threadId: string;
  path: string;
  route?: string | null;
  op: FileOp;
  source: string;
  linesAdded?: number;
  linesRemoved?: number;
  /** Diff computed at write time (FR-C3). Trimmed so one large file does not
   *  bloat the DB — the card only needs a glimpse of the change. */
  diff?: string | null;
}): void {
  const now = new Date().toISOString();
  const diff = input.diff ? input.diff.slice(0, DIFF_STORE_LIMIT) : null;
  const existing = db
    .select()
    .from(chatThreadFiles)
    .where(and(eq(chatThreadFiles.threadId, input.threadId), eq(chatThreadFiles.path, input.path)))
    .get();
  if (existing) {
    db.update(chatThreadFiles)
      .set({
        op: input.op,
        source: input.source,
        route: input.route ?? existing.route,
        linesAdded: input.linesAdded ?? existing.linesAdded,
        linesRemoved: input.linesRemoved ?? existing.linesRemoved,
        diffJson: diff ?? existing.diffJson,
        lastSeenAt: now,
      })
      .where(eq(chatThreadFiles.id, existing.id))
      .run();
  } else {
    db.insert(chatThreadFiles)
      .values({
        id: newId("tf"),
        threadId: input.threadId,
        path: input.path,
        route: input.route ?? null,
        op: input.op,
        source: input.source,
        linesAdded: input.linesAdded ?? null,
        linesRemoved: input.linesRemoved ?? null,
        diffJson: diff,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .run();
  }
}

export const DIFF_STORE_LIMIT = 40_000;

// ─────────────────────────────────────────────────────────────────────────────
// Files read by a thread (FR-C12)
// ─────────────────────────────────────────────────────────────────────────────

/** Records that the thread read a file, together with the hash it saw. Unique
 *  per (thread, path): the latest read is what matters, because a write always
 *  requires a fresh read first (FR-C11). */
export function recordThreadRead(input: { threadId: string; path: string; hash: string }): void {
  const existing = db
    .select()
    .from(chatThreadReads)
    .where(and(eq(chatThreadReads.threadId, input.threadId), eq(chatThreadReads.path, input.path)))
    .get() as { id: string } | undefined;
  const now = new Date().toISOString();
  if (existing) {
    db.update(chatThreadReads).set({ hash: input.hash, readAt: now }).where(eq(chatThreadReads.id, existing.id)).run();
    return;
  }
  db.insert(chatThreadReads)
    .values({ id: newId("rd"), threadId: input.threadId, path: input.path, hash: input.hash, readAt: now })
    .run();
}

export function listThreadReads(threadId: string) {
  return db
    .select()
    .from(chatThreadReads)
    .where(eq(chatThreadReads.threadId, threadId))
    .orderBy(asc(chatThreadReads.readAt))
    .all();
}

/** Context summary (FR-B8 layer 2) stored on the thread so long conversations
 *  survive restarts intact. Previously the summary only lived in one turn's
 *  memory, so every following turn restarted summarization from zero — and the
 *  "context was compacted" marker appeared with no stored summary. */
export function setThreadSummary(threadId: string, summary: string | null): void {
  updateThread(threadId, { summary });
}

export function listThreadFiles(threadId: string) {
  return db
    .select()
    .from(chatThreadFiles)
    .where(eq(chatThreadFiles.threadId, threadId))
    .orderBy(asc(chatThreadFiles.firstSeenAt))
    .all();
}

export function listToolCalls(threadId: string): ToolCallRow[] {
  return db.select().from(chatToolCalls).where(eq(chatToolCalls.threadId, threadId)).all() as ToolCallRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Subagents created through the UI (FR-G2)
// ─────────────────────────────────────────────────────────────────────────────

export type SubagentRow = typeof subagents.$inferSelect;

export function getAppSubagents(): SubagentRow[] {
  return db.select().from(subagents).orderBy(asc(subagents.name)).all() as SubagentRow[];
}

export function getAppSubagent(id: string): SubagentRow | undefined {
  return db.select().from(subagents).where(eq(subagents.id, id)).get() as SubagentRow | undefined;
}

export function getAppSubagentByName(name: string): SubagentRow | undefined {
  return db.select().from(subagents).where(eq(subagents.name, name)).get() as SubagentRow | undefined;
}

export function createAppSubagent(input: {
  name: string;
  description: string;
  tools: string[];
  instructions: string;
  maxSteps?: number | null;
}): SubagentRow {
  const now = new Date().toISOString();
  const row = {
    id: newId("sub"),
    name: input.name,
    description: input.description,
    toolsJson: JSON.stringify(input.tools),
    instructions: input.instructions,
    maxSteps: input.maxSteps ?? null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(subagents).values(row).run();
  return getAppSubagent(row.id)!;
}

export function updateAppSubagent(
  id: string,
  patch: Partial<{ name: string; description: string; tools: string[]; instructions: string; maxSteps: number | null }>,
): SubagentRow | undefined {
  const existing = getAppSubagent(id);
  if (!existing) return undefined;
  const values: Partial<typeof subagents.$inferInsert> = { updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.tools !== undefined) values.toolsJson = JSON.stringify(patch.tools);
  if (patch.instructions !== undefined) values.instructions = patch.instructions;
  if (patch.maxSteps !== undefined) values.maxSteps = patch.maxSteps;
  db.update(subagents).set(values).where(eq(subagents.id, id)).run();
  return getAppSubagent(id);
}

export function deleteAppSubagent(id: string): boolean {
  const existing = getAppSubagent(id);
  if (!existing) return false;
  db.delete(subagents).where(eq(subagents.id, id)).run();
  return true;
}
