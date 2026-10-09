/**
 * Undo and reapply for the file changes of one assistant turn.
 *
 * Every change the agent makes is stored with its content before and after
 * (chat_checkpoints). A turn's changes can then be put back: undo restores what
 * was there before the turn, reapply restores what the turn wrote.
 *
 * The state of each file is decided from the disk, not from a flag:
 *   applied      — the file is as the turn left it; undo is possible
 *   reverted     — the file is as before the turn; reapply is possible
 *   changed      — something else changed it since the turn; never overwritten
 *   unverifiable — the content of one side was not captured; cannot be checked
 *
 * Undo and reapply are all-or-nothing for the whole turn: if any file is not in the
 * state the action needs, nothing is written, and the conflicts are returned. A
 * caller can ask for specific files instead; then the others are reported as skipped.
 */
import fs from "node:fs";
import path from "node:path";
import { and, asc, eq, isNull, max } from "drizzle-orm";
import { db } from "~/server/db/client";
import { chatCheckpoints } from "~/server/db/schema";
import { resolveInRoot } from "./paths";
import { newId } from "./store";

/** Larger contents are not kept: they would bloat the database, and their state
 *  could not be compared cheaply anyway. */
export const CHECKPOINT_TEXT_LIMIT = 1024 * 1024;

/** One side of a change. */
export type Side = { kind: "absent" } | { kind: "text"; text: string } | { kind: "unknown" };

export type FileState = "applied" | "reverted" | "changed" | "unverifiable";

export interface TurnFile {
  path: string;
  state: FileState;
  canUndo: boolean;
  canReapply: boolean;
}

function toSide(value: string | null | undefined): Side {
  if (value === undefined) return { kind: "unknown" };
  if (value === null) return { kind: "absent" };
  if (value.length > CHECKPOINT_TEXT_LIMIT) return { kind: "unknown" };
  return { kind: "text", text: value };
}

function fromRow(kind: string, text: string | null): Side {
  if (kind === "absent") return { kind: "absent" };
  if (kind === "text" && text != null) return { kind: "text", text };
  return { kind: "unknown" };
}

function sameSide(a: Side, b: Side): boolean {
  if (a.kind === "unknown" || b.kind === "unknown") return false;
  if (a.kind === "absent" || b.kind === "absent") return a.kind === b.kind;
  return a.text === b.text;
}

/** The file as it is on disk now. */
function currentSide(root: string, rel: string): Side {
  const { abs } = resolveInRoot(root, rel);
  if (!fs.existsSync(abs)) return { kind: "absent" };
  try {
    const stat = fs.statSync(abs);
    if (stat.size > CHECKPOINT_TEXT_LIMIT) return { kind: "unknown" };
    return { kind: "text", text: fs.readFileSync(abs, "utf-8") };
  } catch {
    return { kind: "unknown" };
  }
}

/** Stores the before and after of one change made by a run. */
export function recordCheckpoint(input: {
  threadId: string;
  runId: string;
  path: string;
  before: string | null | undefined;
  after: string | null | undefined;
}): void {
  const before = toSide(input.before);
  const after = toSide(input.after);
  const seq =
    ((db.select({ n: max(chatCheckpoints.seq) }).from(chatCheckpoints).where(eq(chatCheckpoints.threadId, input.threadId)).get() as
      | { n: number | null }
      | undefined)?.n ?? 0) + 1;
  db.insert(chatCheckpoints)
    .values({
      id: newId("ckp"),
      threadId: input.threadId,
      runId: input.runId,
      messageId: null,
      seq,
      path: input.path,
      beforeKind: before.kind,
      beforeText: before.kind === "text" ? before.text : null,
      afterKind: after.kind,
      afterText: after.kind === "text" ? after.text : null,
    })
    .run();
}

/** Ties a run's checkpoints to the assistant message that was saved for it. */
export function attributeCheckpoints(runId: string, messageId: string): void {
  db.update(chatCheckpoints)
    .set({ messageId })
    .where(and(eq(chatCheckpoints.runId, runId), isNull(chatCheckpoints.messageId)))
    .run();
}

interface FileSpan {
  path: string;
  before: Side;
  after: Side;
}

/** The changes of one turn, one entry per file: the state before the turn's first
 *  change to it and the state after its last. */
function spansOf(threadId: string, messageId: string): FileSpan[] {
  const rows = db
    .select()
    .from(chatCheckpoints)
    .where(and(eq(chatCheckpoints.threadId, threadId), eq(chatCheckpoints.messageId, messageId)))
    .orderBy(asc(chatCheckpoints.seq))
    .all();
  const byPath = new Map<string, FileSpan>();
  for (const row of rows) {
    const existing = byPath.get(row.path);
    const after = fromRow(row.afterKind, row.afterText);
    if (!existing) {
      byPath.set(row.path, { path: row.path, before: fromRow(row.beforeKind, row.beforeText), after });
    } else {
      existing.after = after;
    }
  }
  return [...byPath.values()];
}

/** The state of every file a turn changed. */
export function turnChanges(threadId: string, root: string, messageId: string): TurnFile[] {
  return spansOf(threadId, messageId).map((span) => {
    const current = currentSide(root, span.path);
    let state: FileState;
    if (span.before.kind === "unknown" || span.after.kind === "unknown" || current.kind === "unknown") {
      state = "unverifiable";
    } else if (sameSide(current, span.after)) {
      state = "applied";
    } else if (sameSide(current, span.before)) {
      state = "reverted";
    } else {
      state = "changed";
    }
    return { path: span.path, state, canUndo: state === "applied", canReapply: state === "reverted" };
  });
}

export type TurnAction = "undo" | "reapply";

export type TurnActionResult =
  | { ok: true; done: string[]; skipped: { path: string; state: FileState }[] }
  | { ok: false; conflicts: { path: string; state: FileState }[] };

function writeSide(abs: string, side: Side): void {
  if (side.kind === "absent") {
    fs.rmSync(abs, { force: true });
    return;
  }
  if (side.kind === "text") {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, side.text, "utf-8");
  }
}

/**
 * Undoes or reapplies a turn's changes.
 *
 * Without `paths`, every file of the turn must be in the state the action needs;
 * otherwise nothing is written. With `paths`, only those files are considered and
 * the rest are reported as skipped.
 */
export function applyTurnAction(
  threadId: string,
  root: string,
  messageId: string,
  action: TurnAction,
  paths?: string[],
): TurnActionResult {
  const spans = spansOf(threadId, messageId);
  const needed: FileState = action === "undo" ? "applied" : "reverted";
  const states = new Map(turnChanges(threadId, root, messageId).map((f) => [f.path, f.state]));
  const selected = paths ? spans.filter((s) => paths.includes(s.path)) : spans;

  const blocked = selected.filter((s) => states.get(s.path) !== needed).map((s) => ({ path: s.path, state: states.get(s.path)! }));
  if (!paths && blocked.length) return { ok: false, conflicts: blocked };

  const ready = selected.filter((s) => states.get(s.path) === needed);
  for (const span of ready) {
    const { abs } = resolveInRoot(root, span.path);
    writeSide(abs, action === "undo" ? span.before : span.after);
  }
  return { ok: true, done: ready.map((s) => s.path), skipped: blocked };
}
