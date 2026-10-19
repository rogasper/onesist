/**
 * Wiring guard for run recovery in ChatSurface. The rules live in chat-state.ts and are
 * tested there; this file checks that the component uses them where a stream failure,
 * a retry or an edit can happen, so the paths cannot quietly drop back to the old
 * behaviour (an error banner over a run that is still going, a 409 shown to the user).
 *
 *   bun test src/components/chat/recovery-wiring.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const src = fs.readFileSync(path.join(import.meta.dir, "ChatSurface.tsx"), "utf-8");

test("a stream error is checked against the server before it is shown", () => {
  expect(src).toMatch(/status !== "error"[\s\S]{0,400}threadHasRunningTurn/);
  expect(src).toContain("afterStreamEnded({ errored: true, serverRunning })");
});
test("the error banner is hidden while a run is going", () => {
  expect(src).toContain("{error && !busy ? (");
});
test("retry and edit wait for the run instead of posting into a 409", () => {
  expect(src).toContain("resendBlock({ busy, serverRunning })");
  expect(src).toContain('data.code === "run_active"');
});
test("a live connection that comes back re-checks the run", () => {
  expect(src).toContain('if (status === "error") void followIfStillRunning();');
});
