/**
 * Regression: the chat folds the sidebar only on a narrow window and gives it back when it
 * closes; the user's own choice is what is remembered, so a chat fold is never saved as one.
 *
 *   bun test src/lib/sidebar-state.test.ts
 */
import { expect, test } from "bun:test";
import { foldSidebarForChat, getSidebarChoice, getSidebarOpen, isSidebarToggleKey, restoreSidebarAfterChat, setSidebarOpen } from "./sidebar-state";

test("the chat folds the sidebar on a narrow window and restores it when it closes", () => {
  setSidebarOpen(true);
  foldSidebarForChat(1280);
  expect(getSidebarOpen()).toBe(false);
  restoreSidebarAfterChat();
  expect(getSidebarOpen()).toBe(true);
});

test("a chat fold is not the user's choice, so it is not remembered", () => {
  setSidebarOpen(true);
  foldSidebarForChat(1280);
  expect(getSidebarChoice()).toBe(true);
});

test("a wide window keeps the sidebar open", () => {
  setSidebarOpen(true);
  foldSidebarForChat(1920);
  expect(getSidebarOpen()).toBe(true);
});

test("a sidebar the user folded stays folded when the chat closes", () => {
  setSidebarOpen(false);
  foldSidebarForChat(1280);
  restoreSidebarAfterChat();
  expect(getSidebarOpen()).toBe(false);
});

test("a change by hand while the chat folds the sidebar ends the fold", () => {
  setSidebarOpen(true);
  foldSidebarForChat(1280);
  setSidebarOpen(true);
  expect(getSidebarOpen()).toBe(true);
});

test("Ctrl+B and Cmd+B toggle the sidebar, and only those keys without Alt or Shift", () => {
  const base = { key: "b", metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, targetEditable: false };
  expect(isSidebarToggleKey({ ...base, ctrlKey: true })).toBe(true);
  expect(isSidebarToggleKey({ ...base, metaKey: true })).toBe(true);
  expect(isSidebarToggleKey({ ...base })).toBe(false);
  expect(isSidebarToggleKey({ ...base, ctrlKey: true, altKey: true })).toBe(false);
  expect(isSidebarToggleKey({ ...base, ctrlKey: true, shiftKey: true })).toBe(false);
  expect(isSidebarToggleKey({ ...base, ctrlKey: true, key: "p" })).toBe(false);
});

test("the shortcut stays out of editors, where Cmd+B is bold", () => {
  const base = { key: "b", metaKey: true, ctrlKey: false, altKey: false, shiftKey: false };
  expect(isSidebarToggleKey({ ...base, targetEditable: true })).toBe(false);
  expect(isSidebarToggleKey({ ...base, targetEditable: false })).toBe(true);
});
