import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy } from "@phosphor-icons/react";

interface CopyButtonProps {
  /** The text to copy, or a getter when it is cheaper to build on demand. */
  text: string | (() => string);
  /** `text` = icon + "Salin" (the code-card treatment); `icon` = the glyph alone. */
  variant?: "text" | "icon";
  title?: string;
  className?: string;
}

const RESET_MS = 1400;

/**
 * Copy-to-clipboard with a short "Tersalin" confirmation.
 *
 * Shared because the same four lines had been written by hand in several places
 * (code cards, task detail, docs/SIT/spec/RTM export buttons) with three
 * slightly different confirmations; the chat panel needed a fourth.
 */
export function CopyButton({ text, variant = "text", title = "Salin", className = "" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), RESET_MS);
    } catch {
      /* clipboard access may be denied; stay silent, it is not a meaningful failure */
    }
  }, [text]);

  const base =
    variant === "icon"
      ? "flex items-center rounded-md p-1 text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default"
      : "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-kumo-subtle hover:bg-kumo-tint hover:text-kumo-default";

  return (
    <button onClick={copy} title={title} aria-label={title} className={`${base} ${className}`}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {variant === "text" ? (copied ? "Tersalin" : "Salin") : null}
    </button>
  );
}
