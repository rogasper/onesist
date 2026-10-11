/**
 * Regression: the model list a provider reports is kept whole for the picker, but only
 * clean ids are stored: trimmed, unique, in order, and capped.
 *
 *   bun test src/server/agent/model-list.test.ts
 */
import { expect, test } from "bun:test";
import { MAX_STORED_MODELS, modelIdsToStore } from "./config";

test("stored ids are trimmed, unique, and keep the discovery order", () => {
  const ids = modelIdsToStore([{ id: " gpt-4o " }, { id: "gpt-4o-mini" }, { id: "gpt-4o" }, { id: "o3" }]);
  expect(ids).toEqual(["gpt-4o", "gpt-4o-mini", "o3"]);
});

test("empty ids are dropped", () => {
  expect(modelIdsToStore([{ id: "  " }, { id: "" }, { id: "llama" }])).toEqual(["llama"]);
});

test("the list is capped so a huge gateway list cannot bloat the row", () => {
  const many = Array.from({ length: MAX_STORED_MODELS + 40 }, (_, i) => ({ id: `m-${i}` }));
  const ids = modelIdsToStore(many);
  expect(ids.length).toBe(MAX_STORED_MODELS);
  expect(ids[0]).toBe("m-0");
  expect(ids[MAX_STORED_MODELS - 1]).toBe(`m-${MAX_STORED_MODELS - 1}`);
});
