/**
 * Where a provider's OpenCode runs, read from the provider row's existing columns.
 *
 *   bun test src/server/agent/cli/opencode/target.test.ts
 */
import { expect, test } from "bun:test";
import { openCodeTargetOf } from "./target";

test("a provider row maps to binary, server URL and server password", () => {
  expect(openCodeTargetOf({ cliPath: " /opt/oc/bin/opencode ", endpoint: "http://127.0.0.1:4096", apiKey: "rahasia" })).toEqual({
    binary: "/opt/oc/bin/opencode",
    serverUrl: "http://127.0.0.1:4096",
    serverPassword: "rahasia",
  });
});

test("empty fields mean the opencode on PATH, a server Onesist spawns, and no password", () => {
  expect(openCodeTargetOf({ cliPath: null, endpoint: "  ", apiKey: "" })).toEqual({ binary: "opencode", serverUrl: null, serverPassword: null });
});
