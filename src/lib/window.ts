import type { SplitTab } from "~/lib/split-layout";

export async function openProjectWindow(path: string = "/"): Promise<void> {
  const target = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_project_window", { path: target });
      return;
    } catch (e) {
      console.warn("[window] open_project_window failed, fallback to window.open", e);
    }
  }
  window.open(target, "_blank", "noopener");
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** The bare route a pane window shows (Fase 5E): only the tab, no sidebar or tab bar. */
export function paneWindowPath(projectId: string, tab: SplitTab): string {
  return `/pane/${encodeURIComponent(projectId)}/${tab}`;
}

/**
 * Opens one tab of a project in its own window: a desktop window in the app, a browser tab
 * on the web. The desktop side validates the project id and tab and builds the URL from the
 * main window's origin; nothing else from here reaches it. A refusal on the desktop (for
 * example the window limit) is thrown to the caller, never replaced by a browser tab.
 */
export async function openPaneWindow(projectId: string, tab: SplitTab): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("open_pane_window", { projectId, tab });
    return;
  }
  window.open(paneWindowPath(projectId, tab), "_blank", "noopener");
}
