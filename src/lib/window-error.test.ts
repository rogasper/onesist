/**
 * What the user sees when a window cannot be opened: the desktop's own message ("Limit 5 window
 * tercapai"), or a plain fallback when the error has no text.
 *
 *   bun test src/lib/window-error.test.ts
 */
import { expect, test } from "bun:test";
import { windowErrorText } from "./window-error";

test("the desktop's message is shown as it is", () => {
  expect(windowErrorText("Limit 5 window tercapai")).toBe("Limit 5 window tercapai");
  expect(windowErrorText(new Error("Limit 5 window tercapai"))).toBe("Limit 5 window tercapai");
});

test("an error without text gets a plain fallback", () => {
  expect(windowErrorText(undefined)).toBe("Window tidak bisa dibuka.");
  expect(windowErrorText({})).toBe("Window tidak bisa dibuka.");
  expect(windowErrorText("")).toBe("Window tidak bisa dibuka.");
});
