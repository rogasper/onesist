/**
 * The terminal command that continues an OpenCode thread. Only a well-formed session id
 * and the provider's binary reach the command line.
 *
 *   bun test src/server/agent/cli/opencode/resume.test.ts
 */
import { expect, test } from "bun:test";
import { terminalResumeCommand } from "./resume";

const oc = (cliPath: string | null = null) => ({ apiStyle: "cli", cliAgent: "opencode", cliPath });

test("an OpenCode thread continues with opencode --session", () => {
  expect(terminalResumeCommand(oc(), "ses_ec2d2503bffeUsiz6zcHJ0pvQz")).toBe("opencode --session ses_ec2d2503bffeUsiz6zcHJ0pvQz");
});

test("the provider's own binary is used, quoted when it has spaces", () => {
  expect(terminalResumeCommand(oc("/opt/oc/bin/opencode"), "ses_abc")).toBe("/opt/oc/bin/opencode --session ses_abc");
  expect(terminalResumeCommand(oc("/Users/a b/opencode"), "ses_abc")).toBe('"/Users/a b/opencode" --session ses_abc');
});

test("no session, a malformed session id, or a non-OpenCode provider gives no command", () => {
  expect(terminalResumeCommand(oc(), null)).toBeNull();
  expect(terminalResumeCommand(oc(), "ses_abc; rm -rf ~")).toBeNull();
  expect(terminalResumeCommand(oc(), "abc")).toBeNull();
  expect(terminalResumeCommand({ apiStyle: "completions", cliAgent: null, cliPath: null }, "ses_abc")).toBeNull();
  expect(terminalResumeCommand({ apiStyle: "cli", cliAgent: "claude", cliPath: null }, "ses_abc")).toBeNull();
});
