import { useEffect, useRef, useState, type DragEvent as ReactDragEvent } from "react";

/**
 * OS file drops inside the app's own page.
 *
 * Two sides of one problem, which is why they live together:
 *
 * 1. `useFileDropZone` — a DOM element that accepts files dragged from Finder /
 *    Explorer (the chat composer's attachment target).
 * 2. `useGlobalDropGuard` — the catch-all that stops a file dropped *anywhere
 *    else* from replacing the app.
 *
 * Both only exist because the desktop shell no longer swallows OS drags itself:
 * Tauri's default drag-drop handler consumes the drop and re-emits it as
 * `tauri://drag-drop`, so no DOM `drop` event ever fires (measured 2026-09-18,
 * UJI-MANUAL C5: dragging a file onto the composer did nothing). The Rust side
 * now calls `disable_drag_drop_handler()` so the WebView delivers real HTML5
 * drops — and with the platform default back in play, a drop on a spot with no
 * handler would navigate the window to the dropped `file://` URL. Hence the
 * guard, which is not optional politeness but the other half of that change.
 */

/** Does this drag carry files from outside the page?
 *
 *  `dataTransfer.types` is the only field the platform fills in during
 *  `dragover` (the files themselves arrive on `drop`), so the enter highlight
 *  and the guard have nothing else to look at. Text dragged *within* a textarea
 *  reports other types and must be left alone. */
function carriesFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types ?? []).includes("Files");
}

/**
 * Drop target for files from the OS. Spread `dropProps` onto the element that
 * should accept them — the whole composer box, not just the text field, because
 * a user aiming at the box does not know which pixel is the textarea.
 */
export function useFileDropZone(onFiles: (files: File[]) => void) {
  const [active, setActive] = useState(false);
  // dragenter/dragleave also fire for CHILD elements, so a single boolean
  // flickers off every time the pointer crosses a toolbar button. Count the
  // nesting depth instead.
  const depth = useRef(0);

  const onDragEnter = (e: ReactDragEvent) => {
    if (!carriesFiles(e.dataTransfer)) return;
    e.preventDefault();
    depth.current += 1;
    setActive(true);
  };

  const onDragOver = (e: ReactDragEvent) => {
    if (!carriesFiles(e.dataTransfer)) return;
    // Without preventDefault on dragover the drop is not delivered at all.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    // Setting the same value again is a no-op for React, so the frequent
    // dragover events do not each cost a render.
    setActive(true);
  };

  const onDragLeave = (e: ReactDragEvent) => {
    if (!carriesFiles(e.dataTransfer)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setActive(false);
  };

  const onDrop = (e: ReactDragEvent) => {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (!files.length) return;
    e.preventDefault();
    depth.current = 0;
    setActive(false);
    onFiles(files);
  };

  return { active, dropProps: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}

/** Keeps a file dropped outside every drop zone from navigating the WebView to
 *  its `file://` URL (the platform default for a dropped file). Mounted once at
 *  the root. */
export function useGlobalDropGuard() {
  useEffect(() => {
    const swallowFileDrag = (e: DragEvent) => {
      if (carriesFiles(e.dataTransfer)) e.preventDefault();
    };
    window.addEventListener("dragover", swallowFileDrag);
    window.addEventListener("drop", swallowFileDrag);
    return () => {
      window.removeEventListener("dragover", swallowFileDrag);
      window.removeEventListener("drop", swallowFileDrag);
    };
  }, []);
}
