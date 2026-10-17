/**
 * Who may write a document across windows. A window is a client id with an open SSE
 * stream; its locks go when its last stream closes, so a closed or crashed window never
 * keeps a document locked.
 *
 *   bun test src/server/realtime/doc-locks.test.ts
 */
import { expect, test } from "bun:test";
import { createDocLocks } from "./doc-locks";

test("the first connected window gets the lock; claiming again is idempotent; another window is refused", () => {
  const locks = createDocLocks();
  locks.connect("winA");
  locks.connect("winB");
  expect(locks.claim("fsd:1", "winA")).toEqual({ ok: true });
  expect(locks.claim("fsd:1", "winA")).toEqual({ ok: true });
  expect(locks.claim("fsd:1", "winB")).toEqual({ ok: false, reason: "held", holder: "winA" });
  expect(locks.claim("fsd:2", "winB")).toEqual({ ok: true });
});

test("a window without an open stream cannot claim", () => {
  const locks = createDocLocks();
  expect(locks.claim("fsd:1", "ghost")).toEqual({ ok: false, reason: "not_connected" });
  expect(locks.holderOf("fsd:1")).toBeUndefined();
});

test("only the holder releases", () => {
  const locks = createDocLocks();
  locks.connect("winA");
  locks.connect("winB");
  locks.claim("fsd:1", "winA");
  expect(locks.release("fsd:1", "winB")).toBe(false);
  expect(locks.holderOf("fsd:1")).toBe("winA");
  expect(locks.release("fsd:1", "winA")).toBe(true);
  expect(locks.holderOf("fsd:1")).toBeUndefined();
});

test("a window's locks go when its last stream closes, not before", () => {
  const locks = createDocLocks();
  locks.connect("winA");
  locks.connect("winA"); // a reconnect overlaps the old stream
  locks.claim("fsd:1", "winA");
  locks.claim("fsd:2", "winA");
  expect(locks.disconnect("winA")).toEqual([]);
  expect(locks.holderOf("fsd:1")).toBe("winA");
  expect(locks.disconnect("winA").sort()).toEqual(["fsd:1", "fsd:2"]);
  expect(locks.isConnected("winA")).toBe(false);
  expect(locks.holderOf("fsd:1")).toBeUndefined();
});
