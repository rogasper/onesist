/**
 * Onesist's MCP server added to OpenCode for one folder: once per server and folder,
 * again when OpenCode forgot it (a restart), never fatal, never leaking the token.
 *
 *   bun test src/server/agent/cli/opencode/mcp.test.ts
 */
import { afterAll, beforeEach, expect, spyOn, test } from "bun:test";
import { basicAuth, type OpenCodeConnection } from "./client";
import { ensureOnesistMcp, forgetOnesistMcp } from "./mcp";

const TOKEN = "t".repeat(64);
let registered = new Set<string>();
let puts: { path: string; query: string; body: any }[] = [];
let failPut = false;

const server = Bun.serve({
  port: 0,
  hostname: "127.0.0.1",
  async fetch(req) {
    const url = new URL(req.url);
    const dir = url.searchParams.get("location[directory]") ?? "";
    if (req.method === "PUT" && url.pathname === "/api/experimental/mcp/onesist") {
      const body = await req.json();
      puts.push({ path: url.pathname, query: dir, body });
      if (failPut) return new Response(JSON.stringify({ error: "bad config", echo: body }), { status: 400 });
      registered.add(dir);
      return new Response(null, { status: 204 });
    }
    if (req.method === "GET" && url.pathname === "/api/mcp") {
      return Response.json({ location: { directory: dir }, data: registered.has(dir) ? [{ name: "onesist", status: { status: "connected" } }] : [] });
    }
    return new Response(null, { status: 404 });
  },
});
afterAll(() => server.stop(true));

const conn: OpenCodeConnection = { baseUrl: `http://127.0.0.1:${server.port}`, authorization: basicAuth("pw") };
const mcp = { url: "http://localhost:4321/api/mcp/projects/p1", token: TOKEN };

beforeEach(() => {
  forgetOnesistMcp();
  registered = new Set();
  puts = [];
  failPut = false;
});

test("the first turn in a folder adds Onesist with the bearer token, codemode off, scoped to that folder", async () => {
  expect(await ensureOnesistMcp(conn, "/proj/a/", mcp)).toBe(true);
  expect(puts).toHaveLength(1);
  expect(puts[0].query).toBe("/proj/a/");
  expect(puts[0].body).toEqual({
    config: { type: "remote", url: mcp.url, headers: { Authorization: `Bearer ${TOKEN}` }, oauth: false, codemode: false },
  });
});

test("later turns only check, and add it again when OpenCode forgot it", async () => {
  await ensureOnesistMcp(conn, "/proj/a/", mcp);
  await ensureOnesistMcp(conn, "/proj/a/", mcp);
  expect(puts).toHaveLength(1);
  registered.clear(); // OpenCode restarted at the same URL
  expect(await ensureOnesistMcp(conn, "/proj/a/", mcp)).toBe(true);
  expect(puts).toHaveLength(2);
});

test("another folder gets its own registration", async () => {
  await ensureOnesistMcp(conn, "/proj/a/", mcp);
  await ensureOnesistMcp(conn, "/proj/b/", { ...mcp, url: "http://localhost:4321/api/mcp/projects/p2" });
  expect(puts.map((p) => p.query)).toEqual(["/proj/a/", "/proj/b/"]);
});

test("a refused registration is not fatal, and the token never reaches the log", async () => {
  failPut = true;
  const warn = spyOn(console, "warn").mockImplementation(() => {});
  try {
    expect(await ensureOnesistMcp(conn, "/proj/a/", mcp)).toBe(false);
    const logged = warn.mock.calls.flat().join(" ");
    expect(logged).toContain("Onesist MCP");
    expect(logged).not.toContain(TOKEN);
  } finally {
    warn.mockRestore();
  }
});
