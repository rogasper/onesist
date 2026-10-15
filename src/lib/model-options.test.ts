/**
 * A thread's model options: what is accepted, how it is stored, and when a change of
 * model throws the old choice away.
 *
 *   bun test src/lib/model-options.test.ts
 */
import { expect, test } from "bun:test";
import { activeChoice, nextModelOptionsJson, parseModelOptions, serializeModelOptions, withModelOption } from "./model-options";

test("only short string values under simple keys are kept", () => {
  expect(parseModelOptions('{"variant":"high"}')).toEqual({ variant: "high" });
  expect(parseModelOptions({ variant: " low ", n: 3, "bad key": "x", empty: "  " })).toEqual({ variant: "low" });
  expect(parseModelOptions({ variant: "x".repeat(65) })).toEqual({});
  expect(parseModelOptions("bukan json")).toEqual({});
  expect(parseModelOptions(null)).toEqual({});
  expect(parseModelOptions(["high"])).toEqual({});
});

test("no options are stored as null", () => {
  expect(serializeModelOptions({})).toBeNull();
  expect(serializeModelOptions({ variant: "high" })).toBe('{"variant":"high"}');
});

test("options sent with the patch win; a model change without options clears them; otherwise nothing changes", () => {
  expect(nextModelOptionsJson({ modelOptions: { variant: "max" } }, true)).toBe('{"variant":"max"}');
  expect(nextModelOptionsJson({ modelOptions: null }, false)).toBeNull();
  expect(nextModelOptionsJson({ model: "go/other" }, true)).toBeNull();
  expect(nextModelOptionsJson({ title: "x" }, false)).toBeUndefined();
});

test("setting one option keeps the others; null removes it", () => {
  expect(withModelOption({ variant: "low", agent: "plan" }, "variant", "high")).toEqual({ variant: "high", agent: "plan" });
  expect(withModelOption({ variant: "low" }, "variant", null)).toEqual({});
});

test("the active choice is the stored one only when the model still offers it", () => {
  const descriptor = { id: "variant", label: "Tingkat berpikir", type: "select" as const, choices: [{ value: "low", label: "Rendah" }, { value: "high", label: "Tinggi" }] };
  expect(activeChoice(descriptor, { variant: "high" })).toBe("high");
  expect(activeChoice(descriptor, { variant: "max" })).toBeNull();
  expect(activeChoice(descriptor, {})).toBeNull();
});
