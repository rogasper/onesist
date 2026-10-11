import { describe, expect, test } from "bun:test";
import { shouldCompactBeforeTurn } from "~/server/agent/compaction";
import { COMPACT_THRESHOLD } from "~/server/agent/context";

describe("shouldCompactBeforeTurn", () => {
  test("compacts a splittable thread at or over the threshold", () => {
    expect(shouldCompactBeforeTurn({ ratio: COMPACT_THRESHOLD, splittable: true })).toBe(true);
    expect(shouldCompactBeforeTurn({ ratio: 0.95, splittable: true })).toBe(true);
  });

  test("leaves a thread under the threshold alone", () => {
    expect(shouldCompactBeforeTurn({ ratio: COMPACT_THRESHOLD - 0.01, splittable: true })).toBe(false);
  });

  test("does nothing when there is no older turn to take", () => {
    expect(shouldCompactBeforeTurn({ ratio: 0.99, splittable: false })).toBe(false);
  });
});
