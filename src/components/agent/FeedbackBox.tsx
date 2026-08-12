import { useState } from "react";

interface FeedbackBoxProps {
  onSend: (text: string) => void;
  placeholder?: string;
}

/** Compact "send feedback to continue the agent session" input — shown where the
 *  result is being inspected (AgentStream panel, OpenAPI overlay, etc.). */
export function FeedbackBox({ onSend, placeholder = "Hasil bermasalah? Kasih tahu agent untuk diperbaiki…" }: FeedbackBoxProps) {
  const [text, setText] = useState("");

  const send = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    onSend(t);
  };

  return (
    <div className="rounded-lg border border-kumo-line/60 bg-kumo-elevated/30 p-2">
      <div className="flex items-center gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder={placeholder}
          className="flex-1 min-w-0 bg-kumo-recessed/60 border border-kumo-line rounded px-2 py-1.5 text-[11px] text-kumo-default placeholder:text-kumo-subtle focus:border-kumo-brand focus:outline-none"
        />
        <button
          onClick={send}
          disabled={!text.trim()}
          className="shrink-0 px-2.5 py-1.5 text-[11px] font-medium rounded border border-kumo-brand/50 text-kumo-brand hover:bg-kumo-brand/10 transition-colors disabled:opacity-40"
        >
          Kirim
        </button>
      </div>
      <p className="text-[9.5px] text-kumo-subtle mt-1">Melanjutkan sesi agent yang sama — konteks tetap, cukup perbaiki.</p>
    </div>
  );
}
