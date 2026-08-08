import { useEffect, useState, useRef } from "react";
import { CirclesThreePlus, Stop } from "@phosphor-icons/react";

interface RunningAgent {
  sessionId: string;
  startTime: number;
}

interface AgentStatusProps {
  onStop: (sessionId?: string) => void;
}

export function AgentStatus({ onStop }: AgentStatusProps) {
  const [running, setRunning] = useState<RunningAgent[]>([]);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Initial fetch
    fetch("/api/agent/status", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (d.running) setRunning(d.running);
    }).catch(() => {});

    // Poll for status changes
    const timer = setInterval(async () => {
      try {
        const res = await fetch("/api/agent/status", { cache: "no-store" });
        const d = await res.json();
        setRunning(d.running || []);
      } catch {}
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  if (running.length === 0) return null;

  const elapsed = Math.floor((Date.now() - running[0].startTime) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-xs">
      <CirclesThreePlus size={12} className="text-amber-400 animate-pulse" />
      <span className="text-amber-300/90">Agent running...</span>
      <span className="text-[10px] text-amber-400/60 font-mono">{String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</span>
      <button
        onClick={() => onStop(running[0].sessionId)}
        className="ml-1 text-amber-400/60 hover:text-red-400 transition-colors"
        title="Stop agent"
      >
        <Stop size={12} />
      </button>
    </div>
  );
}
