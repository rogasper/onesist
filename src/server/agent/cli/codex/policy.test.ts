/**
 * Onesist's permission modes in Codex's terms, and the answers to its approval requests.
 *
 *   bun test src/server/agent/cli/codex/policy.test.ts
 */
import { expect, test } from "bun:test";
import { codexPolicy, decisionFor } from "./policy";

test("ask asks on request inside a workspace; auto never asks; read-only modes never write", () => {
  expect(codexPolicy("ask", "agent")).toEqual({ approvalPolicy: "on-request", sandbox: "workspace-write", ask: true });
  expect(codexPolicy("auto", "agent")).toEqual({ approvalPolicy: "never", sandbox: "workspace-write", ask: false });
  expect(codexPolicy("no-shell", "agent")).toEqual({ approvalPolicy: "never", sandbox: "read-only", ask: false });
  expect(codexPolicy("readonly", "agent")).toEqual({ approvalPolicy: "never", sandbox: "read-only", ask: false });
  expect(codexPolicy("auto", "plan")).toEqual({ approvalPolicy: "never", sandbox: "read-only", ask: false });
});

test("the dialog's answers become Codex decisions; anything unanswered declines", () => {
  expect(decisionFor("Izinkan sekali", "command")).toBe("accept");
  expect(decisionFor("Selalu izinkan", "file")).toBe("acceptForSession");
  expect(decisionFor("Tolak", "command")).toBe("decline");
  expect(decisionFor(null, "file")).toBe("decline");
});
