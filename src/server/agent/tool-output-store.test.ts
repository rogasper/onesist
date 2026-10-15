/**
 * A message saved with a huge tool output keeps at most the store limit of it.
 *
 *   bun test src/server/agent/tool-output-store.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-tool-output-store-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { TOOL_OUTPUT_STORE_MAX_CHARS } = await import("~/server/agent/tool-output");

test("appendMessage stores a capped tool output with a truncation marker", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-tool-output-store-ws-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-tool-output', 'Output', ${root})`);
  const thread = store.createThread({ projectId: "p-tool-output", title: "Besar" } as any);
  store.appendMessage({
    threadId: thread.id,
    role: "assistant",
    id: "tool-output-store-m1",
    parts: [{ type: "tool-bash", toolCallId: "t1", output: "y".repeat(TOOL_OUTPUT_STORE_MAX_CHARS * 2) }],
  });
  const row = store.listMessages(thread.id).find((r) => r.id === "tool-output-store-m1")!;
  expect(row.contentJson!.length).toBeLessThan(TOOL_OUTPUT_STORE_MAX_CHARS + 1_000);
  const parts = JSON.parse(row.contentJson!);
  expect(parts[0].outputTruncated).toEqual({ originalChars: TOOL_OUTPUT_STORE_MAX_CHARS * 2 });
});
