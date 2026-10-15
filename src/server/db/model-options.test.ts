/**
 * A chat thread stores the model options picked for it.
 *
 *   bun test src/server/db/model-options.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-model-options-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");

test("a thread stores and returns its model options", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-model-options-ws-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-model-options', 'Opsi', ${root})`);
  const thread = store.createThread({ projectId: "p-model-options", title: "Varian" } as any);
  expect(thread.modelOptionsJson ?? null).toBeNull();
  store.updateThread(thread.id, { modelOptionsJson: '{"variant":"high"}' });
  expect(store.getThread(thread.id)?.modelOptionsJson).toBe('{"variant":"high"}');
});
