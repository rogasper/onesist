/**
 * Where a thread's CLI agent works, and what moving it does: new session, conversation kept.
 *
 *   bun test src/server/agent/workspace/thread-workspace.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-thread-ws-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const registry = await import("~/server/agent/run-registry");
const { prepareCliTurn } = await import("~/server/agent/cli/prepare-turn");
const { resolveTurnWorkspace, setThreadWorkspace, workspaceDetail, workspaceOptions } = await import("./thread-workspace");

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...args], { cwd, encoding: "utf-8" });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout;
}

let root = "";
let base = "";
let apiPath = "";

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-thread-ws-proj-"));
  apiPath = path.join(root, "input", "code", "api");
  fs.mkdirSync(apiPath, { recursive: true });
  git(apiPath, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(apiPath, "a.txt"), "a\n");
  git(apiPath, "add", "a.txt");
  git(apiPath, "commit", "-q", "-m", "init");
  base = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-thread-ws-base-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-ws', 'Workspace', ${root})`);
});

let n = 0;
const say = (threadId: string, role: "user" | "assistant", text: string, providerId: string | null = null) =>
  store.appendMessage({ threadId, role, id: `ws-${++n}`, parts: [{ type: "text", text }], providerId });
const newThread = (title = "Fitur klaim") => store.createThread({ projectId: "p-ws", title } as any);
const notices = (threadId: string) => store.listMessages(threadId).filter((r) => r.kind === "workspaceNotice");

test("moving a thread to a new worktree restarts its CLI session and keeps the conversation", async () => {
  const t = newThread();
  say(t.id, "user", "Rancang endpoint klaim");
  const a = say(t.id, "assistant", "Endpoint POST /klaim dirancang", "oc");
  store.saveProviderSession(t.id, "oc", "ses_root", store.messageSeq(t.id, a.id)!);
  store.updateThread(t.id, { cliSessionId: "ses_root" });

  const res = await setThreadWorkspace(t.id, { strategy: "worktree", repo: "input/code/api", branch: "onesist/klaim" }, { baseDir: base });
  expect(res.ok).toBe(true);
  if (!res.ok) return;
  expect(res.changed).toBe(true);
  expect(res.setupStarted).toBe(false);
  const thread = store.getThread(t.id)!;
  expect(thread.workspaceStrategy).toBe("worktree");
  expect(thread.workspaceRepo).toBe("input/code/api");
  expect(thread.workspaceBranch).toBe("onesist/klaim");
  expect(thread.workspacePath).toBe(path.join(fs.realpathSync(base), "p-ws", "api-klaim"));
  expect(fs.existsSync(path.join(thread.workspacePath!, "a.txt"))).toBe(true);

  // restart_and_resume: no session left, the next CLI turn is a handoff of the whole story.
  expect(store.getProviderSession(t.id, "oc")).toBeNull();
  expect(thread.cliSessionId).toBeNull();
  const u = say(t.id, "user", "Lanjut implementasi");
  const p = prepareCliTurn({ thread: store.getThread(t.id)!, providerId: "oc", userText: "Lanjut implementasi", userMessageId: u.id, contextWindow: null });
  expect(p.transition).toEqual({ kind: "handoff" });
  expect(p.text).toContain("Endpoint POST /klaim dirancang");

  const [notice] = notices(t.id);
  expect(JSON.parse(notice.contentJson!)[0].data).toEqual({ kind: "workspace", label: "Worktree onesist/klaim · input/code/api", path: thread.workspacePath });

  const turn = resolveTurnWorkspace(store.getThread(t.id)!, root, true);
  expect(turn).toEqual({ ok: true, cwd: thread.workspacePath!, note: null });
});

test("choosing the workspace the thread already has changes nothing", async () => {
  const t = newThread("Sama");
  await setThreadWorkspace(t.id, { strategy: "root", repo: "input/code/api" }, { baseDir: base });
  store.saveProviderSession(t.id, "oc", "ses_keep", 0);
  const again = await setThreadWorkspace(t.id, { strategy: "root", repo: "input/code/api" }, { baseDir: base });
  expect(again.ok && again.changed).toBe(false);
  expect(store.getProviderSession(t.id, "oc")?.sessionId).toBe("ses_keep");
  expect(notices(t.id).length).toBe(1);
  expect(store.getThread(t.id)!.workspacePath).toBe(fs.realpathSync(apiPath));
  expect(store.getThread(t.id)!.workspaceBranch).toBe("main");
});

test("back to the project root clears the workspace", async () => {
  const t = newThread("Kembali");
  await setThreadWorkspace(t.id, { strategy: "root", repo: "input/code/api" }, { baseDir: base });
  const res = await setThreadWorkspace(t.id, { strategy: "root", repo: null }, { baseDir: base });
  expect(res.ok && res.changed).toBe(true);
  const thread = store.getThread(t.id)!;
  expect([thread.workspaceStrategy, thread.workspaceRepo, thread.workspacePath, thread.workspaceBranch]).toEqual([null, null, null, null]);
  expect(resolveTurnWorkspace(thread, root, true)).toEqual({ ok: true, cwd: root, note: null });
  expect(workspaceDetail(thread).label).toBe("Root project");
});

test("an existing worktree must be one the repo lists; arbitrary repos and paths are refused", async () => {
  const t = newThread("Validasi");
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-thread-ws-other-"));
  for (const req of [
    { strategy: "root", repo: "../.." },
    { strategy: "worktree", repo: "/etc" },
    { strategy: "existing_worktree", repo: "input/code/api", path: other },
    { strategy: "existing_worktree", repo: "input/code/api", path: apiPath },
    { strategy: "lompat", repo: "input/code/api" },
  ] as any[]) {
    const res = await setThreadWorkspace(t.id, req, { baseDir: base });
    expect(res.ok ? 200 : res.status).toBe(400);
  }
  expect(store.getThread(t.id)!.workspacePath).toBeNull();

  git(apiPath, "worktree", "add", "-q", "-b", "user/sendiri", path.join(base, "milik-user"), "main");
  const ok = await setThreadWorkspace(t.id, { strategy: "existing_worktree", repo: "input/code/api", path: path.join(base, "milik-user") }, { baseDir: base });
  expect(ok.ok).toBe(true);
  expect(store.getThread(t.id)!.workspaceBranch).toBe("user/sendiri");
});

test("the workspace cannot move while the agent is running", async () => {
  const t = newThread("Sibuk");
  registry.createRun({ runId: "run-ws-busy", threadId: t.id, projectId: "p-ws" });
  try {
    const res = await setThreadWorkspace(t.id, { strategy: "root", repo: "input/code/api" }, { baseDir: base });
    expect(res.ok ? 200 : res.status).toBe(409);
    expect(store.getThread(t.id)!.workspacePath).toBeNull();
  } finally {
    registry.finishRun("run-ws-busy", "done");
  }
});

test("a worktree deleted outside Onesist stops CLI turns with a clear message; native turns go on in the root", async () => {
  const t = newThread("Hilang");
  await setThreadWorkspace(t.id, { strategy: "worktree", repo: "input/code/api", branch: "onesist/hilang" }, { baseDir: base });
  const thread = store.getThread(t.id)!;
  fs.rmSync(thread.workspacePath!, { recursive: true, force: true });

  const cli = resolveTurnWorkspace(thread, root, true);
  expect(cli.ok).toBe(false);
  if (!cli.ok) expect(cli.error).toContain("tidak ditemukan");

  const native = resolveTurnWorkspace(thread, root, false);
  expect(native.ok && native.cwd).toBe(root);
  expect(native.ok && native.note).toContain("Worktree onesist/hilang · input/code/api");
  expect(workspaceDetail(thread).missing).toBe(true);
});

test("the options list the repos, their worktrees, and a default branch for the thread", async () => {
  const t = newThread("Opsi Baru");
  const opts = await workspaceOptions(store.getThread(t.id)!, root);
  expect(opts.repos.map((r) => r.id)).toEqual(["input/code/api"]);
  expect(opts.repos[0].branch).toBe("main");
  expect(opts.repos[0].worktrees.length).toBeGreaterThan(0);
  expect(opts.repos[0].setup).toBeNull();
  expect(opts.defaultBranch.startsWith("onesist/opsi-baru-")).toBe(true);
  expect(opts.current.label).toBe("Root project");
});

test.skipIf(process.platform === "win32")("a new worktree runs the repo's setup command; an existing one does not", async () => {
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(root, ".agents", "onesist-worktree.json"), JSON.stringify({ setup: { "input/code/api": "echo terpasang > setup.txt" } }));
  try {
    const t = newThread("Setup");
    const res = await setThreadWorkspace(t.id, { strategy: "worktree", repo: "input/code/api", branch: "onesist/setup" }, { baseDir: base });
    expect(res.ok && res.setupStarted).toBe(true);
    const wt = store.getThread(t.id)!.workspacePath!;
    for (let i = 0; i < 50 && !fs.existsSync(path.join(wt, "setup.txt")); i++) await Bun.sleep(20);
    expect(fs.readFileSync(path.join(wt, "setup.txt"), "utf-8").trim()).toBe("terpasang");

    const t2 = newThread("Setup ada");
    const again = await setThreadWorkspace(t2.id, { strategy: "existing_worktree", repo: "input/code/api", path: wt }, { baseDir: base });
    expect(again.ok && again.setupStarted).toBe(false);
  } finally {
    fs.rmSync(path.join(root, ".agents", "onesist-worktree.json"), { force: true });
  }
});
