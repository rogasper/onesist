/**
 * Focus mode is a transient view state: entering folds the sidebar, pinning is only meaningful
 * inside the mode, and leaving always gives the workspace back in its normal shape.
 *
 *   bun test src/lib/focus-mode.test.ts
 */
import { beforeEach, expect, test } from "bun:test";
import {
  enterFocusMode,
  exitFocusMode,
  isFocusMode,
  isFocusModeToggleKey,
  isFocusSidebarPinned,
  setFocusSidebarPinned,
  toggleFocusMode,
} from "./focus-mode";

beforeEach(() => {
  exitFocusMode();
});

test("entering focus mode starts with the sidebar folded", () => {
  enterFocusMode();
  expect(isFocusMode()).toBe(true);
  expect(isFocusSidebarPinned()).toBe(false);
});

test("the sidebar can be pinned open and folded again inside focus mode", () => {
  enterFocusMode();
  setFocusSidebarPinned(true);
  expect(isFocusSidebarPinned()).toBe(true);
  setFocusSidebarPinned(false);
  expect(isFocusSidebarPinned()).toBe(false);
});

test("a pin does not survive leaving the mode", () => {
  enterFocusMode();
  setFocusSidebarPinned(true);
  exitFocusMode();
  expect(isFocusMode()).toBe(false);
  expect(isFocusSidebarPinned()).toBe(false);
});

test("pinning outside focus mode is ignored", () => {
  setFocusSidebarPinned(true);
  expect(isFocusSidebarPinned()).toBe(false);
});

test("toggle enters and leaves, idempotently", () => {
  toggleFocusMode();
  expect(isFocusMode()).toBe(true);
  toggleFocusMode();
  expect(isFocusMode()).toBe(false);
  enterFocusMode();
  enterFocusMode();
  expect(isFocusMode()).toBe(true);
});

test("Ctrl+Shift+F and Cmd+Shift+F toggle focus mode; nothing else does", () => {
  const base = { key: "f", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false };
  expect(isFocusModeToggleKey({ ...base, ctrlKey: true, shiftKey: true })).toBe(true);
  expect(isFocusModeToggleKey({ ...base, metaKey: true, shiftKey: true })).toBe(true);
  expect(isFocusModeToggleKey({ ...base, ctrlKey: true })).toBe(false);
  expect(isFocusModeToggleKey({ ...base, ctrlKey: true, shiftKey: true, altKey: true })).toBe(false);
  expect(isFocusModeToggleKey({ ...base, ctrlKey: true, shiftKey: true, key: "b" })).toBe(false);
});
