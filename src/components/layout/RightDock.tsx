import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The id of the dock element that `__root.tsx` renders beside `<main>`. */
export const RIGHT_DOCK_ID = "app-right-dock";

/**
 * Renders its children into the app's right dock, the strip beside the page that runs the full
 * window height (chat and terminal). The React tree stays where the caller is, so state and
 * streams belong to that route; only the DOM goes to the dock. Renders nothing during SSR and
 * before the first effect, when the dock element can be found.
 */
export function RightDock({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById(RIGHT_DOCK_ID));
  }, []);
  return target ? createPortal(children, target) : null;
}
