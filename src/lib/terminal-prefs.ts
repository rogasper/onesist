export interface TerminalPrefs {
  fontSize: number;
  theme: "dark" | "light";
  cursor: "bar" | "block" | "underline";
}

export const TERMINAL_PREFS_KEY = "terminalPrefs";
export const TERMINAL_PREFS_EVENT = "terminal-prefs-updated";

export const TERMINAL_THEMES = {
  dark: {
    background: "#0d0d0d",
    foreground: "#e0e0e0",
    cursor: "#4ade80",
    cursorAccent: "#0d0d0d",
    selectionBackground: "#4ade8040",
    black: "#1a1a1a",
    red: "#f87171",
    green: "#4ade80",
    yellow: "#fbbf24",
    blue: "#60a5fa",
    magenta: "#c084fc",
    cyan: "#67e8f9",
    white: "#e0e0e0",
    brightBlack: "#404040",
    brightRed: "#fca5a5",
    brightGreen: "#86efac",
    brightYellow: "#fde68a",
    brightBlue: "#93c5fd",
    brightMagenta: "#d8b4fe",
    brightCyan: "#a5f3fc",
    brightWhite: "#ffffff",
  },
  light: {
    background: "#f9fafb",
    foreground: "#111827",
    cursor: "#16a34a",
    cursorAccent: "#f9fafb",
    selectionBackground: "#16a34a30",
    black: "#000000",
    red: "#dc2626",
    green: "#16a34a",
    yellow: "#ca8a04",
    blue: "#2563eb",
    magenta: "#9333ea",
    cyan: "#0891b2",
    white: "#f3f4f6",
    brightBlack: "#4b5563",
    brightRed: "#ef4444",
    brightGreen: "#22c55e",
    brightYellow: "#eab308",
    brightBlue: "#3b82f6",
    brightMagenta: "#a855f7",
    brightCyan: "#06b6d4",
    brightWhite: "#ffffff",
  },
};

export function loadTerminalPrefs(): TerminalPrefs {
  if (typeof window === "undefined") {
    return { fontSize: 13, theme: "dark", cursor: "bar" };
  }
  try {
    const raw = localStorage.getItem(TERMINAL_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        fontSize: typeof parsed.fontSize === "number" ? parsed.fontSize : 13,
        theme: parsed.theme === "light" ? "light" : "dark",
        cursor: ["bar", "block", "underline"].includes(parsed.cursor) ? parsed.cursor : "bar",
      };
    }
  } catch {}
  return { fontSize: 13, theme: "dark", cursor: "bar" };
}

export function saveTerminalPrefs(prefs: TerminalPrefs) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TERMINAL_PREFS_KEY, JSON.stringify(prefs));
    window.dispatchEvent(new CustomEvent(TERMINAL_PREFS_EVENT, { detail: prefs }));
  } catch {}
}

export function getTerminalTheme(theme: "dark" | "light") {
  return TERMINAL_THEMES[theme] ?? TERMINAL_THEMES.dark;
}
