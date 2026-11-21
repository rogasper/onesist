/**
 * The app sidebar's open and auto-hide state, shared by the root layout, settings, and chat (P3.2).
 *
 * Three things are kept apart on purpose:
 *   - `choice` (open or collapsed), the user's explicit open/closed choice remembered between visits;
 *   - `autoHide` (unpinned vs pinned), remembered between visits — when true, the sidebar folds
 *     away and reveals as an overlay when the pointer enters the left edge;
 *   - `chatFolds`, a transient fold while the chat panel is open on a narrow window.
 *
 * Closing the chat restores whatever the user had (`choice` and `autoHide` untouched). Any explicit
 * open (`setSidebarOpen(true)`) pins/opens the sidebar and ends both `autoHide` and `chatFolds`.
 */
import { useSyncExternalStore } from "react";

export const CHAT_SIDEBAR_BREAKPOINT = 1440;
/** Width in CSS pixels from the left viewport edge that activates hover-reveal. */
export const EDGE_TRIGGER_PX = 12;
/** Short dwell before opening peek so a fast cursor crossing to a second monitor does not flash it. */
export const PEEK_ENTER_DELAY_MS = 50;
/** Grace period after the cursor leaves the peeking sidebar before hiding it again. */
export const PEEK_LEAVE_DELAY_MS = 220;
/** Extra pixels past the sidebar's right edge that still count as "inside" to prevent edge flicker. */
export const PEEK_LEAVE_BUFFER_PX = 16;

let choice = true;
let autoHide = false;
let chatFolds = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether the sidebar is docked open in normal mode (outside focus mode). */
export function getSidebarOpen(): boolean {
  return choice && !autoHide && !chatFolds;
}

/** The user's own open/closed choice, without the chat's fold. Persisted to localStorage. */
export function getSidebarChoice(): boolean {
  return choice;
}

/** Whether normal-mode auto-hide (unpinned) is enabled. Persisted to localStorage. */
export function getSidebarAutoHide(): boolean {
  return autoHide;
}

/** Restores persisted sidebar choices together on client mount without clobbering either flag. */
export function hydrateSidebarState(saved: { open?: boolean | null; autoHide?: boolean | null }): void {
  const nextChoice = saved.open === null || saved.open === undefined ? choice : saved.open;
  const nextAutoHide = saved.autoHide === null || saved.autoHide === undefined ? autoHide : saved.autoHide;
  if (nextChoice === choice && nextAutoHide === autoHide) return;
  choice = nextChoice;
  autoHide = nextAutoHide;
  emit();
}

/**
 * Explicit open/close by the user (Ctrl/Cmd+B, title bar toggle, collapse button).
 * Opening docks the sidebar open (clearing auto-hide and any chat fold); closing collapses it.
 */
export function setSidebarOpen(next: boolean): void {
  const nextAutoHide = next ? false : autoHide;
  if (choice === next && autoHide === nextAutoHide && !chatFolds) return;
  choice = next;
  autoHide = nextAutoHide;
  chatFolds = false;
  emit();
}

/**
 * Enables or disables auto-hide (unpinned vs pinned) in normal mode.
 * Disabling auto-hide (pinning) docks the sidebar open immediately.
 */
export function setSidebarAutoHide(next: boolean): void {
  const nextChoice = next ? choice : true;
  const nextChatFolds = next ? chatFolds : false;
  if (autoHide === next && choice === nextChoice && chatFolds === nextChatFolds) return;
  autoHide = next;
  choice = nextChoice;
  chatFolds = nextChatFolds;
  emit();
}

/** Folds the sidebar for the chat, on a window narrower than the breakpoint. */
export function foldSidebarForChat(viewportWidth: number): void {
  if (viewportWidth >= CHAT_SIDEBAR_BREAKPOINT || chatFolds) return;
  chatFolds = true;
  emit();
}

/** The chat closed: the sidebar shows the user's choice again. */
export function restoreSidebarAfterChat(): void {
  if (!chatFolds) return;
  chatFolds = false;
  emit();
}

export function useSidebarOpen(): boolean {
  return useSyncExternalStore(subscribe, getSidebarOpen, () => true);
}

export function useSidebarChoice(): boolean {
  return useSyncExternalStore(subscribe, getSidebarChoice, () => true);
}

export function useSidebarAutoHide(): boolean {
  return useSyncExternalStore(subscribe, getSidebarAutoHide, () => false);
}

export interface SidebarPeekEnableInput {
  dockedOpen: boolean;
  autoHide: boolean;
  focusActive: boolean;
  focusPinned: boolean;
  finePointer: boolean;
  isMobile: boolean;
}

/** Left-edge hover reveal is active on desktop fine pointers whenever auto-hide or unpinned focus mode is active. */
export function shouldEnableSidebarPeek(input: SidebarPeekEnableInput): boolean {
  if (input.dockedOpen || input.isMobile || !input.finePointer) return false;
  if (input.focusActive) return !input.focusPinned;
  return input.autoHide;
}

export interface SidebarPeekTriggerInput {
  buttons: number;
  isResizing: boolean;
  hasBlockingOverlay: boolean;
}

/** Guards against opening the overlay peek during drags, sidebar resizes, or open dialogs/menus. */
export function shouldStartSidebarPeek(input: SidebarPeekTriggerInput): boolean {
  if (input.buttons !== 0) return false;
  if (input.isResizing) return false;
  if (input.hasBlockingOverlay) return false;
  return true;
}

/** True when the pointer is within the left-edge hot zone below the titlebar/banner offset. */
export function isPointerInEdgeZone(input: {
  clientX: number;
  clientY: number;
  topOffset: number;
  edgePx?: number;
}): boolean {
  const edgePx = input.edgePx ?? EDGE_TRIGGER_PX;
  return input.clientX >= 0 && input.clientX <= edgePx && input.clientY >= input.topOffset;
}

/** True while the pointer remains within the peeking sidebar (plus hysteresis buffer) below the top offset. */
export function isPointerInPeekBounds(input: {
  clientX: number;
  clientY: number;
  sidebarWidth: number;
  topOffset: number;
  bufferPx?: number;
}): boolean {
  const bufferPx = input.bufferPx ?? PEEK_LEAVE_BUFFER_PX;
  return (
    input.clientX >= 0 &&
    input.clientX <= input.sidebarWidth + bufferPx &&
    input.clientY >= input.topOffset
  );
}

/** True when a dialog, quick open modal, context menu, or select listbox is open on screen. */
export function hasBlockingOverlay(): boolean {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], dialog[open]'),
  );
}

export interface SidebarKeyInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /** The key was pressed in a text field or editor, where Cmd/Ctrl+B means bold. */
  targetEditable: boolean;
}

/** Ctrl+B or Cmd+B shows or hides the sidebar, unless the key went to a text editor. */
export function isSidebarToggleKey(input: SidebarKeyInput): boolean {
  if (input.targetEditable) return false;
  if (input.altKey || input.shiftKey) return false;
  if (!(input.metaKey || input.ctrlKey)) return false;
  return input.key.toLowerCase() === "b";
}
