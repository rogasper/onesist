/**
 * Which session a CLI turn runs in, and what it is told before the new message.
 *
 *   bun test src/server/agent/cli/prepare-turn.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-prepare-turn-")), "data.db");

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { prepareCliTurn } = await import("./prepare-turn");

beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-prepare-turn-ws-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-prepare', 'Prepare', ${root})`);
});

let n = 0;
const say = (threadId: string, role: "user" | "assistant", text: string, providerId: string | null = null) =>
  store.appendMessage({ threadId, role, id: `prepare-${++n}`, parts: [{ type: "text", text }], providerId });
const newThread = () => store.createThread({ projectId: "p-prepare", title: "T" } as any);

test("the first message of a new thread goes as it is", () => {
  const t = newThread();
  const u = say(t.id, "user", "Halo");
  const p = prepareCliTurn({ thread: store.getThread(t.id)!, providerId: "oc", userText: "Halo", userMessageId: u.id, contextWindow: null });
  expect(p.transition).toEqual({ kind: "fresh" });
  expect(p.text).toBe("Halo");
  expect(p.sessionId).toBeNull();
});

test("a thread that ran on a native provider is handed over with its history", () => {
  const t = newThread();
  say(t.id, "user", "Buat ERD klaim", null);
  say(t.id, "assistant", "ERD dibuat di output/erd/klaim.md", "native-1");
  const u = say(t.id, "user", "Sekarang tambah tabel audit");
  const p = prepareCliTurn({ thread: store.getThread(t.id)!, providerId: "oc", userText: "Sekarang tambah tabel audit", userMessageId: u.id, contextWindow: null });
  expect(p.transition).toEqual({ kind: "handoff" });
  expect(p.sessionId).toBeNull();
  expect(p.included).toBe(2);
  expect(p.text).toContain("Buat ERD klaim");
  expect(p.text).toContain("ERD dibuat di output/erd/klaim.md");
  expect(p.text.endsWith("## Pesan baru dari pengguna\nSekarang tambah tabel audit")).toBe(true);
});

test("a session that saw everything is reused with only the new message", () => {
  const t = newThread();
  say(t.id, "user", "satu");
  const a = say(t.id, "assistant", "dua", "oc");
  store.saveProviderSession(t.id, "oc", "ses_reuse", store.messageSeq(t.id, a.id)!);
  const u = say(t.id, "user", "tiga");
  const p = prepareCliTurn({ thread: store.getThread(t.id)!, providerId: "oc", userText: "tiga", userMessageId: u.id, contextWindow: null });
  expect(p.transition).toEqual({ kind: "reuse" });
  expect(p.sessionId).toBe("ses_reuse");
  expect(p.text).toBe("tiga");
});

test("coming back to a session gives it only what happened since it left, not its own replies", () => {
  const t = newThread();
  say(t.id, "user", "awal di OpenCode");
  const own = say(t.id, "assistant", "jawaban OpenCode", "oc");
  store.saveProviderSession(t.id, "oc", "ses_back", store.messageSeq(t.id, own.id)!);
  say(t.id, "user", "pertanyaan ke native");
  say(t.id, "assistant", "jawaban native", "native-1");
  const u = say(t.id, "user", "balik ke OpenCode");
  const p = prepareCliTurn({ thread: store.getThread(t.id)!, providerId: "oc", userText: "balik ke OpenCode", userMessageId: u.id, contextWindow: null });
  expect(p.transition.kind).toBe("delta");
  expect(p.sessionId).toBe("ses_back");
  expect(p.text).toContain("pertanyaan ke native");
  expect(p.text).toContain("jawaban native");
  expect(p.text).not.toContain("jawaban OpenCode");
  expect(p.text).not.toContain("awal di OpenCode");
  expect(p.text).toContain("Sejak giliran terakhir Anda");
});

test("a thread compacted on native hands over its summary instead of the summarised messages", () => {
  const t = newThread();
  say(t.id, "user", "lama sekali");
  const old = say(t.id, "assistant", "jawaban lama", "native-1");
  store.updateThread(t.id, { summary: "Ringkasan: ERD klaim sudah dibuat.", summaryUptoSeq: store.messageSeq(t.id, old.id)! });
  say(t.id, "user", "baru");
  say(t.id, "assistant", "jawaban baru", "native-1");
  const u = say(t.id, "user", "lanjut di OpenCode");
  const p = prepareCliTurn({ thread: store.getThread(t.id)!, providerId: "oc", userText: "lanjut di OpenCode", userMessageId: u.id, contextWindow: null });
  expect(p.text).toContain("Ringkasan: ERD klaim sudah dibuat.");
  expect(p.text).not.toContain("lama sekali");
  expect(p.text).toContain("jawaban baru");
});

test("an older thread whose OpenCode session predates this table keeps that session, for its own provider only", () => {
  const t = newThread();
  say(t.id, "user", "dulu");
  say(t.id, "assistant", "dijawab oc lama", "oc-old");
  store.updateThread(t.id, { cliSessionId: "ses_legacy" });
  const u = say(t.id, "user", "sekarang");
  const own = prepareCliTurn({ thread: store.getThread(t.id)!, providerId: "oc-old", userText: "sekarang", userMessageId: u.id, contextWindow: null });
  expect(own.transition).toEqual({ kind: "reuse" });
  expect(own.sessionId).toBe("ses_legacy");
  const other = prepareCliTurn({ thread: store.getThread(t.id)!, providerId: "oc-new", userText: "sekarang", userMessageId: u.id, contextWindow: null });
  expect(other.transition).toEqual({ kind: "handoff" });
  expect(other.sessionId).toBeNull();
});
