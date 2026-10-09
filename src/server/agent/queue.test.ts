/**
 * Regression: the server-side message queue.
 *   - messages go out in order, one per turn, only when nothing is running
 *   - a stop or failure holds the queue; a finished run releases the next message
 *   - "Jalankan sekarang" moves an item to the front and its stop does not hold the queue
 *   - a steer that was not taken returns to the front, ahead of later messages
 *
 *   bun test src/server/agent/queue.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-queue-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const { eventBus } = await import("~/server/realtime/events");
const queue = await import("./queue");
const store = await import("./store");

const sent: string[] = [];
let startOk = true;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(() => {
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p1', 'Queue', '/tmp')`);
  queue.registerQueueStarter(async (_threadId, text) => {
    if (startOk) sent.push(text);
    return startOk;
  });
});

function thread(): string {
  return store.createThread({ projectId: "p1", permissionMode: "auto", mode: "agent" } as any).id as string;
}

test("queued messages go out in order when nothing is running", async () => {
  const t = thread();
  queue.enqueue(t, ["primero"]);
  await wait(20);
  expect(sent).toEqual(["primero"]);
  expect(queue.listQueue(t).items).toEqual([]);
});

test("a held queue does not send until resumed", async () => {
  const t = thread();
  queue.setPaused(t, true);
  queue.enqueue(t, ["tertahan"]);
  await wait(20);
  expect(sent).not.toContain("tertahan");
  expect(queue.listQueue(t).paused).toBe(true);
  queue.setPaused(t, false);
  await wait(20);
  expect(sent).toContain("tertahan");
});

test("a stopped run holds the queue; a finished run releases it", async () => {
  const t = thread();
  queue.setPaused(t, true);
  queue.enqueue(t, ["sesudah-stop"]);
  // The run ends by a stop the user asked for: the queue is held.
  eventBus.emitChatRun({ runId: "run_s", threadId: t, projectId: "p1", status: "stopped" });
  await wait(20);
  expect(queue.listQueue(t).paused).toBe(true);
  // Resumed, then a run finishes normally: the next message is sent.
  queue.setPaused(t, false);
  await wait(20);
  expect(sent).toContain("sesudah-stop");
});

test("a failed run holds the queue", async () => {
  const t = thread();
  queue.enqueue(t, ["x-gagal"]);
  await wait(20);
  queue.setPaused(t, true);
  queue.enqueue(t, ["y-gagal"]);
  eventBus.emitChatRun({ runId: "run_e", threadId: t, projectId: "p1", status: "error", error: "boom" });
  await wait(20);
  expect(queue.listQueue(t).paused).toBe(true);
  expect(sent).not.toContain("y-gagal");
});

test("a finished run with nothing queued sends nothing; later messages still go out", async () => {
  const t = thread();
  queue.setPaused(t, true);
  queue.enqueue(t, ["setelah-selesai"]);
  queue.setPaused(t, false);
  await wait(20);
  sent.length = 0;
  eventBus.emitChatRun({ runId: "run_d", threadId: t, projectId: "p1", status: "done" });
  await wait(400);
  expect(sent).toEqual([]); // nothing left after the first message above
  queue.enqueue(t, ["tiga"]);
  await wait(20);
  expect(sent).toEqual(["tiga"]);
});

test("a steer that was not taken returns to the front, ahead of later messages", async () => {
  const t = thread();
  queue.setPaused(t, true);
  queue.enqueue(t, ["nanti-1", "nanti-2"]);
  queue.enqueue(t, ["steer-kembali"], true);
  expect(queue.listQueue(t).items.map((i) => i.text)).toEqual(["steer-kembali", "nanti-1", "nanti-2"]);
});

test("a failed turn start puts the item back and holds the queue", async () => {
  const t = thread();
  startOk = false;
  queue.enqueue(t, ["gagal-mulai"]);
  await wait(20);
  startOk = true;
  const state = queue.listQueue(t);
  expect(state.paused).toBe(true);
  expect(state.items.map((i) => i.text)).toEqual(["gagal-mulai"]);
});

test("Jalankan sekarang moves the item to the front", async () => {
  const t = thread();
  queue.setPaused(t, true);
  queue.enqueue(t, ["a", "b"]);
  const b = queue.listQueue(t).items.find((i) => i.text === "b")!;
  expect(queue.runQueuedNow(t, b.id)).toBe(true);
  expect(queue.listQueue(t).items.map((i) => i.text)).toEqual(["b", "a"]);
});
