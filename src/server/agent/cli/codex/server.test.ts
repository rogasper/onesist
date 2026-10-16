/**
 * One shared `codex app-server` per binary: the handshake, sharing across callers, the
 * per-thread routing of notifications AND server requests (approvals), and the server going away.
 *
 *   bun test src/server/agent/cli/codex/server.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-codex-fake-"));
const fake = path.join(dir, "codex");
fs.writeFileSync(
  fake,
  `#!/usr/bin/env bun
const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  const msg = JSON.parse(line);
  if (msg.method === "initialize") console.log(JSON.stringify({ id: msg.id, result: { userAgent: "fake" } }));
  if (msg.method === "initialized") console.error("log: initialized");
  if (msg.method === "thread/start") {
    console.log(JSON.stringify({ id: msg.id, result: { thread: { id: "thr_a" } } }));
    console.log(JSON.stringify({ method: "item/agentMessage/delta", params: { threadId: "thr_a", turnId: "t", itemId: "i", delta: "A" } }));
    console.log(JSON.stringify({ method: "item/agentMessage/delta", params: { threadId: "thr_b", turnId: "t", itemId: "i", delta: "B" } }));
  }
  if (msg.method === "trigger") {
    console.log(JSON.stringify({ id: 42, method: "item/commandExecution/requestApproval", params: { threadId: "thr_b", turnId: "t", itemId: "c", command: "pwd" } }));
  }
});
process.on("SIGTERM", () => process.exit(0));
`,
);
fs.chmodSync(fake, 0o755);

const { getCodexConnection, liveCodexServers, stopCodexServers } = await import("./server");

test("one server serves every caller of the same binary, and the handshake completes first", async () => {
  const a = await getCodexConnection(fake);
  const b = await getCodexConnection(fake);
  expect(a).toBe(b);
  expect(liveCodexServers()).toBe(1);
  const started = await a.rpc.request("thread/start", { cwd: dir });
  expect(started.thread.id).toBe("thr_a");
});

test("a subscriber gets only notifications of its own thread", async () => {
  const conn = await getCodexConnection(fake);
  const got: string[] = [];
  const off = conn.subscribe("thr_a", (n) => got.push(n.params.delta));
  await conn.rpc.request("thread/start", { cwd: dir });
  await Bun.sleep(50);
  off();
  expect(got).toEqual(["A"]);
});

test("a server request (an approval) reaches only the thread it belongs to", async () => {
  const conn = await getCodexConnection(fake);
  const forA: number[] = [];
  const forB: number[] = [];
  const offA = conn.subscribeRequests("thr_a", (r) => forA.push(Number(r.id)));
  const offB = conn.subscribeRequests("thr_b", (r) => forB.push(Number(r.id)));
  conn.rpc.notify("trigger");
  await Bun.sleep(50);
  offA();
  offB();
  expect(forA).toEqual([]);
  expect(forB).toEqual([42]);
});

test("stopping the servers ends their processes", async () => {
  await getCodexConnection(fake);
  stopCodexServers();
  expect(liveCodexServers()).toBe(0);
});
