/**
 * Focus (reading) mode for a project workspace: the chrome around a document steps aside so the
 * document itself fills the window.
 *
 * Deliberately a transient view state, not a preference: nothing here is written to
 * localStorage, so the app never reopens with its navigation missing. The mode belongs to the
 * project route that armed it and is dropped when that route unmounts.
 *
 * The app sidebar keeps its own remembered choice (`sidebar-state.ts`) untouched. While focus
 * mode is on, the sidebar is governed by `pinned` instead: folded by default so the document
 * gets the width, and open when the user pins it. Leaving focus mode shows the original choice
 * again — the same separation the chat fold uses, one level up.
 */
import { useSyncExternalStore } from "react";

let active = false;
let pinned = false;
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

export function isFocusMode(): boolean {
  return active;
}

/** Enters focus mode. The sidebar folds first — a pinned sidebar is a choice made inside the mode. */
export function enterFocusMode(): void {
  if (active) return;
  active = true;
  pinned = false;
  emit();
}

export function exitFocusMode(): void {
  if (!active) return;
  active = false;
  pinned = false;
  emit();
}

export function toggleFocusMode(): void {
  if (active) exitFocusMode();
  else enterFocusMode();
}

export function isFocusSidebarPinned(): boolean {
  return pinned;
}

/** Pins the sidebar open (or lets it fold again) while focus mode is on. Ignored outside it. */
export function setFocusSidebarPinned(next: boolean): void {
  if (!active || pinned === next) return;
  pinned = next;
  emit();
}

export function useFocusMode(): boolean {
  return useSyncExternalStore(subscribe, isFocusMode, () => false);
}

export function useFocusSidebarPinned(): boolean {
  return useSyncExternalStore(subscribe, isFocusSidebarPinned, () => false);
}

export interface FocusKeyInput {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/** Ctrl+Shift+F or Cmd+Shift+F toggles focus mode. Not Ctrl+B (sidebar) or Ctrl+P (quick open). */
export function isFocusModeToggleKey(input: FocusKeyInput): boolean {
  if (input.altKey) return false;
  if (!(input.metaKey || input.ctrlKey)) return false;
  if (!input.shiftKey) return false;
  return input.key.toLowerCase() === "f";
}
