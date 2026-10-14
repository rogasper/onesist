/**
 * The MCP endpoint end to end: auth before anything else, Origin guard,
 * initialize/tools/list/tools/call, notifications, broken JSON, unknown project,
 * and no server-sent stream.
 *
 *   bun test src/server/routes/mcp.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-mcp-route-")), "data.db");
const TOKEN = "a".repeat(64);
process.env.SA_MCP_TOKEN = TOKEN;

const { db } = await import("~/server/db/client");
const { sql } = await import("drizzle-orm");
const store = await import("~/server/agent/store");
const { router } = await import("./mcp");
const { MCP_TOOL_NAMES } = await import("~/server/mcp/registry");

let threadId = "";
beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-mcp-route-ws-"));
  db.run(sql`INSERT OR IGNORE INTO projects (id, name, root_path) VALUES ('p-mcp', 'MCP', ${root})`);
  threadId = store.createThread({ projectId: "p-mcp", title: "Diskusi ERD" } as any).id as string;
  // Unique ids: bun runs every test file in one process, so the database is shared across files.
  store.appendMessage({ threadId, role: "user", parts: [{ type: "text", text: "Tabel users perlu kolom email" }], id: "route-m1" });
});

const URL_OK = "http://localhost:4321/api/mcp/projects/p-mcp";

async function post(body: unknown, headers: Record<string, string> = {}, url = URL_OK) {
  const res = await router.handle(
    new Request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}`, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  if (!res) throw new Error("route did not match");
  return res;
}

test("a wrong or missing token is 401 and runs nothing", async () => {
  expect((await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { Authorization: "Bearer salah" })).status).toBe(401);
  expect((await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { Authorization: "" })).status).toBe(401);
});

test("the token is checked before the project, so unknown ids are not revealed", async () => {
  const res = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { Authorization: "Bearer salah" }, "http://localhost:4321/api/mcp/projects/tidak-ada");
  expect(res.status).toBe(401);
});

test("a page from another site is 403", async () => {
  expect((await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { Origin: "https://evil.example" })).status).toBe(403);
});

test("initialize names the server", async () => {
  const res = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
  expect(res.status).toBe(200);
  expect(res.headers.get("Cache-Control")).toBe("no-store");
  const body = (await res.json()) as any;
  expect(body.id).toBe(1);
  expect(body.result.serverInfo.name).toBe("onesist");
});

test("tools/list returns the five read-only tools", async () => {
  const body = (await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json()) as any;
  expect(body.result.tools.map((t: any) => t.name)).toEqual([...MCP_TOOL_NAMES]);
});

test("tools/call reads a chat thread of this project", async () => {
  const body = (await (await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "onesist_thread_read", arguments: { thread_id: threadId } } })).json()) as any;
  expect(body.result.isError).toBe(false);
  expect(body.result.content[0].text).toContain("Tabel users perlu kolom email");
});

test("a notification is 202 with an empty body", async () => {
  const res = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
  expect(res.status).toBe(202);
  expect(await res.text()).toBe("");
});

test("broken JSON is a parse error", async () => {
  const res = await post("{nope");
  expect(res.status).toBe(400);
  expect(((await res.json()) as any).error.code).toBe(-32700);
});

test("an unknown project is 404", async () => {
  const res = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, {}, "http://localhost:4321/api/mcp/projects/tidak-ada");
  expect(res.status).toBe(404);
});

test("GET and DELETE are 405: no server-sent stream, no sessions", async () => {
  for (const method of ["GET", "DELETE"]) {
    const res = await router.handle(new Request(URL_OK, { method, headers: { Authorization: `Bearer ${TOKEN}` } }));
    expect(res?.status).toBe(405);
    expect(res?.headers.get("Allow")).toBe("POST");
  }
});
