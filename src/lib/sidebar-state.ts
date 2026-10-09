/**
 * The app sidebar's open state, shared by the root layout and the project's chat (P3.2).
 *
 * Two things are kept apart on purpose:
 *   - the user's choice (open or folded), which is what gets remembered between visits;
 *   - the chat folding the sidebar while it is open on a window narrower than the breakpoint.
 * The sidebar shows the choice unless the chat is folding it. Closing the chat ends the fold and
 * leaves the choice as it was, and any change made by hand ends the fold at once.
 */
import { useSyncExternalStore } from "react";

export const CHAT_SIDEBAR_BREAKPOINT = 1440;

let choice = true;
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

/** What the sidebar shows right now. */
export function getSidebarOpen(): boolean {
  return choice && !chatFolds;
}

/** The user's own choice, without the chat's fold. This is the part worth remembering. */
export function getSidebarChoice(): boolean {
  return choice;
}

/** A change made by hand (or restored from memory): it replaces the choice and ends any chat fold. */
export function setSidebarOpen(next: boolean): void {
  if (choice === next && !chatFolds) return;
  choice = next;
  chatFolds = false;
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
