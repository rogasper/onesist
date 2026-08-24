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
