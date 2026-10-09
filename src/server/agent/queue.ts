/**
 * The message queue of each thread, held on the server.
 *
 * Messages queued while a run works are sent by the server, one per turn, when the
 * run ends. This works even when no client is open on the thread, and every open
 * view shows the same queue (it is re-read on `chat:queue`).
 *
 * Pause rule: a run that is stopped or fails holds the queue, so the next queued
 * message does not go out on its own after the user interrupted something. The one
 * exception is "Jalankan sekarang", which stops the run on purpose to send the
 * promoted message next.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { chatQueue, chatThreads } from "~/server/db/schema";
import { eventBus } from "~/server/realtime/events";
import { getRunForThread, stopRun } from "./run-registry";
import { newId } from "./store";

export interface QueueItem {
  id: string;
  text: string;
}

export interface QueueState {
  items: QueueItem[];
  paused: boolean;
}

/** Starts one turn for a thread with the given text. Returns false when the turn
 *  could not start (no provider, bad input). Registered by the chat route so this
 *  module does not depend on route code. */
type TurnStarter = (threadId: string, text: string) => Promise<boolean>;
let startTurn: TurnStarter | null = null;

export function registerQueueStarter(fn: TurnStarter): void {
  startTurn = fn;
}

/** Threads where the next stop was asked for by "Jalankan sekarang": that stop must
 *  not hold the queue. */
const intentionalStops = new Set<string>();
/** Threads with a send in progress, so two triggers cannot start two turns. */
const sending = new Set<string>();

export function listQueue(threadId: string): QueueState {
  const items = db
    .select({ id: chatQueue.id, text: chatQueue.text })
    .from(chatQueue)
    .where(eq(chatQueue.threadId, threadId))
    .orderBy(asc(chatQueue.position))
    .all();
  const thread = db.select({ paused: chatThreads.queuePaused }).from(chatThreads).where(eq(chatThreads.id, threadId)).get();
  return { items, paused: !!thread?.paused };
}

function changed(threadId: string): void {
  eventBus.emitChatQueue({ threadId });
}

/**
 * Adds messages to the queue, in the order given. `front` puts them ahead of
 * everything already queued (used when a steer was not taken and must be sent next).
 * If nothing is running and the queue is not held, the first one is sent now.
 */
export function enqueue(threadId: string, texts: string[], front = false): string[] {
  const clean = texts.map((t) => t.trim()).filter(Boolean);
  if (!clean.length) return [];
  const ids = clean.map(() => newId("q"));
  const existing = db
    .select({ position: chatQueue.position })
    .from(chatQueue)
    .where(eq(chatQueue.threadId, threadId))
    .orderBy(front ? asc(chatQueue.position) : desc(chatQueue.position))
    .limit(1)
    .get();
  const edge = existing?.position ?? 0;
  clean.forEach((text, i) => {
    const position = front ? edge - clean.length + i : edge + 1 + i;
    db.insert(chatQueue).values({ id: ids[i], threadId, position, text }).run();
  });
  changed(threadId);
  void kick(threadId);
  return ids;
}

export function removeQueued(threadId: string, id: string): boolean {
  const res = db.delete(chatQueue).where(and(eq(chatQueue.id, id), eq(chatQueue.threadId, threadId))).run();
  if (res.changes) changed(threadId);
  return res.changes > 0;
}

/** Moves one item to the front of the queue and stops the active run, if any, so
 *  the item is sent next. The stop is marked intentional, so it does not hold the queue. */
export function runQueuedNow(threadId: string, id: string): boolean {
  const first = db
    .select({ position: chatQueue.position })
    .from(chatQueue)
    .where(eq(chatQueue.threadId, threadId))
    .orderBy(asc(chatQueue.position))
    .limit(1)
    .get();
  const res = db
    .update(chatQueue)
    .set({ position: (first?.position ?? 0) - 1 })
    .where(and(eq(chatQueue.id, id), eq(chatQueue.threadId, threadId)))
    .run();
  if (!res.changes) return false;
  changed(threadId);
  const run = getRunForThread(threadId);
  if (run) {
    intentionalStops.add(threadId);
    stopRun(run.runId);
  } else {
    void kick(threadId);
  }
  return true;
}

export function setPaused(threadId: string, paused: boolean): void {
  db.update(chatThreads).set({ queuePaused: paused }).where(eq(chatThreads.id, threadId)).run();
  changed(threadId);
  if (!paused) void kick(threadId);
}

/**
 * Sends the head of the queue if nothing is running and the queue is not held.
 * The item leaves the queue before the turn starts, so it cannot be sent twice. If
 * the turn cannot start, the item goes back to the front and the queue is held.
 */
export async function kick(threadId: string): Promise<void> {
  if (!startTurn || sending.has(threadId)) return;
  if (getRunForThread(threadId)) return;
  const thread = db.select({ paused: chatThreads.queuePaused }).from(chatThreads).where(eq(chatThreads.id, threadId)).get();
  if (thread?.paused) return;
  const head = db
    .select({ id: chatQueue.id, text: chatQueue.text, position: chatQueue.position })
    .from(chatQueue)
    .where(eq(chatQueue.threadId, threadId))
    .orderBy(asc(chatQueue.position))
    .limit(1)
    .get();
  if (!head) return;

  sending.add(threadId);
  db.delete(chatQueue).where(eq(chatQueue.id, head.id)).run();
  changed(threadId);
  try {
    const ok = await startTurn(threadId, head.text);
    if (!ok) {
      db.insert(chatQueue).values({ id: head.id, threadId, position: head.position, text: head.text }).run();
      db.update(chatThreads).set({ queuePaused: true }).where(eq(chatThreads.id, threadId)).run();
      changed(threadId);
    }
  } catch (err) {
    console.error("[queue] could not start the queued turn:", (err as Error)?.message ?? err);
    db.insert(chatQueue).values({ id: head.id, threadId, position: head.position, text: head.text }).run();
    db.update(chatThreads).set({ queuePaused: true }).where(eq(chatThreads.id, threadId)).run();
    changed(threadId);
  } finally {
    sending.delete(threadId);
  }
}

/** A run ended: hold the queue on a stop or failure (unless the stop was intentional),
 *  otherwise send the next queued message. */
function onRunEnded(event: { data: { threadId: string; status: string } }): void {
  const { threadId, status } = event.data;
  const intentional = intentionalStops.delete(threadId);
  if (status === "done" || intentional) {
    // After the run has been removed from the registry, so the next turn can start.
    setTimeout(() => void kick(threadId), 300);
    return;
  }
  setPaused(threadId, true);
}

eventBus.on("chat:run", onRunEnded);
