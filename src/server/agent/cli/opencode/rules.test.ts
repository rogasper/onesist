/**
 * Onesist's permission modes as OpenCode session rules, plus the decisions taken
 * without asking and the mapping from the question's answer to OpenCode's reply.
 *
 *   bun test src/server/agent/cli/opencode/rules.test.ts
 */
import { expect, test } from "bun:test";
import { PERMISSION_OPTIONS, autoDecision, decisionFromAnswer, permissionQuestion, permissionRules, type OcRule } from "./rules";

const ask = (action: string): OcRule => ({ action, resource: "*", effect: "ask" });

test("auto in an agent thread allows everything", () => {
  expect(permissionRules("auto", "agent")).toEqual([{ action: "*", resource: "*", effect: "allow" }]);
});

test("ask mode asks before shell, edits and outside folders", () => {
  expect(permissionRules("ask", "agent")).toEqual([ask("shell"), ask("edit"), ask("external_directory")]);
  expect(permissionRules("no-shell", "agent")).toEqual([ask("shell"), ask("edit"), ask("external_directory")]);
});

test("read-only modes deny edits but never deny shell", () => {
  const expected: OcRule[] = [ask("shell"), { action: "edit", resource: "*", effect: "deny" }, ask("external_directory")];
  expect(permissionRules("readonly", "agent")).toEqual(expected);
  expect(permissionRules("auto", "plan")).toEqual(expected);
  expect(permissionRules("ask", "ask")).toEqual(expected);
  for (const mode of ["ask", "auto", "no-shell", "readonly"] as const) {
    for (const thread of ["ask", "agent", "plan"] as const) {
      expect(permissionRules(mode, thread).some((r) => (r.action === "shell" || r.action === "read") && r.effect === "deny")).toBe(false);
    }
  }
});

test("shell is refused without asking where the mode forbids it", () => {
  expect(autoDecision("no-shell", "agent", "shell")).toBe("reject");
  expect(autoDecision("readonly", "agent", "shell")).toBe("reject");
  expect(autoDecision("ask", "plan", "shell")).toBe("reject");
  expect(autoDecision("no-shell", "agent", "edit")).toBeNull();
  expect(autoDecision("ask", "agent", "shell")).toBeNull();
  expect(autoDecision("auto", "agent", "external_directory")).toBe("once");
});

test("the answer maps to OpenCode's reply and silence is a refusal", () => {
  expect(decisionFromAnswer(PERMISSION_OPTIONS[0])).toBe("once");
  expect(decisionFromAnswer(PERMISSION_OPTIONS[1])).toBe("always");
  expect(decisionFromAnswer(PERMISSION_OPTIONS[2])).toBe("reject");
  expect(decisionFromAnswer(null)).toBe("reject");
  expect(decisionFromAnswer("jawaban lain")).toBe("reject");
});

test("the question names the action and up to three resources", () => {
  expect(permissionQuestion("shell", ["echo hi"])).toBe("OpenCode meminta izin menjalankan perintah: echo hi.");
  expect(permissionQuestion("edit", ["a.md", "b.md", "c.md", "d.md"])).toBe("OpenCode meminta izin mengubah berkas: a.md, b.md, c.md.");
  expect(permissionQuestion("webfetch", [])).toBe('OpenCode meminta izin melakukan "webfetch".');
});
