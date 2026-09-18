// Theme management shared across the app.
//
// - Persists the choice in localStorage (works in browser AND WebView)
// - Sets `data-mode` on <html> — kumo tokens switch dark/light via this
//   attribute (`data-mode="dark"` = dark; absent = light)
// - In the Tauri desktop shell, also syncs the native window background color
//   via @tauri-apps/api/window (permission: core:window:allow-set-background-color)

export type AppTheme = "dark" | "light";

const THEME_KEY = "onesist:theme";

/** Window background per theme (RGBA 0-255) — light matches landing #fcfcfa. */
const WINDOW_BG: Record<AppTheme, [number, number, number, number]> = {
  dark: [13, 13, 13, 255], // #0d0d0d
  light: [252, 252, 250, 255], // #fcfcfa — landing parity
};

export function getStoredTheme(): AppTheme {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {}
  return "light";
}

/** Apply theme: DOM attribute + Tauri window background (desktop only). */
export async function applyTheme(theme: AppTheme): Promise<void> {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {}
  const root = document.documentElement;
  if (theme === "dark") root.dataset.mode = "dark";
  else delete root.dataset.mode;

  // Desktop shell: sync the native window background so overscroll/edges
  // match the page background. Browser: no-op.
  const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (isTauri) {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      // Color type: [r,g,b] | [r,g,b,a] | object — tuple works directly.
      await getCurrentWindow().setBackgroundColor(WINDOW_BG[theme]);
    } catch {
      // ignore — permission missing or non-Tauri context
    }
  }
}

/** Toggle between dark/light and persist. Returns the new theme. */
export async function toggleTheme(): Promise<AppTheme> {
  const next: AppTheme = getStoredTheme() === "dark" ? "light" : "dark";
  await applyTheme(next);
  return next;
}
