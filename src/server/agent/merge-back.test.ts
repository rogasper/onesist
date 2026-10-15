/**
 * A branch's work goes back to its parent as a budgeted, framed message — once per new
 * piece of work, never in the middle of a parent's run.
 *
 *   bun test src/server/agent/merge-back.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-merge-back-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const registry = await import("~/server/agent/run-registry");
const edit = await import("~/server/agent/thread-edit");
const { mergeBackIntoParent, threadLineage } = await import("./merge-back");

beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-merge-back-ws-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-merge', 'Merge', ${root})`);
});

let n = 0;
const say = (threadId: string, role: "user" | "assistant", text: string) =>
  store.appendMessage({ threadId, role, id: `merge-${++n}`, parts: [{ type: "text", text }] });

function family() {
  const parent = store.createThread({ projectId: "p-merge", title: "ERD klaim" } as any);
  say(parent.id, "user", "Rancang ERD klaim");
  const a = say(parent.id, "assistant", "ERD awal dibuat");
  const childId = edit.forkThread({ threadId: parent.id, messageId: a.id }) as string;
  return { parent, childId };
}

test("a branch's own work goes to the parent as framed history, with a divider", () => {
  const { parent, childId } = family();
  say(childId, "user", "Coba tambah tabel audit");
  say(childId, "assistant", "Tabel audit ditambah di output/erd/klaim.md");
  const before = store.listMessages(parent.id).length;
  const result = mergeBackIntoParent(childId);
  expect(result).toEqual({ ok: true, parentThreadId: parent.id, included: 2, omitted: 0 });
  const added = store.listMessages(parent.id).slice(before);
  expect(added.map((r) => [r.role, r.kind])).toEqual([["system", "mergeNotice"], ["user", null]]);
  const text = JSON.parse(added[1].contentJson!)[0].text as string;
  expect(text).toContain("Tabel audit ditambah");
  expect(text).not.toContain("ERD awal dibuat"); // copied from the parent, not the branch's work
  expect(JSON.parse(added[0].contentJson!)[0].data).toEqual({ kind: "merge", title: "Cabang: ERD klaim", threadId: childId, included: 2, omitted: 0 });
});

test("merging again brings only what is new; nothing new is refused", () => {
  const { childId } = family();
  say(childId, "assistant", "hasil pertama");
  expect(mergeBackIntoParent(childId).ok).toBe(true);
  expect(mergeBackIntoParent(childId)).toEqual({ ok: false, status: 409, error: "Belum ada hasil baru di cabang ini untuk dibawa." });
  say(childId, "assistant", "hasil kedua");
  const second = mergeBackIntoParent(childId);
  expect(second.ok && second.included).toBe(1);
});

test("a parent that is running, gone, or a thread that is not a branch are refused", () => {
  const { parent, childId } = family();
  say(childId, "assistant", "hasil");
  registry.createRun({ runId: "run-merge-busy", threadId: parent.id, projectId: "p-merge" });
  try {
    const busy = mergeBackIntoParent(childId);
    expect(busy.ok).toBe(false);
    expect(!busy.ok && busy.status).toBe(409);
  } finally {
    registry.finishRun("run-merge-busy", "done");
  }
  const plain = store.createThread({ projectId: "p-merge", title: "Biasa" } as any);
  expect(mergeBackIntoParent(plain.id)).toEqual({ ok: false, status: 400, error: "Thread ini bukan cabang." });
  store.deleteThread(parent.id);
  expect(mergeBackIntoParent(childId)).toEqual({ ok: false, status: 409, error: "Thread induk sudah dihapus." });
  expect(mergeBackIntoParent("thr_tidak_ada")).toEqual({ ok: false, status: 404, error: "Thread tidak ditemukan." });
});

test("lineage tells the parent's title and how much work is not merged yet", () => {
  const { parent, childId } = family();
  expect(threadLineage(store.getThread(parent.id)!)).toBeNull();
  expect(threadLineage(store.getThread(childId)!)).toEqual({ parentThreadId: parent.id, parentTitle: "ERD klaim", parentMissing: false, unmerged: 0 });
  say(childId, "user", "lanjut");
  say(childId, "assistant", "oke");
  expect(threadLineage(store.getThread(childId)!)!.unmerged).toBe(2);
  store.deleteThread(parent.id);
  expect(threadLineage(store.getThread(childId)!)).toEqual({ parentThreadId: parent.id, parentTitle: null, parentMissing: true, unmerged: 2 });
});
