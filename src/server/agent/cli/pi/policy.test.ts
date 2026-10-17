/**
 * Onesist's permission modes in the approval extension's terms, and the extension's source
 * and its placement in the app's data folder (never in the working directory).
 *
 *   bun test src/server/agent/cli/pi/policy.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { piPolicy, PI_APPROVAL_TITLE } from "./policy";
import { APPROVAL_EXTENSION_SOURCE, ensureApprovalExtension } from "./approval-extension";

test("ask confirms each write; auto never asks; read-only modes block writes outright", () => {
  expect(piPolicy("ask", "agent")).toBe("ask");
  expect(piPolicy("auto", "agent")).toBe("auto");
  expect(piPolicy("readonly", "agent")).toBe("readonly");
  expect(piPolicy("no-shell", "agent")).toBe("readonly");
  expect(piPolicy("auto", "plan")).toBe("readonly");
  expect(piPolicy("ask", "ask")).toBe("readonly");
});

test("the dialog names the tool in Indonesian", () => {
  expect(PI_APPROVAL_TITLE("bash")).toBe("Izinkan Pi memakai bash?");
  expect(PI_APPROVAL_TITLE("edit")).toBe("Izinkan Pi memakai edit?");
});

test("the extension is the Pi extension shape, reads its policy from the environment, and asks through ctx.ui.confirm", () => {
  expect(APPROVAL_EXTENSION_SOURCE).toContain("export default function");
  expect(APPROVAL_EXTENSION_SOURCE).toContain('pi.on("tool_call"');
  expect(APPROVAL_EXTENSION_SOURCE).toContain("ctx.ui.confirm");
  expect(APPROVAL_EXTENSION_SOURCE).toContain("ONESIST_PI_POLICY");
  expect(APPROVAL_EXTENSION_SOURCE).toContain("block: true");
});

test("the extension is written under the data folder, rewritten when it changes, and never into the working directory", () => {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-pi-data-"));
  const file = ensureApprovalExtension(data);
  expect(file).toBe(path.join(data, "pi", "onesist-approval.ts"));
  expect(fs.readFileSync(file, "utf-8")).toBe(APPROVAL_EXTENSION_SOURCE);
  fs.writeFileSync(file, "lama");
  expect(ensureApprovalExtension(data)).toBe(file);
  expect(fs.readFileSync(file, "utf-8")).toBe(APPROVAL_EXTENSION_SOURCE);
});
