import { useEffect, useRef, useState } from "react";
import { CaretDown, Check } from "@phosphor-icons/react";
import type { ProviderPresetInfo } from "~/lib/use-providers";
import { providerLogo } from "~/lib/provider-logo";

/**
 * Provider picker with a logo on every row. A native <select> cannot render
 * images inside its options, so this is a button + listbox like ModelPicker.
 */
export function PresetSelect({
  presets,
  value,
  onChange,
  className,
}: {
  presets: ProviderPresetInfo[];
  value: string;
  onChange: (preset: ProviderPresetInfo) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const chosen = presets.find((p) => p.id === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const logoOf = (p: ProviderPresetInfo) => providerLogo({ apiStyle: p.apiStyle, cliAgent: p.cliAgent, preset: p.id });
  const Logo = ({ p }: { p: ProviderPresetInfo }) => {
    const src = logoOf(p);
    return src ? <img src={src} alt="" aria-hidden="true" className="h-5 w-5 shrink-0 object-contain dark:invert" /> : <span className="h-5 w-5 shrink-0" />;
  };

  return (
    <div ref={ref} className={`relative ${className ?? ""}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 rounded-lg px-3 py-2 bg-kumo-elevated ring ring-kumo-line text-sm text-left focus:outline-none focus:ring-kumo-brand"
      >
        {chosen ? <Logo p={chosen} /> : null}
        <span className="flex-1 min-w-0 truncate">{chosen?.label ?? ""}</span>
        <CaretDown size={14} className="shrink-0 text-kumo-subtle" />
      </button>
      {open ? (
        <ul role="listbox" className="absolute left-0 right-0 top-full mt-1 z-30 max-h-80 overflow-y-auto rounded-xl bg-kumo-base ring ring-kumo-line shadow-lg p-1">
          {presets.map((p) => (
            <li key={p.id} role="option" aria-selected={p.id === value}>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onChange(p);
                }}
                className="w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-left hover:bg-kumo-elevated"
              >
                <Logo p={p} />
                <span className="flex-1 min-w-0 truncate">{p.label}</span>
                {p.id === value ? <Check size={14} className="shrink-0" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
