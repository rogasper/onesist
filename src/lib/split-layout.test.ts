/**
 * Split-view layout model: URL round-trip, pane operations, arrangement, ratios.
 *
 *   bun test src/lib/split-layout.test.ts
 */
import { expect, test } from "bun:test";
import {
  EMPTY_SPLIT,
  MAX_EXTRA_PANES,
  addPane,
  arrangementFor,
  clampRatio,
  parseSplitSearch,
  ratioFromPointer,
  readStoredSplit,
  removePane,
  serializeSplit,
  setPaneTab,
  setRatio,
  shiftDirtyAfterRemove,
  splitStorageKey,
} from "./split-layout";

test("an empty search is an empty split", () => {
  expect(parseSplitSearch({})).toEqual(EMPTY_SPLIT);
});

test("parse keeps known tabs in order, drops unknown and empty ones, caps at three", () => {
  const s = parseSplitSearch({ panes: "foo,erd,,tasks,spec,fsd", pdir: "v", pr: "0.3,0.7" });
  expect(s.panes).toEqual(["erd", "tasks", "spec"]);
  expect(s.panes.length).toBe(MAX_EXTRA_PANES);
  expect(s.dir).toBe("v");
  expect(s.ratios).toEqual([0.3, 0.7]);
});

test("the same tab may appear in several panes", () => {
  expect(parseSplitSearch({ panes: "fsd,fsd" }).panes).toEqual(["fsd", "fsd"]);
});

test("broken ratios fall back to 0.5 and out-of-range ones are clamped", () => {
  expect(parseSplitSearch({ panes: "erd", pr: "abc," }).ratios).toEqual([0.5, 0.5]);
  expect(parseSplitSearch({ panes: "erd", pr: "0.05,0.99" }).ratios).toEqual([0.2, 0.8]);
});

test("a numeric pr (TanStack parses `pr=0.4` as a number) is read as the first ratio", () => {
  expect(parseSplitSearch({ panes: "erd", pr: 0.4 }).ratios).toEqual([0.4, 0.5]);
});

test("an unknown direction is horizontal", () => {
  expect(parseSplitSearch({ panes: "erd", pdir: "x" }).dir).toBe("h");
});

test("serialize round-trips and an empty split removes every key", () => {
  const s = { panes: ["spec", "tasks"] as const, dir: "v" as const, ratios: [0.35, 0.6] as [number, number] };
  const out = serializeSplit({ ...s, panes: [...s.panes] });
  expect(out).toEqual({ panes: "spec,tasks", pdir: "v", pr: "0.35,0.60" });
  expect(parseSplitSearch(out)).toEqual({ panes: ["spec", "tasks"], dir: "v", ratios: [0.35, 0.6] });
  expect(serializeSplit(EMPTY_SPLIT)).toEqual({ panes: undefined, pdir: undefined, pr: undefined });
});

test("stored layouts are read defensively", () => {
  expect(readStoredSplit(null)).toEqual(EMPTY_SPLIT);
  expect(readStoredSplit("{not json")).toEqual(EMPTY_SPLIT);
  expect(readStoredSplit("[1,2]")).toEqual(EMPTY_SPLIT);
  expect(readStoredSplit(JSON.stringify({ panes: "erd", pdir: "h", pr: "0.4,0.5" })).panes).toEqual(["erd"]);
  expect(splitStorageKey("p1")).toBe("onesist:split:p1");
});

test("addPane appends, sets the direction only for the first pane, and stops at three", () => {
  let s = addPane(EMPTY_SPLIT, "erd", "v");
  expect(s).toEqual({ panes: ["erd"], dir: "v", ratios: [0.5, 0.5] });
  s = addPane(s, "spec", "h");
  expect(s.dir).toBe("v");
  s = addPane(addPane(s, "tasks"), "fsd");
  expect(s.panes).toEqual(["erd", "spec", "tasks"]);
});

test("removePane, setPaneTab and setRatio return new states and ignore bad indexes", () => {
  const s = { panes: ["erd", "spec", "tasks"] as ("erd" | "spec" | "tasks")[], dir: "h" as const, ratios: [0.5, 0.5] as [number, number] };
  expect(removePane(s, 1).panes).toEqual(["erd", "tasks"]);
  expect(removePane(s, 9)).toBe(s);
  expect(setPaneTab(s, 0, "fsd").panes).toEqual(["fsd", "spec", "tasks"]);
  expect(setPaneTab(s, -1, "fsd")).toBe(s);
  expect(setRatio(s, 1, 0.95).ratios).toEqual([0.5, 0.8]);
  expect(s.panes).toEqual(["erd", "spec", "tasks"]);
});

test("arrangement follows pane count and direction, and stacks on a narrow window", () => {
  expect(arrangementFor(0, "h", 1400)).toBe("single");
  expect(arrangementFor(1, "h", 1400)).toBe("cols");
  expect(arrangementFor(1, "v", 1400)).toBe("rows");
  expect(arrangementFor(2, "h", 1400)).toBe("main-stack");
  expect(arrangementFor(3, "v", 1400)).toBe("grid");
  expect(arrangementFor(2, "h", 700)).toBe("stack");
  expect(arrangementFor(0, "h", 700)).toBe("single");
});

test("ratioFromPointer measures from the start edge and is clamped", () => {
  expect(ratioFromPointer(300, 100, 400)).toBe(0.5);
  expect(ratioFromPointer(100, 100, 400)).toBe(0.2);
  expect(ratioFromPointer(900, 100, 400)).toBe(0.8);
  expect(ratioFromPointer(300, 100, 0)).toBe(0.5);
});

test("clampRatio turns non-numbers into 0.5", () => {
  expect(clampRatio(Number.NaN)).toBe(0.5);
  expect(clampRatio(Number.POSITIVE_INFINITY)).toBe(0.5);
});

test("dirty flags follow their pane when an earlier pane is closed", () => {
  expect(shiftDirtyAfterRemove({ 0: true, 1: false, 2: true }, 1)).toEqual({ 0: true, 1: true });
  expect(shiftDirtyAfterRemove({ 0: true }, 0)).toEqual({});
});
