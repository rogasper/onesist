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

const codex = (cliPath: string | null = null) => ({ apiStyle: "cli", cliAgent: "codex", cliPath });
const CODEX_THREAD = "019d2f7e-1a2b-7c3d-8e4f-5a6b7c8d9e0f";

test("a Codex thread continues with codex resume, in its workspace", () => {
  expect(terminalResumeCommand(codex(), CODEX_THREAD)).toBe(`codex resume ${CODEX_THREAD}`);
  expect(terminalResumeCommand(codex("/opt/codex"), CODEX_THREAD, "/wt/api", "darwin")).toBe(`cd '/wt/api' && /opt/codex resume ${CODEX_THREAD}`);
  expect(terminalResumeCommand(codex(), "thr_bukan_uuid")).toBeNull();
  expect(terminalResumeCommand(codex(), `${CODEX_THREAD}; rm -rf ~`)).toBeNull();
});

const claude = (cliPath: string | null = null) => ({ apiStyle: "cli", cliAgent: "claude", cliPath });
const CLAUDE_SESSION = "6f1c2c1e-1b7a-4f1e-9a49-2f8f1d1a0b11";

test("a Claude Code thread continues with claude --resume, in its workspace", () => {
  expect(terminalResumeCommand(claude(), CLAUDE_SESSION)).toBe(`claude --resume ${CLAUDE_SESSION}`);
  expect(terminalResumeCommand(claude("/opt/claude"), CLAUDE_SESSION, "/wt/api", "darwin")).toBe(`cd '/wt/api' && /opt/claude --resume ${CLAUDE_SESSION}`);
  expect(terminalResumeCommand(claude(), "bukan-uuid")).toBeNull();
  expect(terminalResumeCommand(claude(), `${CLAUDE_SESSION}; rm -rf ~`)).toBeNull();
});
