/**
 * YOLO (`permissionMode: "auto"`) means full access with no manual approval — including the
 * paths FR-E3 protects, because picking the mode is the confirmation. Every other mode still
 * routes protected paths to the approval card.
 *
 *   bun test src/server/agent/yolo-policy.test.ts
 */
import { expect, test } from "bun:test";
import { isProtectedPath, PROTECTED_PATH_PATTERNS } from "./types";
import { codexPolicy } from "./cli/codex/policy";

test("the protected patterns still catch the source and skill folders", () => {
  expect(PROTECTED_PATH_PATTERNS.length).toBeGreaterThan(0);
  expect(isProtectedPath("input/fsd/klaim.md")).toBe(true);
  expect(isProtectedPath("MASTER_SPEC.md")).toBe(true);
  expect(isProtectedPath(".git/config")).toBe(true);
  expect(isProtectedPath(".agents/skills/fsd-analyzer/SKILL.md")).toBe(true);
  expect(isProtectedPath("output/fsd/klaim.md")).toBe(false);
});

test("YOLO lifts Codex's sandbox entirely, the other modes keep it", () => {
  expect(codexPolicy("auto", "agent").sandbox).toBe("danger-full-access");
  expect(codexPolicy("auto", "agent").ask).toBe(false);
  // Read-only modes never widen the sandbox, whatever the mode name.
  expect(codexPolicy("readonly", "agent").sandbox).toBe("read-only");
  expect(codexPolicy("no-shell", "agent").sandbox).toBe("read-only");
  // ask and execute stay inside the workspace and keep the approval round-trip.
  expect(codexPolicy("ask", "agent").sandbox).toBe("workspace-write");
  expect(codexPolicy("execute", "agent").sandbox).toBe("workspace-write");
});
