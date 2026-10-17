import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { PaneBody } from "~/components/layout/PaneBody";
import { isSplitTab, SPLIT_TAB_LABELS } from "~/lib/split-layout";
import { isTauri } from "~/lib/window";

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
  const [askClose, setAskClose] = useState(false);

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

  // In the desktop app a window closes without the browser's beforeunload prompt, so the close
  // request is held here while there are unsaved edits, and the user decides (Fase 5E, M6).
  useEffect(() => {
    if (!dirty || !isTauri()) return;
    let alive = true;
    let unlisten: (() => void) | null = null;
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const off = await getCurrentWindow().onCloseRequested((event) => {
        event.preventDefault();
        setAskClose(true);
      });
      if (alive) unlisten = off;
      else off();
    })();
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [dirty]);

  async function closeWithoutSaving() {
    setAskClose(false);
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().destroy();
  }

  if (!isSplitTab(tab)) {
    return <p className="p-6 text-sm text-kumo-subtle">Tab ini tidak bisa dibuka di window terpisah.</p>;
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto p-3">
      <PaneBody tab={tab} projectId={projectId} paneId="window" onDirtyChange={setDirty} />
      <ConfirmDialog
        open={askClose}
        onOpenChange={setAskClose}
        title="Tutup tanpa menyimpan?"
        confirmLabel="Tutup"
        cancelLabel="Batal"
        onConfirm={() => void closeWithoutSaving()}
      >
        Dokumen ini punya perubahan yang belum disimpan. Kalau window ditutup sekarang, perubahan itu hilang.
      </ConfirmDialog>
    </div>
  );
}
