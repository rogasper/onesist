import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePageVisible } from "~/lib/use-file-data";

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

// Cap the log ring buffer — an agent emitting a lot of output must never grow
// the DOM / logs array without bound (that was a memory-leak vector).
const MAX_LOGS = 500;

export function AgentStream({ sessionId, onDone, onError }: AgentStreamProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<string>("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const pageVisible = usePageVisible();

  const pushLog = useCallback((level: string, message: string) => {
    setLogs((prev) => [...prev, { level, message, timestamp: Date.now() }].slice(-MAX_LOGS));
  }, []);

  useEffect(() => {
    let mounted = true;
    let es: EventSource | null = null;
    let errorCount = 0;
    let ticket = "";

    const init = async () => {
      try {
        const res = await fetch("/api/events/ticket", { method: "POST", cache: "no-store" });
        const d = await res.json();
        ticket = d.ticket;

        es = new EventSource(`/api/events?ticket=${ticket}`);

        es.addEventListener("connected", () => {
          if (!mounted) return;
          pushLog("system", "Connected to event stream");
        });

        es.addEventListener("agent:log", (e) => {
          if (!mounted) return;
          const data = JSON.parse(e.data);
          if (data.sessionId && data.sessionId !== sessionId) return;
          pushLog(data.level || "output", data.message);
        });

        es.addEventListener("agent:status", (e) => {
          if (!mounted) return;
          const data = JSON.parse(e.data);
          if (data.sessionId !== sessionId) return;
          setStatus(data.status);
          if (data.status === "completed") {
            pushLog("system", "✓ Analysis complete");
            onDone?.();
          } else if (data.status === "failed") {
            pushLog("error", `✗ Failed: ${data.message}`);
            onError?.(data.message);
          } else if (data.status === "running") {
            pushLog("system", "► Agent running...");
          }
        });

        es.addEventListener("agent:done", (e) => {
          if (!mounted) return;
          const data = JSON.parse(e.data);
          if (data.sessionId !== sessionId) return;
          pushLog("system", "✓ Analysis done — artifacts generated");
          onDone?.();
        });

        es.addEventListener("agent:error", (e) => {
          if (!mounted) return;
          const data = JSON.parse(e.data);
          if (data.sessionId !== sessionId) return;
          pushLog("error", `✗ Error: ${data.error}`);
          onError?.(data.error);
        });

        // Guard against infinite auto-reconnect when the server is down —
        // otherwise the WebView spins reconnect requests forever (memory leak).
        es.onerror = () => {
          errorCount += 1;
          if (errorCount > 5) {
            es?.close();
            es = null;
          }
        };
      } catch {}
    };

    if (pageVisible) void init();

    return () => {
      mounted = false;
      es?.close();
      es = null;
    };
  }, [sessionId, pageVisible, pushLog, onDone, onError]);

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
    <div className="border border-kumo-line rounded-lg overflow-hidden bg-kumo-recessed">
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
          <div key={i} className={`whitespace-pre-wrap break-words ${levelStyles[log.level] || "text-kumo-subtle"}`}>
            {log.message}
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
