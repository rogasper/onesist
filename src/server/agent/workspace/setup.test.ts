/**
 * The project's setup command runs in a new worktree, in the background, and reports back.
 *
 *   bun test src/server/agent/workspace/setup.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-setup-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { setupCommandFor, setupState, shellFor, startWorktreeSetup } = await import("./setup");

let root = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-setup-proj-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-setup', 'Setup', ${root})`);
});

const setupNotice = (threadId: string) => {
  const row = store.listMessages(threadId).find((r) => r.kind === "workspaceSetupNotice");
  return row ? JSON.parse(row.contentJson!)[0].data : null;
};

test("the setup command is read per repo from .agents/onesist-worktree.json", () => {
  expect(setupCommandFor(root, "input/code/api")).toBeNull();
  fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
  fs.writeFileSync(path.join(root, ".agents", "onesist-worktree.json"), JSON.stringify({ setup: { "input/code/api": "  bun install  ", ".": 5 } }));
  expect(setupCommandFor(root, "input/code/api")).toBe("bun install");
  expect(setupCommandFor(root, ".")).toBeNull();
  fs.writeFileSync(path.join(root, ".agents", "onesist-worktree.json"), "{ rusak");
  expect(setupCommandFor(root, "input/code/api")).toBeNull();
});

test("the command goes to the platform's shell", () => {
  expect(shellFor("bun install", "darwin")).toEqual(["/bin/sh", ["-c", "bun install"]]);
  expect(shellFor("bun install", "win32")).toEqual(["cmd.exe", ["/d", "/s", "/c", "bun install"]]);
});

test.skipIf(process.platform === "win32")("a setup that succeeds leaves a notice with its output", async () => {
  const t = store.createThread({ projectId: "p-setup", title: "Ok" } as any);
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-setup-cwd-"));
  const running = startWorktreeSetup({ threadId: t.id, cwd, command: "echo siap && pwd" });
  expect(setupState(t.id)?.state).toBe("running");
  const done = await running;
  expect(done.state).toBe("ok");
  expect(done.exitCode).toBe(0);
  expect(done.tail).toContain("siap");
  expect(done.tail).toContain(fs.realpathSync(cwd));
  expect(setupState(t.id)?.state).toBe("ok");
  expect(setupNotice(t.id)).toMatchObject({ kind: "workspaceSetup", ok: true, exitCode: 0, command: "echo siap && pwd" });
});

test.skipIf(process.platform === "win32")("a failing setup reports its exit code and stderr", async () => {
  const t = store.createThread({ projectId: "p-setup", title: "Gagal" } as any);
  const done = await startWorktreeSetup({ threadId: t.id, cwd: os.tmpdir(), command: "echo rusak 1>&2; exit 3" });
  expect(done).toMatchObject({ state: "failed", exitCode: 3 });
  expect(done.tail).toContain("rusak");
  expect(setupNotice(t.id)).toMatchObject({ ok: false, exitCode: 3 });
});

test.skipIf(process.platform === "win32")("a setup that runs too long is stopped", async () => {
  const t = store.createThread({ projectId: "p-setup", title: "Lama" } as any);
  const done = await startWorktreeSetup({ threadId: t.id, cwd: os.tmpdir(), command: "sleep 5", timeoutMs: 200 });
  expect(done.state).toBe("failed");
  expect(done.exitCode).toBeNull();
  expect(done.tail).toContain("batas waktu");
});

test.skipIf(process.platform === "win32")("the output kept is only the tail", async () => {
  const t = store.createThread({ projectId: "p-setup", title: "Panjang" } as any);
  const done = await startWorktreeSetup({ threadId: t.id, cwd: os.tmpdir(), command: "i=0; while [ $i -lt 2000 ]; do echo baris-$i; i=$((i+1)); done" });
  expect(done.tail.length).toBeLessThanOrEqual(4000);
  expect(done.tail).toContain("baris-1999");
  expect(done.tail).not.toContain("baris-0\n");
});
