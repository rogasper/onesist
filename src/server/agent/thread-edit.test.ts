/**
 * Regression: resend from a message and fork a thread.
 *   - resend removes the message and everything after it, and undoes the file
 *     changes of the removed turns
 *   - a file changed by the user since a removed turn blocks the resend (409), and
 *     with `conversationOnly` the conversation is cut but the file is left alone
 *   - a run in progress blocks the resend; a summarised thread cannot be resent
 *   - fork copies the conversation up to the message, not beyond, and leaves the
 *     original untouched
 *
 *   bun test src/server/agent/thread-edit.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-edit-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("./store");
const cp = await import("./checkpoints");
const reg = await import("./run-registry");
const edit = await import("./thread-edit");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-edit-ws-"));
let threadId = "";
beforeAll(() => {
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-edit', 'Edit', ${root})`);
  threadId = store.createThread({ projectId: "p-edit", permissionMode: "auto", mode: "agent", title: "Uji edit" } as any).id as string;
});

const text = (t: string) => [{ type: "text", text: t }];
function msg(role: "user" | "assistant", id: string, t: string) {
  store.appendMessage({ threadId, role, parts: text(t), id });
}
function fileTurn(messageId: string, runId: string, rel: string, before: string | null, after: string) {
  cp.recordCheckpoint({ threadId, runId, path: rel, before, after });
  cp.attributeCheckpoints(runId, messageId);
  const abs = path.join(root, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, after, "utf-8");
}
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

test("resend removes the message and what follows, and undoes the turns' file changes", () => {
  msg("user", "e-u1", "buat berkas satu");
  msg("assistant", "e-a1", "dibuat");
  fileTurn("e-a1", "run_e1", "output/e1.md", null, "satu");
  msg("user", "e-u2", "lanjut");
  msg("assistant", "e-a2", "selesai lanjut");

  const res = edit.truncateFromMessage({ threadId, root, messageId: "e-u1", resetFiles: true, conversationOnly: false });
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.removedIds).toEqual(["e-u1", "e-a1", "e-u2", "e-a2"]);
  expect(res.undone).toEqual(["e-a1"]);
  expect(exists("output/e1.md")).toBe(false);
  expect(store.listMessages(threadId).map((m) => m.id)).toEqual([]);
});

test("a file changed by the user since the turn blocks the resend, and nothing is removed", () => {
  msg("user", "c-u1", "tulis");
  msg("assistant", "c-a1", "ditulis");
  fileTurn("c-a1", "run_c1", "output/c1.md", null, "dari agent");
  fs.writeFileSync(path.join(root, "output/c1.md"), "diedit user", "utf-8");

  const res = edit.truncateFromMessage({ threadId, root, messageId: "c-u1", resetFiles: true, conversationOnly: false });
  expect(res.ok).toBe(false);
  if (res.ok) return;
  expect(res.status).toBe(409);
  expect(res.conflicts).toEqual([{ path: "output/c1.md", state: "changed" }]);
  expect(store.listMessages(threadId).map((m) => m.id)).toEqual(["c-u1", "c-a1"]);
  expect(fs.readFileSync(path.join(root, "output/c1.md"), "utf-8")).toBe("diedit user");
});

test("with conversationOnly the conversation is cut and the file is left as it is", () => {
  const res = edit.truncateFromMessage({ threadId, root, messageId: "c-u1", resetFiles: true, conversationOnly: true });
  expect(res.ok).toBe(true);
  expect(store.listMessages(threadId).map((m) => m.id)).toEqual([]);
  expect(fs.readFileSync(path.join(root, "output/c1.md"), "utf-8")).toBe("diedit user");
});

test("a run in progress blocks the resend", () => {
  msg("user", "r-u1", "sedang berjalan");
  reg.createRun({ runId: "run_r1", threadId, projectId: "p-edit" });
  const res = edit.truncateFromMessage({ threadId, root, messageId: "r-u1", resetFiles: false, conversationOnly: false });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.status).toBe(409);
  reg.finishRun("run_r1", "stopped");
  expect(store.listMessages(threadId).map((m) => m.id)).toEqual(["r-u1"]);
});

test("the removed messages leave the search index", () => {
  msg("user", "s-u1", "kata unikkeramat");
  const before = store.searchChatMessages("p-edit", "unikkeramat", 10).length;
  expect(before).toBeGreaterThan(0);
  edit.truncateFromMessage({ threadId, root, messageId: "s-u1", resetFiles: false, conversationOnly: true });
  expect(store.searchChatMessages("p-edit", "unikkeramat", 10).length).toBe(0);
});

test("fork copies up to and including the message, not beyond, and leaves the original", () => {
  msg("user", "f-u1", "satu");
  msg("assistant", "f-a1", "jawab satu");
  msg("user", "f-u2", "dua");
  msg("assistant", "f-a2", "jawab dua");
  const copyId = edit.forkThread({ threadId, messageId: "f-a1" }) as string;
  expect(copyId).toBeTruthy();
  expect(copyId).not.toBe(threadId);
  const copied = store.listMessages(copyId).map((m) => JSON.parse(m.contentJson ?? "[]"));
  // Everything up to the message, including what the thread held before it; nothing after.
  expect(copied.at(-1)).toEqual(text("jawab satu"));
  expect(copied.some((p) => JSON.stringify(p).includes("dua"))).toBe(false);
  expect(store.getThread(copyId)!.title!.startsWith("Cabang: ")).toBe(true);
  expect(store.listMessages(threadId).map((m) => m.id)).toContain("f-a2");
});

test("a summarised thread cannot be resent from", () => {
  const t = store.createThread({ projectId: "p-edit", permissionMode: "auto", mode: "agent" } as any).id as string;
  store.appendMessage({ threadId: t, role: "user", parts: text("x"), id: "sum-u1" });
  store.setThreadSummary(t, "ringkasan lama");
  const res = edit.truncateFromMessage({ threadId: t, root, messageId: "sum-u1", resetFiles: false, conversationOnly: true });
  expect(res.ok).toBe(false);
});
