import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PaneBody } from "~/components/layout/PaneBody";
import { isSplitTab, SPLIT_TAB_LABELS } from "~/lib/split-layout";

export const Route = createFileRoute("/pane/$projectId/$tab")({
  component: PaneWindow,
});

/**
 * One tab of a project in its own window (Fase 5E). The root layout leaves out the sidebar
 * for this route, so the window shows only the tab. A window with unsaved FSD edits asks
 * before it closes.
 */
function PaneWindow() {
  const { projectId, tab } = Route.useParams();
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    document.title = isSplitTab(tab) ? `Onesist — ${SPLIT_TAB_LABELS[tab]}` : "Onesist";
  }, [tab]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  if (!isSplitTab(tab)) {
    return <p className="p-6 text-sm text-kumo-subtle">Tab ini tidak bisa dibuka di window terpisah.</p>;
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto p-3">
      <PaneBody tab={tab} projectId={projectId} paneId="window" onDirtyChange={setDirty} />
    </div>
  );
}
