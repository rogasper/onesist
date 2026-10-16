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

test("a thread in a worktree goes there first", () => {
  expect(terminalResumeCommand(oc(), "ses_abc", "/Users/a/.onesist/worktrees/p1/api-fitur", "darwin")).toBe(
    "cd '/Users/a/.onesist/worktrees/p1/api-fitur' && opencode --session ses_abc",
  );
  expect(terminalResumeCommand(oc(), "ses_abc", "/Users/a/Library/Application Support/x/it's", "linux")).toBe(
    "cd '/Users/a/Library/Application Support/x/it'\\''s' && opencode --session ses_abc",
  );
  expect(terminalResumeCommand(oc(), "ses_abc", "C:\\Users\\a\\wt\\api", "win32")).toBe('cd /d "C:\\Users\\a\\wt\\api" && opencode --session ses_abc');
  expect(terminalResumeCommand(oc(), "ses_abc", 'C:\\a"b', "win32")).toBeNull();
  expect(terminalResumeCommand(oc(), "ses_abc", "C:\\%PATH%", "win32")).toBeNull();
  expect(terminalResumeCommand(oc(), "ses_abc", null, "darwin")).toBe("opencode --session ses_abc");
});

const agy = (cliPath: string | null = null) => ({ apiStyle: "cli", cliAgent: "antigravity", cliPath });

test("an Antigravity thread continues with agy --conversation, in its workspace", () => {
  const id = "4cd04889-9baa-49dc-80a0-74254a50372a";
  expect(terminalResumeCommand(agy(), id)).toBe(`agy --conversation ${id}`);
  expect(terminalResumeCommand(agy("/Users/a b/agy"), id, "/wt/api", "darwin")).toBe(`cd '/wt/api' && "/Users/a b/agy" --conversation ${id}`);
  expect(terminalResumeCommand(agy(), "ses_abc")).toBeNull();
  expect(terminalResumeCommand(agy(), `${id}; rm -rf ~`)).toBeNull();
});
