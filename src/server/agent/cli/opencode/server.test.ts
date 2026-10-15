/**
 * The OpenCode server Onesist owns: spawned once with a random password and
 * reused, attached instead when SA_OPENCODE_URL is set, a clear error when the
 * binary is missing. A fake `opencode` (a Bun script) stands in for the real one.
 *
 *   bun test src/server/agent/cli/opencode/server.test.ts
 */
import { afterAll, afterEach, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { basicAuth, ocInfo } from "./client";
import { getOpenCodeConnection, openCodeServerPid, stopOpenCodeServer } from "./server";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-fake-opencode-"));
const fake = path.join(dir, "opencode");
fs.writeFileSync(
  fake,
  `#!/usr/bin/env bun
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]);
const expected = "Basic " + Buffer.from("opencode:" + (process.env.OPENCODE_PASSWORD ?? "")).toString("base64");
Bun.serve({ hostname: "127.0.0.1", port, fetch(req) {
  if (req.headers.get("authorization") !== expected) return new Response("no", { status: 401 });
  if (new URL(req.url).pathname === "/api/info") return Response.json({ version: "2.0.0-fake" });
  return new Response("{}");
} });
console.log("Server listening on http://127.0.0.1:" + port);
`,
);
fs.chmodSync(fake, 0o755);

const clearAttach = () => {
  delete process.env.SA_OPENCODE_URL;
  delete process.env.SA_OPENCODE_PASSWORD;
};
// Another test file may have left attach mode on (one process runs them all).
beforeEach(clearAttach);
afterEach(() => {
  stopOpenCodeServer();
  clearAttach();
});
afterAll(() => stopOpenCodeServer());

test("the server is spawned once, answers with its password, and is reused", async () => {
  const conn = await getOpenCodeConnection({ binary: fake });
  expect(conn.baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(await ocInfo(conn)).toEqual({ version: "2.0.0-fake" });
  const pid = openCodeServerPid();
  expect(pid).not.toBeNull();
  const again = await getOpenCodeConnection({ binary: fake });
  expect(again).toEqual(conn);
  expect(openCodeServerPid()).toBe(pid);
});

test("concurrent first calls share one spawn", async () => {
  const [a, b] = await Promise.all([getOpenCodeConnection({ binary: fake }), getOpenCodeConnection({ binary: fake })]);
  expect(a).toEqual(b);
});

test("stopping kills the process and the next call starts a new one", async () => {
  await getOpenCodeConnection({ binary: fake });
  const first = openCodeServerPid();
  stopOpenCodeServer();
  expect(openCodeServerPid()).toBeNull();
  await getOpenCodeConnection({ binary: fake });
  expect(openCodeServerPid()).not.toBe(first);
});

test("a missing binary fails fast with a clear message", async () => {
  await expect(getOpenCodeConnection({ binary: path.join(dir, "tidak-ada") })).rejects.toThrow("OpenCode tidak ditemukan");
});

test("SA_OPENCODE_URL attaches to a running server without spawning", async () => {
  process.env.SA_OPENCODE_URL = "http://127.0.0.1:9/";
  process.env.SA_OPENCODE_PASSWORD = "rahasia";
  const conn = await getOpenCodeConnection({ binary: path.join(dir, "tidak-ada") });
  expect(conn).toEqual({ baseUrl: "http://127.0.0.1:9", authorization: basicAuth("rahasia") });
  expect(openCodeServerPid()).toBeNull();
});
