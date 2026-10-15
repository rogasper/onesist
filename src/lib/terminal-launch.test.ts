/**
 * Commands sent to the embedded terminal from the chat.
 *
 *   bun test src/lib/terminal-launch.test.ts
 */
import { expect, test } from "bun:test";
import { launchInTerminal, subscribeTerminalLaunch } from "./terminal-launch";

test("listeners hear each command; an unsubscribed one does not", () => {
  const heard: string[] = [];
  const off = subscribeTerminalLaunch((c) => heard.push(c));
  launchInTerminal("opencode --session ses_a");
  off();
  launchInTerminal("opencode --session ses_b");
  expect(heard).toEqual(["opencode --session ses_a"]);
});
