/**
 * JSON-RPC framing for `codex app-server`: requests are answered by id, notifications and
 * server requests reach their handlers, and a broken line never stops the stream.
 *
 *   bun test src/server/agent/cli/codex/rpc.test.ts
 */
import { expect, test } from "bun:test";
import { RpcClient } from "./rpc";

function pair() {
  const written: any[] = [];
  const client = new RpcClient((line) => written.push(JSON.parse(line)));
  return { client, written };
}

test("a request is written as one JSON line and resolved by its id", async () => {
  const { client, written } = pair();
  const pending = client.request("thread/start", { cwd: "/ws" });
  expect(written[0]).toMatchObject({ method: "thread/start", params: { cwd: "/ws" } });
  client.feed(JSON.stringify({ id: written[0].id, result: { thread: { id: "thr_1" } } }) + "\n");
  expect(await pending).toEqual({ thread: { id: "thr_1" } });
});

test("an error response rejects the request with the server's message", async () => {
  const { client, written } = pair();
  const pending = client.request("turn/start", {});
  client.feed(JSON.stringify({ id: written[0].id, error: { code: -32600, message: "thread tidak ditemukan" } }) + "\n");
  await expect(pending).rejects.toThrow("thread tidak ditemukan");
});

test("notifications and server requests reach their own handlers, in order", () => {
  const { client } = pair();
  const seen: string[] = [];
  client.onNotification((n) => seen.push(`n:${n.method}`));
  client.onServerRequest((r) => seen.push(`r:${r.method}:${r.id}`));
  client.feed(
    [
      JSON.stringify({ method: "item/started", params: { threadId: "t" } }),
      JSON.stringify({ id: 7, method: "item/commandExecution/requestApproval", params: { itemId: "i" } }),
      JSON.stringify({ method: "turn/completed", params: {} }),
    ].join("\n") + "\n",
  );
  expect(seen).toEqual(["n:item/started", "r:item/commandExecution/requestApproval:7", "n:turn/completed"]);
});

test("a line split across chunks is joined; a broken line is skipped and the next one still arrives", () => {
  const { client } = pair();
  const seen: string[] = [];
  client.onNotification((n) => seen.push(n.method));
  const line = JSON.stringify({ method: "item/agentMessage/delta", params: { delta: "halo" } });
  client.feed(line.slice(0, 10));
  client.feed(line.slice(10) + "\n{ rusak\n" + JSON.stringify({ method: "turn/completed", params: {} }) + "\n");
  expect(seen).toEqual(["item/agentMessage/delta", "turn/completed"]);
});

test("closing rejects every pending request and reports the reason once", async () => {
  const { client } = pair();
  const reasons: string[] = [];
  client.onClosed((r) => reasons.push(r));
  const pending = client.request("model/list", {}, 60_000);
  client.close("proses keluar");
  client.close("lagi");
  await expect(pending).rejects.toThrow("proses keluar");
  expect(reasons).toEqual(["proses keluar"]);
});

test("a request with no answer times out", async () => {
  const { client } = pair();
  await expect(client.request("account/read", {}, 20)).rejects.toThrow("melewati batas waktu");
});
