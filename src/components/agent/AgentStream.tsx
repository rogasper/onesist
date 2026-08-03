import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface LogEntry {
  level: string;
  message: string;
  timestamp: number;
}

interface AgentStreamProps {
  sessionId: string;
  onDone?: () => void;
  onError?: (error: string) => void;
}

export function AgentStream({ sessionId, onDone, onError }: AgentStreamProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<string>("idle");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let mounted = true;
    let ticket = "";

    const init = async () => {
      try {
        const res = await fetch("/api/events/ticket", { method: "POST" });
        const d = await res.json();
        ticket = d.ticket;

        const es = new EventSource(`/api/events?ticket=${ticket}`);

        es.addEventListener("connected", () => {
          if (!mounted) return;
          setLogs((prev) => [...prev, { level: "system", message: "Connected to event stream", timestamp: Date.now() }]);
        });

        es.addEventListener("agent:log", (e) => {
          if (!mounted) return;
          const data = JSON.parse(e.data);
          if (data.sessionId && data.sessionId !== sessionId) return;
          setLogs((prev) => [...prev, { level: data.level || "output", message: data.message, timestamp: data.timestamp }]);
        });

        es.addEventListener("agent:status", (e) => {
          if (!mounted) return;
          const data = JSON.parse(e.data);
          if (data.sessionId !== sessionId) return;
          setStatus(data.status);
          if (data.status === "completed") {
            setLogs((prev) => [...prev, { level: "system", message: "✓ Analysis complete", timestamp: Date.now() }]);
            onDone?.();
          } else if (data.status === "failed") {
            setLogs((prev) => [...prev, { level: "error", message: `✗ Failed: ${data.message}`, timestamp: Date.now() }]);
            onError?.(data.message);
          } else if (data.status === "running") {
            setLogs((prev) => [...prev, { level: "system", message: "► Agent running...", timestamp: Date.now() }]);
          }
        });

        es.addEventListener("agent:done", (e) => {
          if (!mounted) return;
          const data = JSON.parse(e.data);
          if (data.sessionId !== sessionId) return;
          setLogs((prev) => [...prev, { level: "system", message: "✓ Analysis done — artifacts generated", timestamp: Date.now() }]);
          onDone?.();
        });

        es.addEventListener("agent:error", (e) => {
          if (!mounted) return;
          const data = JSON.parse(e.data);
          if (data.sessionId !== sessionId) return;
          setLogs((prev) => [...prev, { level: "error", message: `✗ Error: ${data.error}`, timestamp: Date.now() }]);
          onError?.(data.error);
        });

        return () => es.close();
      } catch {}
    };

    init();

    return () => { mounted = false; };
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const levelStyles: Record<string, string> = {
    think: "text-amber-400/80",
    tool: "text-blue-400/70",
    output: "text-kumo-default",
    error: "text-red-400",
    system: "text-green-400/70",
    stderr: "text-kumo-subtle",
    info: "text-kumo-subtle",
  };

  return (
    <div className="border border-kumo-line rounded-lg overflow-hidden bg-[#161616]">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-kumo-line bg-kumo-elevated/50">
        <span className="text-[10px] text-kumo-subtle font-medium">Agent Output</span>
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
          status === "running" ? "text-amber-400 bg-amber-500/10" :
          status === "completed" ? "text-green-400 bg-green-500/10" :
          status === "failed" ? "text-red-400 bg-red-500/10" :
          "text-kumo-subtle bg-kumo-elevated"
        }`}>{status}</span>
      </div>
      <div className="max-h-80 overflow-y-auto p-3 space-y-1 font-mono text-[11px] leading-relaxed">
        {logs.map((log, i) => (
          <div key={i} className={`${levelStyles[log.level] || "text-kumo-subtle"}`}>
            {log.message.split("\n").map((line, j) => (
              <div key={j} className="whitespace-pre-wrap break-words">{line}</div>
            ))}
          </div>
        ))}
        {status === "running" && (
          <div className="text-green-400/50 animate-pulse">▍</div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
