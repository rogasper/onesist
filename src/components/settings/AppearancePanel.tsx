/**
 * Global Settings → Tampilan & Terminal. App theme, per-device terminal
 * preferences and the desktop-only update check.
 *
 * No parallel state: the theme is written straight through `applyTheme` (the
 * hook's MutationObserver reflects it), and terminal prefs write through
 * `saveTerminalPrefs`, which dispatches TERMINAL_PREFS_EVENT so an open
 * AgentTerminal re-renders live.
 */
import { useState } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { applyTheme, useAppTheme } from "~/lib/theme";
import { loadTerminalPrefs, saveTerminalPrefs, type TerminalPrefs } from "~/lib/terminal-prefs";
import { setSidebarAutoHide, useSidebarAutoHide } from "~/lib/sidebar-state";
import { isDesktopShell } from "~/lib/run-notification";
import { requestUpdateCheck } from "~/components/UpdateBanner";
import { AppButton } from "~/components/ui/AppButton";

const FONT_SIZES = [11, 12, 13, 14, 15, 16, 18, 20];
const CURSORS = [
  { value: "bar", label: "Bar" },
  { value: "block", label: "Block" },
  { value: "underline", label: "Underline" },
] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <label className="text-xs text-kumo-subtle w-20 shrink-0 pt-1.5">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function AppearancePanel() {
  const theme = useAppTheme();
  const sidebarAutoHide = useSidebarAutoHide();
  const [prefs, setPrefs] = useState<TerminalPrefs>(loadTerminalPrefs);

  const update = (patch: Partial<TerminalPrefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveTerminalPrefs(next);
  };

  return (
    <div className="space-y-3">
      <Field label="Tema">
        <div className="flex gap-2">
          {(["light", "dark"] as const).map((t) => (
            <AppButton
              key={t}
              variant="chip"
              size="sm"
              active={theme === t}
              onClick={() => void applyTheme(t)}
              className="px-3 capitalize"
            >
              {t}
            </AppButton>
          ))}
        </div>
      </Field>

      <Field label="Sidebar">
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <AppButton
              variant="chip"
              size="sm"
              active={!sidebarAutoHide}
              onClick={() => setSidebarAutoHide(false)}
              className="px-3"
            >
              Pin (tetap tampil)
            </AppButton>
            <AppButton
              variant="chip"
              size="sm"
              active={sidebarAutoHide}
              onClick={() => setSidebarAutoHide(true)}
              className="px-3"
            >
              Auto-hide
            </AppButton>
          </div>
          <p className="text-[11px] text-kumo-subtle">
            Saat auto-hide aktif, sidebar sembunyi otomatis dan muncul sebagai overlay ketika kursor menyentuh tepi kiri.
          </p>
        </div>
      </Field>

      <Field label="Font Size">
        <select
          value={String(prefs.fontSize)}
          onChange={(e) => update({ fontSize: Number(e.target.value) })}
          className="h-7 text-xs font-medium rounded-full border border-kumo-line/80 bg-kumo-elevated text-kumo-default px-3 outline-none focus:border-kumo-brand/80"
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>
      </Field>

      <Field label="Theme Terminal">
        <div className="flex gap-2">
          {(["dark", "light"] as const).map((t) => (
            <AppButton
              key={t}
              variant="chip"
              size="sm"
              active={prefs.theme === t}
              onClick={() => update({ theme: t })}
              className="px-3 capitalize"
            >
              {t}
            </AppButton>
          ))}
        </div>
      </Field>

      <Field label="Cursor">
        <div className="flex gap-2">
          {CURSORS.map((c) => (
            <AppButton
              key={c.value}
              variant="chip"
              size="sm"
              active={prefs.cursor === c.value}
              onClick={() => update({ cursor: c.value })}
              className="px-3"
            >
              {c.label}
            </AppButton>
          ))}
        </div>
      </Field>

      {isDesktopShell() && (
        <Field label="Pembaruan">
          <AppButton
            variant="secondary"
            size="sm"
            onClick={() => requestUpdateCheck()}
            icon={<ArrowsClockwise size={13} />}
            className="rounded px-3"
          >
            Periksa pembaruan
          </AppButton>
        </Field>
      )}
    </div>
  );
}
