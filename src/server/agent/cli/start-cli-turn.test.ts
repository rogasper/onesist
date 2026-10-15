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
  const provider: any = { apiStyle: "cli", cliAgent: "claude", cliPath: null, model: null };
  await expect(startCliTurn({ runId: "r", thread, root: "/x", provider, lastUser: { parts: [{ type: "text", text: "hai" }] } as any })).rejects.toThrow("belum didukung");
});

test("a message without text is refused for CLI agents", async () => {
  const thread: any = { id: "t", projectId: "p", mode: "agent", permissionMode: "ask", title: null, model: null, cliSessionId: null };
  const provider: any = { apiStyle: "cli", cliAgent: "opencode", cliPath: null, model: null };
  await expect(startCliTurn({ runId: "r", thread, root: "/x", provider, lastUser: { parts: [{ type: "file", url: "x" }] } as any })).rejects.toThrow("pesan teks");
});
