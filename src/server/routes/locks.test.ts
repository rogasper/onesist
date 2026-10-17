/**
 * The lock routes and the SSE stream that keeps a window's locks alive: a claim answered
 * per window, a refusal for a document another window writes, and the lock released (with
 * a lock:changed event) when the holder's stream closes.
 *
 *   bun test src/server/routes/locks.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-locks-")), "data.db");

const { router: locksRouter } = await import("./locks");
const { router: sseRouter } = await import("./sse");
const { eventBus } = await import("~/server/realtime/events");
const { docLocks } = await import("~/server/realtime/doc-locks");

const BASE = "http://127.0.0.1:4321";
const post = async (p: string, body: unknown) => {
  const res = await locksRouter.handle(new Request(`${BASE}/api/${p}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res!.status, body: await res!.json() };
};
/** Opens an SSE stream for `client`; the returned function closes it like a closed window. */
async function openStream(client: string): Promise<() => Promise<void>> {
  const ac = new AbortController();
  const res = await sseRouter.handle(new Request(`${BASE}/api/events?ticket=${eventBus.createTicket()}&client=${client}`, { signal: ac.signal }));
  expect(res!.status).toBe(200);
  return async () => {
    ac.abort();
    await Bun.sleep(10);
  };
}

test("bad input is refused", async () => {
  expect((await post("locks/claim", { key: "", clientId: "abcdefgh12" })).status).toBe(400);
  expect((await post("locks/claim", { key: "fsd:1", clientId: "../x" })).status).toBe(400);
});

test("a window must have its stream open to claim", async () => {
  expect((await post("locks/claim", { key: "fsd:a", clientId: "noStream0001" })).body).toEqual({ ok: false, reason: "not_connected" });
});

test("two windows: the second is refused until the first window's stream closes", async () => {
  const closeA = await openStream("windowAAAA01");
  const closeB = await openStream("windowBBBB01");
  const changed: string[] = [];
  const onChange = (e: any) => changed.push(e.data.key);
  eventBus.on("lock:changed", onChange);

  expect((await post("locks/claim", { key: "fsd:x", clientId: "windowAAAA01" })).body).toEqual({ ok: true });
  expect((await post("locks/claim", { key: "fsd:x", clientId: "windowBBBB01" })).body).toEqual({ ok: false, reason: "held" });

  await closeA();
  expect(docLocks.holderOf("fsd:x")).toBeUndefined();
  expect(changed).toContain("fsd:x");
  expect((await post("locks/claim", { key: "fsd:x", clientId: "windowBBBB01" })).body).toEqual({ ok: true });

  expect((await post("locks/release", { key: "fsd:x", clientId: "windowBBBB01" })).body).toEqual({ ok: true });
  eventBus.off("lock:changed", onChange);
  await closeB();
});
