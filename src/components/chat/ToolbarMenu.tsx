import { useEffect, useRef, useState, type ReactNode } from "react";
import { CaretDown, Check, type Icon } from "@phosphor-icons/react";

/**
 * One popover shell for the composer's toolbar: Mode, Aksi, and Izin share it, so the
 * outside-click, Escape, and placement rules live in one place.
 *
 * The popover opens upward and is anchored to the trigger's right edge by default, because
 * the chat panel is docked on the right of the window: a popover anchored left would lose its
 * right edge at the viewport.
 */

const TRIGGER = "flex items-center gap-1.5 rounded-lg px-2 h-8 shrink-0 hover:bg-kumo-tint text-sm text-kumo-default";

export function ToolbarMenu({
  icon: IconComponent,
  label,
  labelClassName,
  title,
  align = "right",
  width = "w-[260px]",
  triggerClassName = "",
  children,
}: {
  icon: Icon;
  /** Trigger text. Omitted means icon only, and the title is then the only name. */
  label?: string;
  /** Visibility of the label and the caret, e.g. `hidden @md/composer:inline`. */
  labelClassName?: string;
  title: string;
  align?: "left" | "right";
  width?: string;
  triggerClassName?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button onClick={() => setOpen((v) => !v)} title={title} aria-label={title} aria-expanded={open} className={`${TRIGGER} ${triggerClassName}`}>
        <IconComponent size={13} className="text-kumo-subtle shrink-0" />
        {label ? <span className={labelClassName ?? "whitespace-nowrap"}>{label}</span> : null}
        <CaretDown size={10} weight="bold" className={`${labelClassName ?? ""} text-kumo-subtle shrink-0`} />
      </button>
      {open ? (
        <div
          className={`absolute bottom-full ${align === "right" ? "right-0" : "left-0"} mb-2 z-30 ${width} max-h-[70vh] overflow-y-auto rounded-xl bg-kumo-base ring ring-kumo-line shadow-lg p-1.5`}
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

/** One choice inside a ToolbarMenu: a check mark when selected, then the label and its hint. */
export function MenuOption({
  icon: IconComponent,
  label,
  hint,
  selected,
  onPick,
}: {
  icon?: Icon;
  label: string;
  hint?: string;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      onClick={onPick}
      className={`w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left ${selected ? "bg-kumo-elevated" : "hover:bg-kumo-elevated"}`}
    >
      <span className="w-4 shrink-0 text-kumo-brand">{selected ? <Check size={13} weight="bold" /> : null}</span>
      {IconComponent ? <IconComponent size={13} className="mt-0.5 shrink-0 text-kumo-subtle" /> : null}
      <span className="grid gap-0.5 min-w-0">
        <span className="text-sm text-kumo-default">{label}</span>
        {hint ? <span className="text-sm text-kumo-subtle">{hint}</span> : null}
      </span>
    </button>
  );
}
