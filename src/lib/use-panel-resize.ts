import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface PanelResizeOptions {
  min?: number;
  max?: number;
  initial?: number;
  /** Persist the width here and restore it on mount (same idea as the task detail panel). */
  storageKey?: string;
}

export interface PanelResizeHandleProps {
  onPointerDown: (e: ReactPointerEvent) => void;
  onPointerMove: (e: ReactPointerEvent) => void;
  onPointerUp: (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
  style: { touchAction: "none" };
}

/**
 * Drag-to-resize for a panel docked on the RIGHT edge: width is
 * `window.innerWidth - pointerX`, clamped to [min, max].
 *
 * Pointer events with capture rather than `mousedown` + window listeners, and
 * the difference is not stylistic:
 *   - `preventDefault()` on pointerdown is what stops the browser from starting
 *     a text selection. The chat panel used to drag with `mousedown` alone, so
 *     pulling its edge highlighted the transcript and then the main area behind
 *     it (reported 2026-09-27).
 *   - capture routes every move and the release to the handle, so letting go
 *     outside the window cannot leave a drag running.
 * `user-select: none` on the body during the drag covers browsers that ignore
 * the pointerdown default for non-editable content; the previous value is
 * restored exactly, and again on unmount so a panel closed mid-drag cannot
 * leave the whole app unselectable.
 */
export function usePanelResize({ min = 320, max = 900, initial = 460, storageKey }: PanelResizeOptions = {}) {
  const [width, setWidth] = useState(() => {
    if (storageKey && typeof window !== "undefined") {
      const saved = Number(window.localStorage.getItem(storageKey));
      if (Number.isFinite(saved) && saved >= min && saved <= max) return saved;
    }
    return initial;
  });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef(false);
  /** What `body` looked like before the drag, to put it back exactly. */
  const bodyRef = useRef<{ userSelect: string; cursor: string } | null>(null);

  const restoreBody = useCallback(() => {
    const prev = bodyRef.current;
    if (!prev) return;
    document.body.style.userSelect = prev.userSelect;
    document.body.style.cursor = prev.cursor;
    bodyRef.current = null;
  }, []);

  const endDrag = useCallback(
    (e?: ReactPointerEvent) => {
      if (!dragRef.current) return;
      dragRef.current = false;
      setDragging(false);
      restoreBody();
      if (e) {
        try {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          /* capture already gone (e.g. the element was removed) */
        }
      }
    },
    [restoreBody]
  );

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // An unknown pointer id must not abort the drag: the handle still gets
      // move/up events while the pointer is over it.
    }
    bodyRef.current = { userSelect: document.body.style.userSelect, cursor: document.body.style.cursor };
    document.body.style.userSelect = "none";
    // Keeps the resize cursor even when the pointer travels over other elements.
    document.body.style.cursor = "col-resize";
    dragRef.current = true;
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (!dragRef.current) return;
      setWidth(Math.min(max, Math.max(min, window.innerWidth - e.clientX)));
    },
    [min, max]
  );

  // Written when a drag settles, not on every move.
  useEffect(() => {
    if (dragging || !storageKey) return;
    try {
      window.localStorage.setItem(storageKey, String(width));
    } catch {
      /* private mode / quota: remembering the width is not worth an error */
    }
  }, [dragging, storageKey, width]);

  useEffect(() => restoreBody, [restoreBody]);

  return {
    width,
    dragging,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      style: { touchAction: "none" as const },
    },
  };
}
