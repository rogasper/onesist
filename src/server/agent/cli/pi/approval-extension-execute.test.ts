/**
 * Runs the approval extension's own source (transpiled, as Pi would load it) against a fake Pi,
 * so the `execute` branch is checked as it actually runs.
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { writeExecutePolicy } from "~/server/agent/execute-policy";
import { APPROVAL_EXTENSION_SOURCE } from "./approval-extension";

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-pi-execute-"));
let handler: (event: any, ctx: any) => Promise<any>;
let asked = 0;

beforeAll(async () => {
  writeExecutePolicy(folder, ["bun test"]);
  const file = path.join(folder, "extension.mjs");
  fs.writeFileSync(file, new Bun.Transpiler({ loader: "ts" }).transformSync(APPROVAL_EXTENSION_SOURCE));
  const mod = await import(file);
  process.env.ONESIST_PI_POLICY = "execute";
  mod.default({ on: (_name: string, fn: typeof handler) => (handler = fn) });
});

const ctx = () => ({ cwd: folder, ui: { confirm: async () => { asked++; return false; } } });

test("execute: writes inside the run folder run without a question", async () => {
  asked = 0;
  expect(await handler({ toolName: "edit", input: { path: "api/a.ts" } }, ctx())).toBeUndefined();
  expect(await handler({ toolName: "write", input: { path: path.join(folder, "api", "b.ts") } }, ctx())).toBeUndefined();
  expect(asked).toBe(0);
});

test("execute: writes outside the run folder ask, and a refusal blocks", async () => {
  asked = 0;
  const res = await handler({ toolName: "write", input: { path: "/etc/hosts" } }, ctx());
  expect(asked).toBe(1);
  expect(res?.block).toBe(true);
});

test("execute: a configured check runs, anything else asks", async () => {
  asked = 0;
  expect(await handler({ toolName: "bash", input: { command: "bun test" } }, ctx())).toBeUndefined();
  expect(asked).toBe(0);
  const res = await handler({ toolName: "bash", input: { command: "bun test && rm -rf api" } }, ctx());
  expect(asked).toBe(1);
  expect(res?.block).toBe(true);
});
