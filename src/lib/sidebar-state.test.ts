/**
 * Regression: the chat folds the sidebar only on a narrow window and gives it back when it
 * closes; auto-hide folds the sidebar and enables left-edge peek; explicit open pins it again;
 * and the user's own choices are what get remembered.
 *
 *   bun test src/lib/sidebar-state.test.ts
 */
import { beforeEach, expect, test } from "bun:test";
import {
  EDGE_TRIGGER_PX,
  PEEK_LEAVE_BUFFER_PX,
  foldSidebarForChat,
  getSidebarAutoHide,
  getSidebarChoice,
  getSidebarOpen,
  hydrateSidebarState,
  isPointerInEdgeZone,
  isPointerInPeekBounds,
  isSidebarToggleKey,
  restoreSidebarAfterChat,
  setSidebarAutoHide,
  setSidebarOpen,
  shouldEnableSidebarPeek,
  shouldStartSidebarPeek,
} from "./sidebar-state";

beforeEach(() => {
  setSidebarOpen(true);
});

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

test("enabling auto-hide folds the sidebar without overwriting the open choice; pinning opens it again", () => {
  setSidebarOpen(true);
  setSidebarAutoHide(true);
  expect(getSidebarAutoHide()).toBe(true);
  expect(getSidebarOpen()).toBe(false);
  expect(getSidebarChoice()).toBe(true);

  setSidebarAutoHide(false);
  expect(getSidebarAutoHide()).toBe(false);
  expect(getSidebarOpen()).toBe(true);
  expect(getSidebarChoice()).toBe(true);
});

test("pinning from a collapsed auto-hide state docks the sidebar open", () => {
  setSidebarOpen(false);
  setSidebarAutoHide(true);
  expect(getSidebarOpen()).toBe(false);

  setSidebarAutoHide(false);
  expect(getSidebarAutoHide()).toBe(false);
  expect(getSidebarOpen()).toBe(true);
  expect(getSidebarChoice()).toBe(true);
});

test("explicitly opening the sidebar clears auto-hide so it stays docked", () => {
  setSidebarAutoHide(true);
  expect(getSidebarOpen()).toBe(false);
  setSidebarOpen(true);
  expect(getSidebarAutoHide()).toBe(false);
  expect(getSidebarOpen()).toBe(true);
});

test("hydrateSidebarState restores open and auto-hide together without clobbering auto-hide", () => {
  hydrateSidebarState({ open: true, autoHide: true });
  expect(getSidebarChoice()).toBe(true);
  expect(getSidebarAutoHide()).toBe(true);
  expect(getSidebarOpen()).toBe(false);

  hydrateSidebarState({ open: true, autoHide: false });
  expect(getSidebarChoice()).toBe(true);
  expect(getSidebarAutoHide()).toBe(false);
  expect(getSidebarOpen()).toBe(true);
});

test("shouldEnableSidebarPeek turns on for auto-hide and unpinned focus mode on desktop fine pointers", () => {
  const base = {
    dockedOpen: false,
    autoHide: false,
    focusActive: false,
    focusPinned: false,
    finePointer: true,
    isMobile: false,
  };
  // Normal mode, manually collapsed without auto-hide: no peek.
  expect(shouldEnableSidebarPeek(base)).toBe(false);
  // Normal mode with auto-hide: peek enabled.
  expect(shouldEnableSidebarPeek({ ...base, autoHide: true })).toBe(true);
  // Docked open: never peek.
  expect(shouldEnableSidebarPeek({ ...base, autoHide: true, dockedOpen: true })).toBe(false);
  // Focus mode, unpinned (even if normal autoHide is false): peek enabled.
  expect(shouldEnableSidebarPeek({ ...base, focusActive: true, focusPinned: false })).toBe(true);
  // Focus mode, pinned: no peek.
  expect(shouldEnableSidebarPeek({ ...base, focusActive: true, focusPinned: true, dockedOpen: true })).toBe(false);
  // Touch / coarse pointer or mobile layout: never peek.
  expect(shouldEnableSidebarPeek({ ...base, autoHide: true, finePointer: false })).toBe(false);
  expect(shouldEnableSidebarPeek({ ...base, focusActive: true, isMobile: true })).toBe(false);
});

test("shouldStartSidebarPeek blocks drags, resizes, and blocking overlays", () => {
  expect(shouldStartSidebarPeek({ buttons: 0, isResizing: false, hasBlockingOverlay: false })).toBe(true);
  expect(shouldStartSidebarPeek({ buttons: 1, isResizing: false, hasBlockingOverlay: false })).toBe(false);
  expect(shouldStartSidebarPeek({ buttons: 0, isResizing: true, hasBlockingOverlay: false })).toBe(false);
  expect(shouldStartSidebarPeek({ buttons: 0, isResizing: false, hasBlockingOverlay: true })).toBe(false);
});

test("edge zone and peek bounds respect the top offset and hysteresis buffer", () => {
  expect(isPointerInEdgeZone({ clientX: 0, clientY: 40, topOffset: 32 })).toBe(true);
  expect(isPointerInEdgeZone({ clientX: EDGE_TRIGGER_PX, clientY: 32, topOffset: 32 })).toBe(true);
  expect(isPointerInEdgeZone({ clientX: EDGE_TRIGGER_PX + 1, clientY: 40, topOffset: 32 })).toBe(false);
  expect(isPointerInEdgeZone({ clientX: 4, clientY: 20, topOffset: 32 })).toBe(false);
  expect(isPointerInEdgeZone({ clientX: -1, clientY: 40, topOffset: 32 })).toBe(false);

  expect(isPointerInPeekBounds({ clientX: 220, clientY: 100, sidebarWidth: 220, topOffset: 32 })).toBe(true);
  expect(isPointerInPeekBounds({ clientX: 220 + PEEK_LEAVE_BUFFER_PX, clientY: 100, sidebarWidth: 220, topOffset: 32 })).toBe(true);
  expect(isPointerInPeekBounds({ clientX: 220 + PEEK_LEAVE_BUFFER_PX + 1, clientY: 100, sidebarWidth: 220, topOffset: 32 })).toBe(false);
  expect(isPointerInPeekBounds({ clientX: 100, clientY: 10, sidebarWidth: 220, topOffset: 32 })).toBe(false);
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
