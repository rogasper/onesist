/**
 * Chat threads over MCP: list a project's threads, read one page by page, and
 * never read a thread that belongs to another project.
 *
 *   bun test src/server/mcp/thread-tools.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-mcp-thread-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { mcpToolFromAi } = await import("./from-ai-tool");
const { buildThreadTools } = await import("./thread-tools");

let mine = "";
let theirs = "";
beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-mcp-thread-ws-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-a', 'A', ${root})`);
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-b', 'B', ${root})`);
  mine = store.createThread({ projectId: "p-a", title: "Diskusi ERD" } as any).id as string;
  theirs = store.createThread({ projectId: "p-b", title: "Rahasia B" } as any).id as string;
  for (let i = 1; i <= 25; i++) {
    store.appendMessage({ threadId: mine, role: i % 2 ? "user" : "assistant", parts: [{ type: "text", text: `pesan ${i}` }], id: `m${i}` });
  }
  store.appendMessage({ threadId: theirs, role: "user", parts: [{ type: "text", text: "isi rahasia" }], id: "x1" });
});

const tools = () => {
  const t = buildThreadTools("p-a");
  return { list: mcpToolFromAi("onesist_thread_list", t.threadList), read: mcpToolFromAi("onesist_thread_read", t.threadRead) };
};

test("the list shows this project's threads only", async () => {
  const text = await tools().list.call({});
  expect(text).toContain(mine);
  expect(text).toContain("Diskusi ERD");
  expect(text).not.toContain("Rahasia B");
});

test("a read returns the newest page and says how to get the older one", async () => {
  const text = await tools().read.call({ thread_id: mine });
  expect(text).toContain("pesan 25");
  expect(text).toContain("pesan 6");
  expect(text).not.toContain("pesan 5\n");
  expect(text).toMatch(/before_seq=\d+/);
});

test("before_seq pages back to the oldest messages and then stops offering more", async () => {
  const first = await tools().read.call({ thread_id: mine });
  const cursor = Number(first.match(/before_seq=(\d+)/)![1]);
  const older = await tools().read.call({ thread_id: mine, before_seq: cursor });
  expect(older).toContain("pesan 1");
  expect(older).not.toMatch(/before_seq=/);
});

test("a thread of another project is refused without its content", async () => {
  await expect(tools().read.call({ thread_id: theirs })).rejects.toThrow("tidak ada di project ini");
});

test("limit above the maximum is refused by the schema", async () => {
  await expect(tools().read.call({ thread_id: mine, limit: 500 })).rejects.toThrow("Argumen tidak valid");
});
