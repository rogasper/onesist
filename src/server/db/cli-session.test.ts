/**
 * A chat thread remembers the CLI session it runs in, so the next turn continues it.
 *
 *   bun test src/server/db/cli-session.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-cli-session-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");

test("a thread stores and returns its CLI session id", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-cli-session-ws-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-cli-session', 'CLI', ${root})`);
  const thread = store.createThread({ projectId: "p-cli-session", title: "OpenCode" } as any);
  expect(thread.cliSessionId ?? null).toBeNull();
  store.updateThread(thread.id, { cliSessionId: "ses_abc" });
  expect(store.getThread(thread.id)?.cliSessionId).toBe("ses_abc");
});
