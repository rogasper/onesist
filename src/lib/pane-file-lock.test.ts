/**
 * One writer per document across split panes: the first pane to open a document
 * may write it, later panes read it, and the next pane takes over on release.
 *
 *   bun test src/lib/pane-file-lock.test.ts
 */
import { beforeEach, expect, test } from "bun:test";
import { claimFile, fileOwner, releaseFile, resetFileLocksForTest, subscribeFileLocks } from "./pane-file-lock";

beforeEach(() => resetFileLocksForTest());

test("the first owner wins and claiming again is idempotent", () => {
  expect(claimFile("fsd:a", "main")).toBe(true);
  expect(claimFile("fsd:a", "main")).toBe(true);
  expect(claimFile("fsd:a", "pane-0")).toBe(false);
  expect(fileOwner("fsd:a")).toBe("main");
});

test("different documents do not block each other", () => {
  expect(claimFile("fsd:a", "main")).toBe(true);
  expect(claimFile("fsd:b", "pane-0")).toBe(true);
});

test("only the owner can release, and release notifies listeners", () => {
  let calls = 0;
  const unsub = subscribeFileLocks(() => { calls += 1; });
  claimFile("fsd:a", "main");
  const afterClaim = calls;
  releaseFile("fsd:a", "pane-0");
  expect(fileOwner("fsd:a")).toBe("main");
  expect(calls).toBe(afterClaim);
  releaseFile("fsd:a", "main");
  expect(fileOwner("fsd:a")).toBeUndefined();
  expect(calls).toBe(afterClaim + 1);
  unsub();
});

test("a waiting pane takes over when its listener re-claims after release", () => {
  claimFile("fsd:a", "main");
  let paneCanWrite = claimFile("fsd:a", "pane-0");
  const unsub = subscribeFileLocks(() => { paneCanWrite = claimFile("fsd:a", "pane-0"); });
  expect(paneCanWrite).toBe(false);
  releaseFile("fsd:a", "main");
  expect(paneCanWrite).toBe(true);
  expect(fileOwner("fsd:a")).toBe("pane-0");
  unsub();
});
