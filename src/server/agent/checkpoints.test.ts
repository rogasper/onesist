/**
 * Regression: undo and reapply of one turn's file changes.
 *   - a file the turn created is removed by undo and written again by reapply
 *   - an updated file goes back to its earlier content and forward again
 *   - a file changed by the user after the turn is never overwritten
 *   - without explicit paths, one conflict blocks the whole turn (nothing written)
 *   - with explicit paths, the others are written and the conflicts are skipped
 *   - a change whose content was not captured cannot be undone
 *   - several changes to one file in a turn undo to the state before the first one
 *
 *   bun test src/server/agent/checkpoints.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-ckp-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("./store");
const cp = await import("./checkpoints");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-ckp-ws-"));
let threadId = "";
beforeAll(() => {
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-ckp', 'Checkpoints', ${root})`);
  threadId = store.createThread({ projectId: "p-ckp", permissionMode: "auto", mode: "agent" } as any).id as string;
});

const write = (rel: string, text: string) => {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), text, "utf-8");
};
const read = (rel: string) => (fs.existsSync(path.join(root, rel)) ? fs.readFileSync(path.join(root, rel), "utf-8") : null);
let turn = 0;
/** One turn: the changes are recorded and the disk is left as the turn wrote it. */
function runTurn(changes: { path: string; before: string | null | undefined; after: string | null }[]): string {
  turn += 1;
  const runId = `run_t${turn}`;
  const messageId = `msg_t${turn}`;
  for (const c of changes) {
    cp.recordCheckpoint({ threadId, runId, path: c.path, before: c.before, after: c.after });
    if (c.after === null) fs.rmSync(path.join(root, c.path), { force: true });
    else write(c.path, c.after);
  }
  cp.attributeCheckpoints(runId, messageId);
  return messageId;
}

test("a created file is removed by undo and written again by reapply", () => {
  const m = runTurn([{ path: "output/nuevo.md", before: null, after: "isi baru" }]);
  expect(cp.turnChanges(threadId, root, m)).toEqual([{ path: "output/nuevo.md", state: "applied", canUndo: true, canReapply: false }]);
  expect(cp.applyTurnAction(threadId, root, m, "undo")).toEqual({ ok: true, done: ["output/nuevo.md"], skipped: [] });
  expect(read("output/nuevo.md")).toBeNull();
  expect(cp.turnChanges(threadId, root, m)[0].state).toBe("reverted");
  cp.applyTurnAction(threadId, root, m, "reapply");
  expect(read("output/nuevo.md")).toBe("isi baru");
});

test("an updated file goes back to its earlier content and forward again", () => {
  write("docs/a.md", "versi A");
  const m = runTurn([{ path: "docs/a.md", before: "versi A", after: "versi B" }]);
  cp.applyTurnAction(threadId, root, m, "undo");
  expect(read("docs/a.md")).toBe("versi A");
  cp.applyTurnAction(threadId, root, m, "reapply");
  expect(read("docs/a.md")).toBe("versi B");
});

test("a file changed by the user after the turn is never overwritten", () => {
  write("docs/b.md", "awal");
  const m = runTurn([{ path: "docs/b.md", before: "awal", after: "dari agent" }]);
  write("docs/b.md", "diedit user");
  expect(cp.turnChanges(threadId, root, m)[0].state).toBe("changed");
  const res = cp.applyTurnAction(threadId, root, m, "undo");
  expect(res).toEqual({ ok: false, conflicts: [{ path: "docs/b.md", state: "changed" }] });
  expect(read("docs/b.md")).toBe("diedit user");
});

test("without explicit paths, one conflict blocks the whole turn", () => {
  write("docs/c1.md", "c1 awal");
  write("docs/c2.md", "c2 awal");
  const m = runTurn([
    { path: "docs/c1.md", before: "c1 awal", after: "c1 agent" },
    { path: "docs/c2.md", before: "c2 awal", after: "c2 agent" },
  ]);
  write("docs/c2.md", "c2 user");
  const res = cp.applyTurnAction(threadId, root, m, "undo");
  expect(res.ok).toBe(false);
  expect(read("docs/c1.md")).toBe("c1 agent"); // nothing was written
});

test("with explicit paths, the safe files are changed and the conflicts are skipped", () => {
  write("docs/d1.md", "d1 awal");
  write("docs/d2.md", "d2 awal");
  const m = runTurn([
    { path: "docs/d1.md", before: "d1 awal", after: "d1 agent" },
    { path: "docs/d2.md", before: "d2 awal", after: "d2 agent" },
  ]);
  write("docs/d2.md", "d2 user");
  const res = cp.applyTurnAction(threadId, root, m, "undo", ["docs/d1.md", "docs/d2.md"]);
  expect(res).toEqual({ ok: true, done: ["docs/d1.md"], skipped: [{ path: "docs/d2.md", state: "changed" }] });
  expect(read("docs/d1.md")).toBe("d1 awal");
  expect(read("docs/d2.md")).toBe("d2 user");
});

test("a change whose content was not captured cannot be undone", () => {
  const m = runTurn([{ path: "output/dari-bash.txt", before: undefined, after: "tak terlihat" }]);
  expect(cp.turnChanges(threadId, root, m)[0]).toEqual({ path: "output/dari-bash.txt", state: "unverifiable", canUndo: false, canReapply: false });
  expect(cp.applyTurnAction(threadId, root, m, "undo").ok).toBe(false);
  expect(read("output/dari-bash.txt")).toBe("tak terlihat");
});

test("several changes to one file in a turn undo to the state before the first", () => {
  write("docs/e.md", "e0");
  const m = runTurn([
    { path: "docs/e.md", before: "e0", after: "e1" },
    { path: "docs/e.md", before: "e1", after: "e2" },
  ]);
  expect(cp.turnChanges(threadId, root, m)).toEqual([{ path: "docs/e.md", state: "applied", canUndo: true, canReapply: false }]);
  cp.applyTurnAction(threadId, root, m, "undo");
  expect(read("docs/e.md")).toBe("e0");
});

test("a content larger than the limit is not captured", () => {
  const big = "x".repeat(cp.CHECKPOINT_TEXT_LIMIT + 1);
  write("docs/big.md", big);
  const m = runTurn([{ path: "docs/big.md", before: big, after: "kecil" }]);
  expect(cp.turnChanges(threadId, root, m)[0].state).toBe("unverifiable");
});
