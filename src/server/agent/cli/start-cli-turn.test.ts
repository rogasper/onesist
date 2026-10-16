/**
 * The chat route's door to CLI agents: only OpenCode is wired, and only text.
 *
 *   bun test src/server/agent/cli/start-cli-turn.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-start-cli-")), "data.db");

const { startCliTurn, textOfMessage } = await import("./start-cli-turn");

test("the message text joins its text parts and ignores the rest", () => {
  expect(textOfMessage({ parts: [{ type: "text", text: "halo" }, { type: "file", url: "x" }, { type: "text", text: "dunia" }] })).toBe("halo\ndunia");
  expect(textOfMessage(undefined)).toBe("");
});

test("a CLI agent other than OpenCode is refused with a clear message", async () => {
  const thread: any = { id: "t", projectId: "p", mode: "agent", permissionMode: "ask", title: null, model: null, cliSessionId: null };
  const provider: any = { apiStyle: "cli", cliAgent: "pi", cliPath: null, model: null };
  await expect(startCliTurn({ runId: "r", thread, root: "/x", provider, lastUser: { parts: [{ type: "text", text: "hai" }] } as any })).rejects.toThrow("belum didukung");
});

test("a message without text is refused for CLI agents", async () => {
  const thread: any = { id: "t", projectId: "p", mode: "agent", permissionMode: "ask", title: null, model: null, cliSessionId: null };
  const provider: any = { apiStyle: "cli", cliAgent: "opencode", cliPath: null, model: null };
  await expect(startCliTurn({ runId: "r", thread, root: "/x", provider, lastUser: { parts: [{ type: "file", url: "x" }] } as any })).rejects.toThrow("pesan teks");
});

test("after the runtime takes the prompt, the session is recorded and a handover is marked in the transcript", async () => {
  const { db } = await import("~/server/db/client");
  const { sql } = await import("drizzle-orm");
  const store = await import("~/server/agent/store");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-start-cli-ws-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-start-cli', 'Start', ${root})`);
  const t = store.createThread({ projectId: "p-start-cli", title: "S" } as any);
  store.appendMessage({ threadId: t.id, role: "user", id: "start-cli-1", parts: [{ type: "text", text: "di native" }] });
  store.appendMessage({ threadId: t.id, role: "assistant", id: "start-cli-2", parts: [{ type: "text", text: "jawab native" }], providerId: "native" });
  store.appendMessage({ threadId: t.id, role: "user", id: "start-cli-3", parts: [{ type: "text", text: "ke OpenCode" }] });
  let sentText = "";
  const fakeRuntime: any = {
    id: "opencode",
    capabilities: { reasoningEffort: false, modelOptions: true },
    listModels: async () => [],
    probe: async () => ({ state: "ready", version: "x", message: "" }),
    startTurn: async (input: any) => {
      sentText = input.text;
      input.onSessionCreated("ses_new");
      return { stream: new ReadableStream(), usage: Promise.resolve({ inputTokens: null, outputTokens: null }) };
    },
  };
  const provider: any = { id: "oc-start", name: "OpenCode", apiStyle: "cli", cliAgent: "opencode", cliPath: null, model: null };
  await startCliTurn({ runId: "r-start-1", thread: store.getThread(t.id)!, root, provider, lastUser: { id: "start-cli-3", parts: [{ type: "text", text: "ke OpenCode" }] } as any }, fakeRuntime);
  expect(sentText).toContain("jawab native");
  expect(store.getProviderSession(t.id, "oc-start")).toEqual({ sessionId: "ses_new", knownUptoSeq: store.messageSeq(t.id, "start-cli-3")! });
  expect(store.getThread(t.id)!.cliSessionId).toBe("ses_new");
  const notice = store.listMessages(t.id).find((r) => r.kind === "handoffNotice");
  expect(JSON.parse(notice!.contentJson!)[0].data).toEqual({ kind: "handoff", mode: "handoff", provider: "OpenCode", included: 2, omitted: 0 });
});

test("a prompt the runtime refuses records no session and no handover", async () => {
  const { db } = await import("~/server/db/client");
  const { sql } = await import("drizzle-orm");
  const store = await import("~/server/agent/store");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-start-cli-ws2-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-start-cli2', 'Start2', ${root})`);
  const t = store.createThread({ projectId: "p-start-cli2", title: "S2" } as any);
  store.appendMessage({ threadId: t.id, role: "user", id: "start-cli2-1", parts: [{ type: "text", text: "a" }] });
  store.appendMessage({ threadId: t.id, role: "assistant", id: "start-cli2-2", parts: [{ type: "text", text: "b" }], providerId: "native" });
  store.appendMessage({ threadId: t.id, role: "user", id: "start-cli2-3", parts: [{ type: "text", text: "c" }] });
  const failing: any = {
    id: "opencode",
    capabilities: { reasoningEffort: false, modelOptions: true },
    listModels: async () => [],
    probe: async () => ({ state: "ready", version: "x", message: "" }),
    startTurn: async () => {
      throw new Error("OpenCode menolak prompt");
    },
  };
  const provider: any = { id: "oc-refuse", name: "OpenCode", apiStyle: "cli", cliAgent: "opencode", cliPath: null, model: null };
  await expect(
    startCliTurn({ runId: "r-start-2", thread: store.getThread(t.id)!, root, provider, lastUser: { id: "start-cli2-3", parts: [{ type: "text", text: "c" }] } as any }, failing),
  ).rejects.toThrow("menolak");
  expect(store.getProviderSession(t.id, "oc-refuse")).toBeNull();
  expect(store.listMessages(t.id).some((r) => r.kind === "handoffNotice")).toBe(false);
});
