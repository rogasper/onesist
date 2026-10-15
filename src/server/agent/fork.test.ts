/**
 * A fork copies an OpenCode session natively when it can, and otherwise leaves the branch
 * to be handed over on its first CLI turn (4A).
 *
 *   bun test src/server/agent/fork.test.ts
 */
import { beforeAll, expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-fork-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const { llmProviders } = await import("~/server/db/schema");
const store = await import("~/server/agent/store");
const { canForkNatively, forkForChat } = await import("./fork");

beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-fork-ws-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-fork', 'Fork', ${root})`);
  db.insert(llmProviders)
    .values({ id: "prov-fork-oc", name: "OpenCode fork", preset: "cli-opencode", apiStyle: "cli", cliAgent: "opencode", authMethod: "none" })
    .run();
});

test("native fork only at the latest message, and only when the session has seen it", () => {
  expect(canForkNatively({ forkSeq: 4, latestContentSeq: 4, session: { knownUptoSeq: 4 } })).toBe(true);
  expect(canForkNatively({ forkSeq: 2, latestContentSeq: 4, session: { knownUptoSeq: 4 } })).toBe(false);
  expect(canForkNatively({ forkSeq: 4, latestContentSeq: 4, session: { knownUptoSeq: 3 } })).toBe(false);
  expect(canForkNatively({ forkSeq: 4, latestContentSeq: 4, session: null })).toBe(false);
});

let n = 0;
function openCodeThread() {
  const t = store.createThread({ projectId: "p-fork", title: "OC", providerId: "prov-fork-oc" } as any);
  const u = store.appendMessage({ threadId: t.id, role: "user", id: `fork-${++n}`, parts: [{ type: "text", text: "tanya" }] });
  const a = store.appendMessage({ threadId: t.id, role: "assistant", id: `fork-${++n}`, parts: [{ type: "text", text: "jawab" }], providerId: "prov-fork-oc" });
  store.saveProviderSession(t.id, "prov-fork-oc", "ses_parent", store.messageSeq(t.id, a.id)!);
  return { t, u, a };
}
const runtime = (forkSession?: (p: any, s: string) => Promise<string>): any => ({
  id: "opencode",
  capabilities: { reasoningEffort: false, modelOptions: true },
  listModels: async () => [],
  probe: async () => ({ state: "ready", version: "x", message: "" }),
  startTurn: async () => {
    throw new Error("not used");
  },
  forkSession,
});

test("forking at the latest message of an OpenCode thread forks its session natively", async () => {
  const { t, a } = openCodeThread();
  let asked = "";
  const result = await forkForChat({ threadId: t.id, messageId: a.id }, runtime(async (_p, s) => ((asked = s), "ses_child")));
  expect(result!.mode).toBe("native");
  expect(asked).toBe("ses_parent");
  expect(store.getProviderSession(result!.threadId, "prov-fork-oc")).toEqual({ sessionId: "ses_child", knownUptoSeq: store.latestSeq(result!.threadId) });
  expect(store.getThread(result!.threadId)!.cliSessionId).toBe("ses_child");
});

test("forking at an earlier message leaves the branch to a handover", async () => {
  const { t, u } = openCodeThread();
  const result = await forkForChat({ threadId: t.id, messageId: u.id }, runtime(async () => "ses_never"));
  expect(result!.mode).toBe("portable");
  expect(store.getProviderSession(result!.threadId, "prov-fork-oc")).toBeNull();
});

test("a native fork that fails still creates the branch, as portable", async () => {
  const { t, a } = openCodeThread();
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    const result = await forkForChat({ threadId: t.id, messageId: a.id }, runtime(async () => {
      throw new Error("OpenCode down");
    }));
    expect(result!.mode).toBe("portable");
    expect(store.getThread(result!.threadId)!.parentThreadId).toBe(t.id);
    expect(store.getProviderSession(result!.threadId, "prov-fork-oc")).toBeNull();
  } finally {
    warn.mockRestore();
  }
});

test("a runtime without native fork, or an unknown message, behaves as expected", async () => {
  const { t, a } = openCodeThread();
  expect((await forkForChat({ threadId: t.id, messageId: a.id }, runtime(undefined)))!.mode).toBe("portable");
  expect(await forkForChat({ threadId: t.id, messageId: "tidak-ada" }, runtime(undefined))).toBeNull();
  expect(await forkForChat({ threadId: "thr_tidak_ada", messageId: a.id }, runtime(undefined))).toBeNull();
});
