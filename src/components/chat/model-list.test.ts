/**
 * Regression: a provider with many models shows a short list, keeps the selected model in
 * view, and lets a search reach every model.
 *
 *   bun test src/components/chat/model-list.test.ts
 */
import { expect, test } from "bun:test";
import { visibleModels } from "./model-list";

const many = Array.from({ length: 20 }, (_, i) => `model-${i}`);

test("without a search, a long list is cut to the limit and says how many are hidden", () => {
  const { shown, hidden } = visibleModels(many, { query: "", expanded: false, selected: null });
  expect(shown.length).toBe(8);
  expect(hidden).toBe(12);
  expect(shown[0]).toBe("model-0");
});

test("the selected model stays visible even when it is beyond the limit", () => {
  const { shown, hidden } = visibleModels(many, { query: "", expanded: false, selected: "model-15" });
  expect(shown[0]).toBe("model-15");
  expect(shown.length).toBe(8);
  expect(hidden).toBe(12);
});

test("a short list is shown whole", () => {
  expect(visibleModels(["a", "b"], { query: "", expanded: false, selected: null })).toEqual({ shown: ["a", "b"], hidden: 0 });
});

test("expanded shows the whole list", () => {
  const { shown, hidden } = visibleModels(many, { query: "", expanded: true, selected: null });
  expect(shown.length).toBe(20);
  expect(hidden).toBe(0);
});

test("a search reaches every match, not just the first page, and ignores case", () => {
  const { shown, hidden } = visibleModels(many, { query: "MODEL-1", expanded: false, selected: null });
  expect(shown).toEqual(["model-1", "model-10", "model-11", "model-12", "model-13", "model-14", "model-15", "model-16", "model-17", "model-18", "model-19"]);
  expect(hidden).toBe(0);
});
