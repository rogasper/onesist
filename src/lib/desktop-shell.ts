/**
 * The desktop app's channel to the OS: open a file with its default app, or reveal it in the
 * file manager. A web build has no such channel, so both calls do nothing there.
 */

export const inDesktopShell = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function openWithOs(absolutePath: string, mode: "open" | "reveal"): Promise<void> {
  if (!inDesktopShell()) return;
  try {
    const mod = await import("@tauri-apps/plugin-opener");
    if (mode === "open") await mod.openPath(absolutePath);
    else await mod.revealItemInDir(absolutePath);
  } catch {
    /* the OS refused (no handler for the type, or permission): the file stays reachable in the app */
  }
}
