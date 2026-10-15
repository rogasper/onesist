/**
 * Onesist's worktrees are cleaned up on request only, after a check for local changes.
 *
 *   bun test src/server/agent/workspace/cleanup.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-cleanup-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const registry = await import("~/server/agent/run-registry");
const { setThreadWorkspace } = await import("./thread-workspace");
const { listOnesistWorktrees, removeOnesistWorktree } = await import("./cleanup");

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd, encoding: "utf-8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout;
}

let root = "";
let base = "";
let apiPath = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-cleanup-proj-"));
  apiPath = path.join(root, "input", "code", "api");
  fs.mkdirSync(apiPath, { recursive: true });
  git(apiPath, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(apiPath, "a.txt"), "a\n");
  git(apiPath, "add", "a.txt");
  git(apiPath, "commit", "-q", "-m", "init");
  base = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-cleanup-base-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-clean', 'Clean', ${root})`);
});

async function threadInWorktree(branch: string) {
  const t = store.createThread({ projectId: "p-clean", title: branch } as any);
  const res = await setThreadWorkspace(t.id, { strategy: "worktree", repo: "input/code/api", branch }, { baseDir: base });
  if (!res.ok) throw new Error(res.error);
  store.saveProviderSession(t.id, "oc", "ses_wt", 0);
  return { threadId: t.id, path: store.getThread(t.id)!.workspacePath! };
}

test("the list shows Onesist's worktrees with their threads and local changes, not the user's own", async () => {
  const { threadId, path: wt } = await threadInWorktree("onesist/daftar");
  fs.writeFileSync(path.join(wt, "baru.txt"), "x");
  fs.writeFileSync(path.join(wt, "a.txt"), "ubah\n");
  const userOwn = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-cleanup-user-")), "milik-user");
  git(apiPath, "worktree", "add", "-q", "-b", "user/fitur", userOwn, "main");

  const list = await listOnesistWorktrees("p-clean", root, base);
  const mine = list.find((w) => w.path === wt)!;
  expect(mine).toMatchObject({ repo: "input/code/api", branch: "onesist/daftar", missing: false, dirtyFiles: 2 });
  expect(mine.threads.map((t) => t.id)).toEqual([threadId]);
  expect(list.some((w) => w.branch === "user/fitur")).toBe(false);
});

test("a worktree with local changes is kept unless forced; forced, its threads go back to the root", async () => {
  const { threadId, path: wt } = await threadInWorktree("onesist/kotor");
  fs.writeFileSync(path.join(wt, "kerja.txt"), "belum commit");

  const refused = await removeOnesistWorktree({ projectId: "p-clean", projectRoot: root, path: wt, force: false, baseDir: base });
  expect(refused).toMatchObject({ ok: false, status: 409, dirtyFiles: 1 });
  expect(fs.existsSync(wt)).toBe(true);

  const removed = await removeOnesistWorktree({ projectId: "p-clean", projectRoot: root, path: wt, force: true, baseDir: base });
  expect(removed).toEqual({ ok: true, resetThreads: 1 });
  expect(fs.existsSync(wt)).toBe(false);
  // The branch, and with it any commit, stays.
  expect(git(apiPath, "branch", "--list", "onesist/kotor").trim()).toContain("onesist/kotor");
  const thread = store.getThread(threadId)!;
  expect(thread.workspacePath).toBeNull();
  expect(store.getProviderSession(threadId, "oc")).toBeNull();
  const last = store.listMessages(threadId).filter((r) => r.kind === "workspaceNotice").at(-1)!;
  expect(JSON.parse(last.contentJson!)[0].data).toEqual({ kind: "workspace", label: "Root project", reason: "removed" });
});

test("a clean worktree is removed without force; a folder already gone is pruned", async () => {
  const clean = await threadInWorktree("onesist/bersih");
  expect(await removeOnesistWorktree({ projectId: "p-clean", projectRoot: root, path: clean.path, force: false, baseDir: base })).toEqual({ ok: true, resetThreads: 1 });

  const gone = await threadInWorktree("onesist/hilang");
  fs.rmSync(gone.path, { recursive: true, force: true });
  const listed = (await listOnesistWorktrees("p-clean", root, base)).find((w) => w.path === gone.path);
  expect(listed?.missing).toBe(true);
  expect(await removeOnesistWorktree({ projectId: "p-clean", projectRoot: root, path: gone.path, force: false, baseDir: base })).toEqual({ ok: true, resetThreads: 1 });
  expect((await listOnesistWorktrees("p-clean", root, base)).some((w) => w.path === gone.path)).toBe(false);
});

test("only Onesist's worktrees of this project can be removed, and never under a running agent", async () => {
  for (const p of [apiPath, root, "/etc", path.join(base, "tidak-ada")]) {
    const res = await removeOnesistWorktree({ projectId: "p-clean", projectRoot: root, path: p, force: true, baseDir: base });
    expect(res.ok ? 200 : res.status).toBe(404);
  }
  expect(fs.existsSync(path.join(apiPath, "a.txt"))).toBe(true);

  const busy = await threadInWorktree("onesist/sibuk");
  registry.createRun({ runId: "run-clean-busy", threadId: busy.threadId, projectId: "p-clean" });
  try {
    const res = await removeOnesistWorktree({ projectId: "p-clean", projectRoot: root, path: busy.path, force: true, baseDir: base });
    expect(res.ok ? 200 : res.status).toBe(409);
    expect(fs.existsSync(busy.path)).toBe(true);
  } finally {
    registry.finishRun("run-clean-busy", "done");
  }
});
