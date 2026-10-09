/**
 * Regression: replies settle the request with the same id; events reach listeners; a timed-out
 * request fails instead of hanging.
 *
 *   bun test src/server/browser/cdp.test.ts
 */
import { expect, test } from "bun:test";
import { CdpClient, type SocketLike } from "./cdp";

function fakeSocket(): SocketLike & { sent: any[] } {
  const sent: any[] = [];
  return { sent, send(d: string) { sent.push(JSON.parse(d)); }, close() {}, onmessage: null, onopen: null, onerror: null };
}

test("a reply settles the request with the same id", async () => {
  const socket = fakeSocket();
  const client = new CdpClient(socket, 1000);
  const pending = client.send("Target.createTarget", { url: "about:blank" });
  const id = socket.sent[0].id;
  client.handle(JSON.stringify({ id, result: { targetId: "t1" } }));
  expect(await pending).toEqual({ targetId: "t1" });
});

test("a CDP error rejects the request", async () => {
  const socket = fakeSocket();
  const client = new CdpClient(socket, 1000);
  const pending = client.send("Page.navigate", { url: "x" });
  client.handle(JSON.stringify({ id: socket.sent[0].id, error: { message: "Cannot navigate" } }));
  await expect(pending).rejects.toThrow("Cannot navigate");
});

test("events reach listeners, and a removed listener hears nothing more", () => {
  const client = new CdpClient(fakeSocket(), 1000);
  const seen: string[] = [];
  const off = client.on((ev) => seen.push(ev.method));
  client.handle(JSON.stringify({ method: "Page.loadEventFired", params: {} }));
  off();
  client.handle(JSON.stringify({ method: "Page.frameNavigated", params: {} }));
  expect(seen).toEqual(["Page.loadEventFired"]);
});

test("a request with no reply times out", async () => {
  const client = new CdpClient(fakeSocket(), 20);
  await expect(client.send("Page.enable")).rejects.toThrow("timed out");
});
