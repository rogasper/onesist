import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Sparkle } from "@phosphor-icons/react";

export interface MentionFile {
  name: string;
  path: string;
}

/** One `char`-triggered popup inside the textarea. */
export interface MentionTrigger {
  char: string;
  items: {
    name: string;
    path: string;
    hint?: string;
    tag?: string;
    /** Text to insert instead of `<char><path>`. Slash commands use it: the user
     *  types `/sit` but the field should end up holding the full instruction. */
    insert?: string;
  }[];
  /** Header line shown above the items, e.g. "Skill · menentukan format artefak". */
  label?: string;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  /** Items for the `@` trigger. Kept for callers that only mention files. */
  files: MentionFile[];
  /** Additional/alternative triggers. When given, `files` is ignored. */
  triggers?: MentionTrigger[];
  rows?: number;
  className?: string;
  placeholder?: string;
  /** Called when Enter is pressed without Shift while the mention popup is CLOSED.
   *  Without this the chat composer cannot use this component: Enter must
   *  send the message, while Enter when picking an item must insert it. */
  onSubmit?: () => void;
  /** Called when files are dropped onto the textarea (attachment). */
  onFilesDropped?: (files: File[]) => void;
  disabled?: boolean;
  /** Grow the field with its content up to the CSS `max-height`, instead of
   *  scrolling inside a fixed box. Opt-in: callers that size the textarea
   *  themselves (`h-full` inside a resizable pane) must not get this. */
  autoGrow?: boolean;
  /** Optional forced height (px) for callers that auto-grow. */
  maxHeightPx?: number;
}

/** Builds `\@([^\s\@]*)$`-style matchers for each configured trigger char. */
function triggerPattern(char: string): RegExp {
  const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\s)${escaped}([^\\s${escaped}]*)$`);
}

export function MentionTextarea({
  value,
  onChange,
  files,
  triggers,
  rows = 9,
  className,
  placeholder,
  onSubmit,
  onFilesDropped,
  disabled,
  autoGrow,
  maxHeightPx,
}: MentionTextareaProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [dropActive, setDropActive] = useState(false);
  /** Index of the trigger whose popup is open, or null. */
  const [openTrigger, setOpenTrigger] = useState<number | null>(null);

  // Backwards compatible default: a single `@` trigger fed by `files`.
  const activeTriggers = useMemo<MentionTrigger[]>(
    () => triggers ?? [{ char: "@", items: files.map((f) => ({ name: f.name, path: f.path })) }],
    [triggers, files],
  );

  const open = openTrigger != null;
  const active = openTrigger != null ? activeTriggers[openTrigger] : null;

  const filtered = useMemo(() => {
    if (!active) return [];
    const q = query.toLowerCase();
    return active.items
      .filter((i) => !q || i.path.toLowerCase().includes(q) || i.name.toLowerCase().includes(q) || (i.hint ?? "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [active, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, openTrigger]);

  useEffect(() => {
    if (!autoGrow) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = maxHeightPx ? Math.min(ta.scrollHeight, maxHeightPx) : ta.scrollHeight;
    ta.style.height = `${next}px`;
  }, [autoGrow, value, maxHeightPx]);

  /** Which trigger the caret currently sits in, and what was typed after it. */
  const detect = (text: string, caret: number): { index: number; query: string; start: number } | null => {
    let best: { index: number; query: string; start: number } | null = null;
    activeTriggers.forEach((trigger, index) => {
      const m = triggerPattern(trigger.char).exec(text.slice(0, caret));
      if (!m) return;
      const start = caret - m[0].length + (m[0].length - m[1].length - 1);
      if (!best || start >= best.start) best = { index, query: m[1], start };
    });
    return best;
  };

  const detectTrigger = () => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? ta.value.length;
    const found = detect(ta.value, pos);
    if (found) {
      setQuery(found.query);
      setOpenTrigger(found.index);
    } else {
      setOpenTrigger(null);
    }
  };

  /** Replaces `@query` / `$query` with `@path` / `$path`.
   *
   *  The trigger character is part of the inserted text: a mention is only a
   *  mention if it keeps its marker. Dropping it produced a bare path, which the
   *  agent then had to guess was meant as a reference. */
  const insert = (item: { path: string; insert?: string }) => {
    const ta = taRef.current;
    if (!ta || openTrigger == null) return;
    const trigger = activeTriggers[openTrigger];
    const pos = ta.selectionStart ?? value.length;
    const found = detect(value, pos);
    const start = found ? found.start : pos;
    const inserted = item.insert ?? `${trigger.char}${item.path}`;
    const next = value.slice(0, start) + inserted + value.slice(pos);
    onChange(next);
    setOpenTrigger(null);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + inserted.length;
      ta.setSelectionRange(caret, caret);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((h) => (h + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((h) => (h - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const sel = filtered[highlight];
        if (sel) insert(sel);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpenTrigger(null);
        return;
      }
    }
    if (onSubmit && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
    if (!onFilesDropped) return;
    const dropped = Array.from(e.dataTransfer?.files ?? []);
    if (!dropped.length) return;
    e.preventDefault();
    setDropActive(false);
    onFilesDropped(dropped);
  };

  const isSkillTrigger = active?.char === "$";

  return (
    <div className="relative h-full">
      <textarea
        ref={taRef}
        value={value}
        rows={rows}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onInput={detectTrigger}
        onKeyDown={handleKeyDown}
        onScroll={() => setOpenTrigger(null)}
        onDragOver={(e) => {
          if (!onFilesDropped) return;
          e.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={handleDrop}
        onBlur={() => {
          setTimeout(() => setOpenTrigger(null), 120);
        }}
        className={`${className ?? ""} ${dropActive ? "ring-2 ring-kumo-brand" : ""}`}
        placeholder={placeholder}
      />
      {open && active ? (
        <div className="absolute left-0 right-0 bottom-full mb-1 max-h-64 overflow-y-auto rounded-lg border border-kumo-line bg-kumo-elevated shadow-lg z-50">
          {active.label ? (
            <p className="px-3 py-1.5 text-[10px] uppercase tracking-wide text-kumo-subtle border-b border-kumo-line">{active.label}</p>
          ) : null}
          {filtered.length === 0 ? (
            // A trigger that matches but has nothing to offer must SAY so. It
            // used to render nothing at all, which is indistinguishable from the
            // popup being broken — and that is exactly how an empty `/` list
            // stayed invisible (the list was empty because of a missing
            // dependency, not because the user typed something wrong).
            <p className="px-3 py-2 text-[11px] text-kumo-subtle">
              {active.char === "/" ? "Tidak ada perintah yang cocok." : active.char === "$" ? "Tidak ada skill yang cocok." : "Tidak ada berkas yang cocok."}
            </p>
          ) : (
            filtered.map((item, i) => (
              <button
                key={item.path}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  insert(item);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full text-left px-3 py-1.5 flex items-start gap-2 ${
                  i === highlight ? "bg-kumo-tint text-kumo-default" : "text-kumo-subtle"
                }`}
              >
                <span className="mt-0.5 shrink-0 opacity-60">
                  {isSkillTrigger ? <Sparkle size={11} /> : <FileText size={11} />}
                </span>
                <span className="grid gap-0.5 min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={`truncate ${isSkillTrigger ? "text-sm text-kumo-default" : "text-[11px] font-mono"}`}>
                      {isSkillTrigger ? item.name : item.path}
                    </span>
                    {item.tag ? <span className="shrink-0 text-[10px] uppercase tracking-wide text-kumo-subtle">{item.tag}</span> : null}
                  </span>
                  {item.hint ? <span className="text-[11px] leading-snug text-kumo-subtle line-clamp-2">{item.hint}</span> : null}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
