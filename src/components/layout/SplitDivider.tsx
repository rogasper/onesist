import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { ratioFromPointer } from "~/lib/split-layout";

export interface SplitDividerProps {
  /** "x" = vertical bar dragged left/right; "y" = horizontal bar dragged up/down. */
  axis: "x" | "y";
  /** The element whose width (x) or height (y) the ratio is measured against. */
  containerRef: RefObject<HTMLElement | null>;
  onRatio: (ratio: number) => void;
}

/**
 * Drag handle between two split panes. Same pointer-capture approach as
 * `usePanelResize`: no text selection while dragging, and releasing outside the
 * window still ends the drag.
 */
export function SplitDivider({ axis, containerRef, onRatio }: SplitDividerProps) {
  const dragging = useRef(false);
  const previousUserSelect = useRef<string | null>(null);

  const restoreSelection = () => {
    if (previousUserSelect.current !== null) {
      document.body.style.userSelect = previousUserSelect.current;
      previousUserSelect.current = null;
    }
  };
  useEffect(() => restoreSelection, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    previousUserSelect.current = document.body.style.userSelect;
    document.body.style.userSelect = "none";
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    if (!dragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    onRatio(axis === "x"
      ? ratioFromPointer(e.clientX, rect.left, rect.width)
      : ratioFromPointer(e.clientY, rect.top, rect.height));
  };
  const end = (e: ReactPointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    restoreSelection();
  };

  return (
    <div
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      style={{ touchAction: "none" }}
      className={`shrink-0 bg-kumo-line hover:bg-kumo-brand transition-colors ${
        axis === "x" ? "w-1 cursor-col-resize" : "h-1 cursor-row-resize"
      }`}
    />
  );
}
