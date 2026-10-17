/**
 * What a pane may do with a document: the local claim (panes in this window) and the
 * server's answer (other windows) together.
 *
 *   bun test src/lib/doc-claim.test.ts
 */
import { expect, test } from "bun:test";
import { canWriteWith, serverClaimFrom } from "./doc-claim";
import { windowClientId } from "./window-client";

test("the server's answer: granted, held by another window, stream not open yet, or unusable", () => {
  expect(serverClaimFrom(200, { ok: true })).toBe("ok");
  expect(serverClaimFrom(200, { ok: false, reason: "held" })).toBe("held");
  expect(serverClaimFrom(200, { ok: false, reason: "not_connected" })).toBe("pending");
  expect(serverClaimFrom(400, { error: "x" })).toBe("unavailable");
  expect(serverClaimFrom(500, null)).toBe("unavailable");
});

test("writing needs the local claim and the server's; while waiting, read-only; without a server, local only", () => {
  expect(canWriteWith(true, "ok")).toBe(true);
  expect(canWriteWith(true, "held")).toBe(false);
  expect(canWriteWith(true, "pending")).toBe(false);
  expect(canWriteWith(true, "unavailable")).toBe(true);
  expect(canWriteWith(false, "ok")).toBe(false);
});

test("the window's client id is stable and fits the server's format", () => {
  const id = windowClientId();
  expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  expect(windowClientId()).toBe(id);
});
