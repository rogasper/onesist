/**
 * The origin this Onesist server is reached at, as OpenCode is told to reach Onesist's
 * MCP endpoint. Only loopback origins count: a DNS-rebinding page must never make
 * Onesist hand its MCP token to a foreign host.
 *
 *   bun test src/server/self-origin.test.ts
 */
import { beforeEach, expect, test } from "bun:test";
import { isLoopbackOrigin, rememberOrigin, resetSelfOrigin, selfOrigin } from "./self-origin";

beforeEach(() => resetSelfOrigin());

test("loopback origins are remembered", () => {
  rememberOrigin("http://localhost:4321/api/chat/threads");
  expect(selfOrigin()).toBe("http://localhost:4321");
  rememberOrigin("http://127.0.0.1:4400/api/health");
  expect(selfOrigin()).toBe("http://127.0.0.1:4400");
  rememberOrigin("http://[::1]:4321/api/health");
  expect(selfOrigin()).toBe("http://[::1]:4321");
});

test("any other host is ignored and the last loopback origin stays", () => {
  rememberOrigin("http://localhost:4321/api/x");
  rememberOrigin("http://evil.example:4321/api/x");
  rememberOrigin("http://localhost.evil.example/api/x");
  rememberOrigin("bukan url");
  expect(selfOrigin()).toBe("http://localhost:4321");
});

test("nothing seen yet means no origin", () => {
  expect(selfOrigin()).toBeNull();
  expect(isLoopbackOrigin("ftp://localhost")).toBe(false);
});
