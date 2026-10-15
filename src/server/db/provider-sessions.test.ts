/**
 * Each CLI provider keeps its own session for a thread, and how far into the
 * conversation that session has seen.
 *
 *   bun test src/server/db/provider-sessions.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-provider-sessions-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");

let threadId = "";
beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-provider-sessions-ws-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-provider-sessions', 'Sesi', ${root})`);
  threadId = store.createThread({ projectId: "p-provider-sessions", title: "Pindah" } as any).id;
});

test("a provider has no session until one is saved; each provider has its own", () => {
  expect(store.getProviderSession(threadId, "prov-a")).toBeNull();
  store.saveProviderSession(threadId, "prov-a", "ses_a", 3);
  store.saveProviderSession(threadId, "prov-b", "ses_b", 5);
  expect(store.getProviderSession(threadId, "prov-a")).toEqual({ sessionId: "ses_a", knownUptoSeq: 3 });
  expect(store.getProviderSession(threadId, "prov-b")).toEqual({ sessionId: "ses_b", knownUptoSeq: 5 });
});

test("saving again replaces the session; marking seen only ever moves forward", () => {
  store.saveProviderSession(threadId, "prov-a", "ses_a2", 4);
  expect(store.getProviderSession(threadId, "prov-a")).toEqual({ sessionId: "ses_a2", knownUptoSeq: 4 });
  store.markProviderSessionSeen(threadId, "prov-a", 9);
  store.markProviderSessionSeen(threadId, "prov-a", 6);
  expect(store.getProviderSession(threadId, "prov-a")!.knownUptoSeq).toBe(9);
  store.markProviderSessionSeen(threadId, "prov-tidak-ada", 9); // no row: nothing happens
  expect(store.getProviderSession(threadId, "prov-tidak-ada")).toBeNull();
});

test("latestSeq is the newest message's seq, 0 for an empty thread", () => {
  const empty = store.createThread({ projectId: "p-provider-sessions", title: "Kosong" } as any).id;
  expect(store.latestSeq(empty)).toBe(0);
  store.appendMessage({ threadId: empty, role: "user", id: "provider-sessions-m1", parts: [{ type: "text", text: "hai" }] });
  store.appendMessage({ threadId: empty, role: "assistant", id: "provider-sessions-m2", parts: [{ type: "text", text: "halo" }] });
  expect(store.latestSeq(empty)).toBe(2);
});

test("deleting a thread deletes its provider sessions too", () => {
  const t = store.createThread({ projectId: "p-provider-sessions", title: "Hapus" } as any).id;
  store.saveProviderSession(t, "prov-a", "ses_x", 1);
  store.deleteThread(t);
  expect(store.getThread(t)).toBeUndefined();
  expect(store.getProviderSession(t, "prov-a")).toBeNull();
});
