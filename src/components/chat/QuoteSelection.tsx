import { useRef, useState } from "react";
import { sendQuoteToChat } from "~/lib/chat-quote";

/**
 * "Tambahkan ke chat" for a text selection inside an artifact viewer (M4 item 21).
 *
 * Put `ref` and `onMouseUp` on the viewer's root (it must be `relative`), and render
 * `button` inside it. The button appears above a selection made in that root.
 */
export function useQuoteSelection(source: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [quote, setQuote] = useState<{ text: string; x: number; y: number } | null>(null);

  function onMouseUp() {
    const sel = window.getSelection();
    const root = ref.current;
    const text = sel && !sel.isCollapsed ? sel.toString().trim() : "";
    if (!sel || !root || !text || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
      setQuote(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    const box = root.getBoundingClientRect();
    setQuote({ text, x: rect.left - box.left + rect.width / 2, y: rect.top - box.top });
  }

  const button = quote ? (
    <button
      // Keep the selection while the button is pressed, so the click still has its text.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        sendQuoteToChat({ text: quote.text, source });
        setQuote(null);
        window.getSelection()?.removeAllRanges();
      }}
      style={{ left: quote.x, top: quote.y }}
      className="absolute z-10 -translate-x-1/2 -translate-y-full mb-1 rounded-md px-2 py-1 text-xs shadow ring ring-kumo-line bg-kumo-elevated text-kumo-default hover:bg-kumo-tint"
    >
      Tambahkan ke chat
    </button>
  ) : null;

  return { ref, onMouseUp, button };
}
