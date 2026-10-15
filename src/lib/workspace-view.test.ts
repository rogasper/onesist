/**
 *   bun test src/lib/workspace-view.test.ts
 */
import { expect, test } from "bun:test";
import { workspaceLabel } from "./workspace-view";

test("a workspace is named by where the agent works", () => {
  expect(workspaceLabel(null)).toBe("Root project");
  expect(workspaceLabel({ strategy: null, repo: null, branch: null })).toBe("Root project");
  expect(workspaceLabel({ strategy: "root", repo: "input/code/api", branch: "main" })).toBe("Repo input/code/api · main");
  expect(workspaceLabel({ strategy: "root", repo: ".", branch: null })).toBe("Repo root project");
  expect(workspaceLabel({ strategy: "worktree", repo: "input/code/api", branch: "onesist/fitur" })).toBe("Worktree onesist/fitur · input/code/api");
  expect(workspaceLabel({ strategy: "existing_worktree", repo: ".", branch: null })).toBe("Worktree (tanpa branch) · root project");
});
