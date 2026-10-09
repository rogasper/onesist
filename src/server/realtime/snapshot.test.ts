/**
 * Regression: the first scan of a project is silent; later scans announce only real
 * creations, changes and deletions.
 *
 *   bun test src/server/realtime/snapshot.test.ts
 */
import { expect, test } from "bun:test";
import { diffSnapshot } from "./snapshot";

test("the first scan of a root announces nothing", () => {
  const first = new Map([["/p/output/a.md", 1000]]);
  expect(diffSnapshot(null, first)).toEqual({ created: [], changed: [], deleted: [] });
});

test("a later scan reports creations, changes and deletions", () => {
  const prev = new Map([
    ["/p/output/a.md", 1000],
    ["/p/output/b.md", 1000],
  ]);
  const next = new Map([
    ["/p/output/a.md", 5000],
    ["/p/output/c.md", 1000],
  ]);
  expect(diffSnapshot(prev, next)).toEqual({
    created: ["/p/output/c.md"],
    changed: ["/p/output/a.md"],
    deleted: ["/p/output/b.md"],
  });
});

test("mtime jitter within the tolerance is not a change", () => {
  const prev = new Map([["/p/a.md", 1000]]);
  const next = new Map([["/p/a.md", 1030]]);
  expect(diffSnapshot(prev, next).changed).toEqual([]);
});
