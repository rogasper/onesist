/**
 * Regression: a thread view loads its newest page of messages, and older pages
 * follow from a cursor without skipping or repeating anything.
 *
 *   bun test src/server/agent/message-page.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-page-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("./store");

db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-page', 'Page', '/tmp')`);
const threadId = store.createThread({ projectId: "p-page", permissionMode: "auto", mode: "agent" } as any).id as string;
const ids: string[] = [];
for (let i = 0; i < 120; i++) {
  const id = `m${String(i).padStart(3, "0")}`;
  ids.push(id);
  store.appendMessage({ threadId, role: i % 2 ? "assistant" : "user", parts: [{ type: "text", text: `pesan ${i}` }], id });
}

test("the newest page holds the last messages in order, and says more exist", () => {
  const page = store.listMessagePage(threadId, { limit: 50 });
  expect(page.rows.map((r) => r.id)).toEqual(ids.slice(70));
  expect(page.hasMore).toBe(true);
});

test("older pages follow from a cursor, without gaps or repeats", () => {
  const seen: string[] = [];
  let cursor: number | undefined;
  let page = store.listMessagePage(threadId, { limit: 50 });
  for (;;) {
    seen.unshift(...page.rows.map((r) => r.id));
    if (!page.hasMore) break;
    cursor = store.messageSeq(threadId, page.rows[0].id) ?? undefined;
    page = store.listMessagePage(threadId, { beforeSeq: cursor, limit: 50 });
  }
  expect(seen).toEqual(ids);
});

test("a cursor from another thread finds nothing", () => {
  const other = store.createThread({ projectId: "p-page", permissionMode: "auto", mode: "agent" } as any).id as string;
  expect(store.messageSeq(other, ids[0])).toBeNull();
});

test("a thread shorter than one page has nothing older", () => {
  const short = store.createThread({ projectId: "p-page", permissionMode: "auto", mode: "agent" } as any).id as string;
  store.appendMessage({ threadId: short, role: "user", parts: [{ type: "text", text: "satu" }], id: "solo" });
  const page = store.listMessagePage(short);
  expect(page.rows.length).toBe(1);
  expect(page.hasMore).toBe(false);
});
