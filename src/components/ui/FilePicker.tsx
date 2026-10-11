import { useEffect, useMemo, useRef, useState } from "react";
import { CaretDown, Check, MagnifyingGlass } from "@phosphor-icons/react";

/**
 * A file chooser with search: a pill that shows the current file, and a popover with a search
 * box and the matching files. Used where a project has many files and a native `<select>` gives
 * no way to find one (ERD, API Spec).
 */

export interface FilePickerItem {
  value: string;
  label: string;
  /** Shown dimmed next to the label, e.g. the folder, so files with the same name are told apart. */
  hint?: string;
}

interface FilePickerProps {
  items: FilePickerItem[];
  value: string | null;
  onChange: (value: string) => void;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}

export function FilePicker({ items, value, onChange, placeholder = "Pilih berkas", searchPlaceholder = "Cari berkas…", className = "" }: FilePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = items.find((i) => i.value === value) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => i.label.toLowerCase().includes(q) || (i.hint ?? "").toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Keep the highlighted row in view while the arrow keys move it.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${highlight}"]`)?.scrollIntoView({ block: "nearest" });
  }, [highlight, open]);

  function openPicker() {
    setQuery("");
    setHighlight(Math.max(0, items.findIndex((i) => i.value === value)));
    setOpen(true);
  }

  function pick(item: FilePickerItem) {
    onChange(item.value);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(matches.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = matches[highlight];
      if (item) pick(item);
    }
  }

  return (
    <div ref={ref} className={`relative inline-flex shrink-0 min-w-0 ${className}`}>
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 max-w-[260px] h-7 pl-3 pr-2 rounded-full border border-kumo-line/80 bg-kumo-elevated text-xs font-medium text-kumo-default hover:border-kumo-brand/50 transition-colors"
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <CaretDown size={11} weight="bold" className="shrink-0 text-kumo-subtle" />
      </button>

      {open ? (
        <div className="absolute top-full left-0 mt-1 z-40 w-[min(28rem,90vw)] rounded-xl bg-kumo-base ring ring-kumo-line shadow-lg p-2">
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 ring ring-kumo-line mb-1.5">
            <MagnifyingGlass size={13} className="text-kumo-subtle shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlight(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="flex-1 min-w-0 bg-transparent text-sm text-kumo-default focus:outline-none"
            />
          </div>

          <div ref={listRef} role="listbox" className="max-h-80 overflow-y-auto grid gap-0.5">
            {matches.length === 0 ? <p className="px-2.5 py-3 text-sm text-kumo-subtle">Tidak ada berkas yang cocok</p> : null}
            {matches.map((item, index) => (
              <button
                key={item.value}
                type="button"
                role="option"
                aria-selected={item.value === value}
                data-index={index}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => pick(item)}
                className={`w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left ${
                  index === highlight ? "bg-kumo-elevated" : "hover:bg-kumo-elevated"
                }`}
              >
                <span className="w-4 shrink-0 text-kumo-brand">{item.value === value ? <Check size={13} weight="bold" /> : null}</span>
                <span className="min-w-0 flex-1 grid">
                  <span className="text-sm text-kumo-default truncate">{item.label}</span>
                  {item.hint ? <span className="text-[11px] font-mono text-kumo-subtle truncate">{item.hint}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
