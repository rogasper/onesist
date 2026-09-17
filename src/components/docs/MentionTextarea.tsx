import { useEffect, useMemo, useRef, useState } from "react";
import { FileText } from "@phosphor-icons/react";

export interface MentionFile {
  name: string;
  path: string;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  files: MentionFile[];
  rows?: number;
  className?: string;
  placeholder?: string;
  /** Called when Enter is pressed without Shift while the mention popup is CLOSED.
   *  Without this the chat composer cannot use this component: Enter must
   *  send the message, while Enter when picking a file must insert the
   *  file name. */
  onSubmit?: () => void;
  /** Called when files are dropped onto the textarea (attachment). */
  onFilesDropped?: (files: File[]) => void;
  disabled?: boolean;
  /** Grow the field with its content up to the CSS `max-height`, instead of
   *  scrolling inside a fixed box. Opt-in: callers that size the textarea
   *  themselves (`h-full` inside a resizable pane) must not get this. */
  autoGrow?: boolean;
}

export function MentionTextarea({
  value,
  onChange,
  files,
  rows = 9,
  className,
  placeholder,
  onSubmit,
  onFilesDropped,
  disabled,
  autoGrow,
}: MentionTextareaProps) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [dropActive, setDropActive] = useState(false);

  const filtered = useMemo(() => {
    if (!open) return [];
    const q = query.toLowerCase();
    const matches = files.filter(
      (f) => f.path.toLowerCase().includes(q) || f.name.toLowerCase().includes(q),
    );
    return matches.slice(0, 20);
  }, [open, query, files]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    if (!autoGrow) return;
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [autoGrow, value]);

  const detectTrigger = () => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? ta.value.length;
    const before = ta.value.slice(0, pos);
    const m = /@([^\s@]*)$/.exec(before);
    if (m) {
      setQuery(m[1]);
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const insertMention = (path: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? value.length;
    const before = value.slice(0, pos);
    const m = /@([^\s@]*)$/.exec(before);
    const start = m ? pos - m[0].length : pos;
    const next = value.slice(0, start) + path + value.slice(pos);
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + path.length;
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
        if (sel) insertMention(sel.path);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
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
        onScroll={() => setOpen(false)}
        onDragOver={(e) => {
          if (!onFilesDropped) return;
          e.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={handleDrop}
        onBlur={() => {
          setTimeout(() => setOpen(false), 120);
        }}
        className={`${className ?? ""} ${dropActive ? "ring-2 ring-kumo-brand" : ""}`}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 bottom-full mb-1 max-h-56 overflow-y-auto rounded-lg border border-kumo-line bg-kumo-elevated shadow-lg z-50">
          {filtered.map((f, i) => (
            <button
              key={f.path}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                insertMention(f.path);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full text-left px-3 py-1.5 text-[11px] font-mono flex items-center gap-2 ${
                i === highlight ? "bg-kumo-tint text-kumo-default" : "text-kumo-subtle"
              }`}
            >
              <FileText size={11} className="shrink-0 opacity-60" />
              <span className="truncate">{f.path}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
