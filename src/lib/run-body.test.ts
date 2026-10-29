import { expect, test } from "bun:test";
import { buildRunBody } from "./run-body";

test("the PR body carries the summary, the criteria with their status, the checks, and the sibling PRs", () => {
  const body = buildRunBody({
    code: "api-V-1",
    title: "Login",
    summary: "Endpoint login dengan OTP.",
    revision: 2,
    acceptance: [
      { criterion: "Login memakai OTP", status: "met" },
      { criterion: "Log gagal", status: "missing" },
    ],
    checks: [{ repo: "input/code/api", name: "test", ok: true }],
    siblings: ["https://github.com/x/y/pull/3"],
  });
  expect(body).toContain("Endpoint login dengan OTP.");
  expect(body).toContain("- [x] Login memakai OTP");
  expect(body).toContain("- [ ] Log gagal (belum terbukti)");
  expect(body).toContain("test (input/code/api): lolos");
  expect(body).toContain("https://github.com/x/y/pull/3");
  expect(body).toContain("Revisi: 2");
  expect(body).toContain("Generated with [Claude Code]");
});

test("the body never carries command output", () => {
  const body = buildRunBody({ code: "a", title: "b", summary: "", revision: 1, acceptance: [], checks: [], siblings: [] });
  expect(body).not.toContain("tail");
});
