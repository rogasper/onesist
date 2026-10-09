/**
 * Regression: the SSE route must forward every chat event the server emits.
 * `chat:steer` was emitted but missing from the route's list, so the client never
 * learned that a steer had been taken. This test goes through the real route.
 *
 *   bun test src/server/realtime/chat-events.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// The DB client opens its file at import time, so point it at a temp file first.
process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-sse-")), "data.db");

const { handleApiRequest } = await import("~/server/api-router");
const { eventBus } = await import("~/server/realtime/events");

/** Opens the SSE stream the way the browser does: ticket first, then the stream. */
async function openEvents() {
  const ticketRes = await handleApiRequest(new Request("http://localhost/api/events/ticket", { method: "POST" }));
  const { ticket } = (await ticketRes!.json()) as { ticket: string };
  const controller = new AbortController();
  const res = await handleApiRequest(new Request(`http://localhost/api/events?ticket=${ticket}`, { signal: controller.signal }));
  return { res: res!, controller };
}

/** Reads the stream until `needle` appears, or fails after `ms`. */
async function readUntil(res: Response, needle: string, ms = 3000): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const deadline = Date.now() + ms;
  while (!text.includes(needle)) {
    if (Date.now() > deadline) throw new Error(`timeout waiting for "${needle}"; got: ${text.slice(0, 200)}`);
    const { value, done } = await Promise.race([
      reader.read(),
      new Promise<{ value?: undefined; done: true }>((r) => setTimeout(() => r({ done: true }), 100)),
    ]);
    if (value) text += decoder.decode(value, { stream: true });
    if (done && !value) continue;
  }
  await reader.cancel().catch(() => {});
  return text;
}

test("chat:steer reaches the client over SSE", async () => {
  const { res, controller } = await openEvents();
  // Emitting after the stream is open: the route only forwards live events.
  queueMicrotask(() => eventBus.emitChatSteer({ threadId: "thr_t", messageIds: ["m1"] }));
  const text = await readUntil(res, "event: chat:steer");
  expect(text).toContain('"threadId":"thr_t"');
  expect(text).toContain('"messageIds":["m1"]');
  controller.abort();
});

test("chat:run still reaches the client over SSE", async () => {
  const { res, controller } = await openEvents();
  queueMicrotask(() =>
    eventBus.emitChatRun({ runId: "run_1", threadId: "thr_t", projectId: "p1", status: "done" }),
  );
  const text = await readUntil(res, "event: chat:run");
  expect(text).toContain('"status":"done"');
  controller.abort();
});

test("chat:approval-resolved reaches the client, so a card is removed without polling", async () => {
  const { res, controller } = await openEvents();
  queueMicrotask(() => eventBus.emitChatApprovalResolved({ threadId: "thr_t", toolCallId: "call_9" }));
  const text = await readUntil(res, "event: chat:approval-resolved");
  expect(text).toContain('"toolCallId":"call_9"');
  controller.abort();
});
