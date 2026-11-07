/**
 * Follow-up suggestions are stored beside the message, not inside its parts
 * (issue #55): the model must never read them again, and the transcript must
 * still find them after a reload.
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-suggest-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("./store");

let threadId = "";
beforeAll(() => {
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-suggest', 'Suggest', ${os.tmpdir()})`);
  threadId = store.createThread({ projectId: "p-suggest", permissionMode: "auto", mode: "agent", title: "Saran" } as any).id as string;
});

test("suggestions are stored outside contentJson and come back as metadata", () => {
  const row = store.appendMessage({
    threadId,
    role: "assistant",
    id: "s-a1",
    parts: [{ type: "text", text: "Selesai." }],
    suggestions: ["Buat test", "Rapikan docs"],
  });
  expect(row.suggestionsJson).toBe(JSON.stringify(["Buat test", "Rapikan docs"]));
  expect(row.contentJson).not.toContain("suggestions");

  const [message] = store.toUIMessages([row]);
  expect(message.metadata?.suggestions).toEqual(["Buat test", "Rapikan docs"]);
  expect(store.messageText(message.parts)).toBe("Selesai.");
});

test("an answer without suggestions has no metadata key", () => {
  const row = store.appendMessage({
    threadId,
    role: "assistant",
    id: "s-a2",
    parts: [{ type: "text", text: "Biasa." }],
  });
  expect(row.suggestionsJson).toBeNull();
  const [message] = store.toUIMessages([row]);
  expect(message.metadata && "suggestions" in message.metadata).toBe(false);
});
