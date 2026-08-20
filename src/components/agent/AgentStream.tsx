import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Stop, Check, CaretRight, CaretDown, X } from "@phosphor-icons/react";
import { usePageVisible } from "~/lib/use-file-data";
import { FeedbackBox } from "~/components/agent/FeedbackBox";

interface LogEntry {
  level: string;
  message: string;
  timestamp: number;
}

interface AgentStreamProps {
  sessionId: string;
  onDone?: () => void;
  onError?: (error: string) => void;
  onStopped?: () => void;
  /** When provided, shows a "send feedback" box after the agent finishes so the
   *  user can continue the session with a correction instead of restarting. */
  onFeedback?: (feedback: string) => void;
  /** When provided, shows a close (X) button that dismisses the panel. */
  onClose?: () => void;
}

// Cap the log ring buffer — an agent emitting a lot of output must never grow
// the DOM / logs array without bound (that was a memory-leak vector).
const MAX_LOGS = 500;

// Pixel-grid wavefront (chevron) delays for the loader — 3x3 cells.
const PIXEL_DELAYS = [90, 180, 270, 90, 0, 90, 270, 180, 90];

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

function PixelLoader() {
  return (
    <span className="inline-grid grid-cols-3 gap-[3px]" aria-hidden>
      {PIXEL_DELAYS.map((d, i) => (
        <span
          key={i}
          className="size-[4px] rounded-[1px] bg-kumo-brand"
          style={{ opacity: 0.15, animation: `pixel-on 650ms ease-in-out ${d}ms infinite` }}
        />
      ))}
    </span>
  );
}

function ShimmerLabel({ children }: { children: ReactNode }) {
  return (
    <span
      className="bg-clip-text text-[13px] font-medium text-transparent"
      style={{
        backgroundImage:
          "linear-gradient(90deg, var(--color-kumo-subtle) 35%, var(--color-kumo-default) 50%, var(--color-kumo-subtle) 65%)",
        backgroundSize: "200% 100%",
        animation: "shimmer-text 1.4s linear infinite",
      }}
    >
      {children}
    </span>
  );
}

/** Output text — the newest chunk fades in (single element, NO per-word spans:
 *  hundreds of animated spans caused React "insertBefore not a child" commit
 *  crashes when they re-rendered during concurrent commits). */
function StreamText({ text, animate }: { text: string; animate: boolean }) {
  return (
    <div
      className="whitespace-pre-wrap break-words text-xs leading-relaxed text-kumo-default"
      style={animate ? { animation: "stream-in 300ms ease-out both" } : undefined}
    >
      {text ?? ""}
    </div>
  );
}

export function AgentStream({ sessionId, onDone, onError, onStopped, onFeedback, onClose }: AgentStreamProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<string>("idle");
  const [replayPending, setReplayPending] = useState(true);
  const [stalled, setStalled] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(true);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastActivityRef = useRef(Date.now());
  // Highest event timestamp already applied for this session (replay or live).
  // Persists across effect re-runs (visibility toggles, reconnects) so the
  // buffered replay can be re-applied as an idempotent delta — without it, a
  // session that finished while the SSE stream was closed (window hidden /
  // connection dropped) never reaches the UI: the one-shot replay guard
  // skipped the buffered completion and the fresh stream gets no live events.
  const appliedTsRef = useRef(0);
  const statusRef = useRef(status);
  useEffect(() => { statusRef.current = status; }, [status]);
  const pageVisible = usePageVisible();

  const pushLog = useCallback((level: string, message: string) => {
    lastActivityRef.current = Date.now();
    setStalled(false);
    setLogs((prev) => [...prev, { level, message, timestamp: Date.now() }].slice(-MAX_LOGS));
  }, []);

  // Live elapsed timer — ticks every second ONLY while the agent is running.
  // Stopping after completion avoids re-committing the panel's spans every
  // second (that churn combined with external DOM mutations caused React
  // "insertBefore not a child" commit crashes on large mounts).
  useEffect(() => {
    if (!startedAt || status !== "running") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt, status]);
  const elapsedMs = startedAt ? now - startedAt : 0;

  // If the agent is "running" but hasn't emitted anything for a while (model
  // cold start / provider busy), say so instead of showing a silent panel.
  useEffect(() => {
    if (status !== "running") { setStalled(false); return; }
    const t = setInterval(() => {
      setStalled(Date.now() - lastActivityRef.current > 15000);
    }, 3000);
    return () => clearInterval(t);
  }, [status]);

  // Single code path for BOTH live SSE events and buffered replay — so a client
  // that connects mid-run shows the same status/logs/errors as one that was
  // connected from the start.
  const applyEvent = useCallback((type: string, data: any) => {
    if (type === "agent:log") {
      if (data.sessionId && data.sessionId !== sessionId) return;
      pushLog(data.level || "output", data.message);
    } else if (type === "agent:status") {
      if (data.sessionId !== sessionId) return;
      setStatus(data.status);
      if (data.status === "running") {
        setStartedAt(Date.now());
        pushLog("system", "► Agent running...");
      } else if (data.status === "completed") {
        pushLog("system", "✓ Analysis complete");
        onDone?.();
      } else if (data.status === "failed") {
        pushLog("error", `✗ Failed: ${data.message}`);
        onError?.(data.message);
      } else if (data.status === "stopped") {
        // "✕ Agent stopped" is pushed optimistically by handleStop — don't
        // duplicate it here.
        setStatus("stopped");
        onStopped?.();
      }
    } else if (type === "agent:done") {
      if (data.sessionId !== sessionId) return;
      pushLog("system", "✓ Analysis done — artifacts generated");
      onDone?.();
    } else if (type === "agent:error") {
      if (data.sessionId !== sessionId) return;
      pushLog("error", `✗ Error: ${data.error}`);
      onError?.(data.error);
    }
  }, [sessionId, pushLog, onDone, onError, onStopped]);

  const handleStop = useCallback(async () => {
    try {
      await fetch("/api/agent/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch {}
    setStatus("stopped");
    pushLog("system", "✕ Agent stopped");
    onStopped?.();
  }, [sessionId, pushLog, onStopped]);

  const handleSendFeedback = useCallback((text: string) => {
    if (!onFeedback) return;
    pushLog("system", "✉ Feedback dikirim — agent meneruskan sesi untuk memperbaiki…");
    onFeedback(text);
  }, [onFeedback, pushLog]);

  useEffect(() => {
    let mounted = true;
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setInterval> | null = null;
    let retries = 0;

    // Apply buffered events newer than the applied cursor. Idempotent — safe
    // on every init, reconnect, and onopen. Returns whether a terminal event
    // (completed/failed/stopped/done/error) was applied.
    const applyReplayDelta = async (): Promise<boolean> => {
      try {
        const res = await fetch(`/api/agent/logs?sessionId=${encodeURIComponent(sessionId)}`, { cache: "no-store" });
        const d = await res.json();
        if (!mounted) return false;
        const replay = Array.isArray(d?.events) ? d.events : [];
        let maxTs = appliedTsRef.current;
        let terminal = false;
        for (const e of replay) {
          const ts = e?.ts ?? 0;
          if (ts <= appliedTsRef.current) continue;
          applyEvent(e.type, e.data);
          if (ts > maxTs) maxTs = ts;
          if (e.type === "agent:done" || e.type === "agent:error"
            || (e.type === "agent:status" && ["completed", "failed", "stopped"].includes(e?.data?.status))) {
            terminal = true;
          }
        }
        appliedTsRef.current = maxTs;
        return terminal;
      } catch {
        return false;
      }
    };

    const scheduleRetry = () => {
      if (!mounted) return;
      retries += 1;
      if (retries > 8) {
        // Stream permanently dead (e.g. server restarted mid-run, history
        // lost) — fall back to a status poll so the UI can never stay
        // "running" forever.
        if (!fallbackTimer) {
          fallbackTimer = setInterval(async () => {
            try {
              const terminal = await applyReplayDelta();
              if (!mounted) return;
              if (terminal || statusRef.current !== "running") {
                clearInterval(fallbackTimer!);
                fallbackTimer = null;
                return;
              }
              const res = await fetch("/api/agent/status", { cache: "no-store" });
              const d = await res.json();
              const stillRunning = Array.isArray(d?.running) && d.running.some((a: any) => a.sessionId === sessionId);
              if (!stillRunning) {
                clearInterval(fallbackTimer!);
                fallbackTimer = null;
                pushLog("error", "✗ Koneksi ke agent terputus — status tidak diketahui. Muat ulang halaman.");
                onError?.("Koneksi ke agent terputus — status tidak diketahui. Muat ulang halaman.");
              }
            } catch {}
          }, 15000);
        }
        return;
      }
      retryTimer = setTimeout(() => { void openStream(); }, 1500 * Math.min(retries, 4));
    };

    const openStream = async () => {
      try {
        const ticketRes = await fetch("/api/events/ticket", { method: "POST", cache: "no-store" }).then((r) => r.json());
        if (!mounted) return;
        if (!ticketRes.ticket) throw new Error("no ticket");
        es = new EventSource(`/api/events?ticket=${ticketRes.ticket}`);
        if (!mounted) {
          es.close();
          es = null;
          return;
        }

        const handleLive = (type: string) => (e: MessageEvent) => {
          if (!mounted) return;
          try {
            const payload = JSON.parse(e.data);
            if (!payload.timestamp || payload.timestamp <= appliedTsRef.current) return;
            appliedTsRef.current = payload.timestamp;
            // SSE payload is NESTED: { type, data:{level,message,sessionId}, timestamp }.
            // applyEvent expects the INNER data — passing the whole payload made
            // every live log/status have undefined fields (logs invisible until
            // refresh replayed them; that was the "not realtime" bug).
            applyEvent(type, payload.data);
          } catch {}
        };

        es.addEventListener("agent:log", handleLive("agent:log"));
        es.addEventListener("agent:status", handleLive("agent:status"));
        es.addEventListener("agent:done", handleLive("agent:done"));
        es.addEventListener("agent:error", handleLive("agent:error"));

        // Close the snapshot/connect race: events emitted between the logs
        // fetch and the live handshake are replayed once connected.
        es.onopen = () => { void applyReplayDelta(); };

        // Do NOT rely on EventSource auto-reconnect: it reuses the original
        // ticket, which expires mid-run and then 401s forever. Close and
        // re-init with a FRESH ticket + delta replay, so a dropped connection
        // can never lose the completion events. Retries are capped so a dead
        // server can't spin reconnect attempts forever.
        es.onerror = () => {
          es?.close();
          es = null;
          scheduleRetry();
        };
      } catch {
        es?.close();
        es = null;
        scheduleRetry();
      }
    };

    const init = async () => {
      await applyReplayDelta();
      setReplayPending(false);
      await openStream();
    };

    if (pageVisible) void init();

    return () => {
      mounted = false;
      es?.close();
      es = null;
      if (retryTimer) clearTimeout(retryTimer);
      if (fallbackTimer) clearInterval(fallbackTimer);
    };
  }, [sessionId, pageVisible, pushLog, applyEvent, onError]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs, toolsOpen]);

  const running = status === "running";

  // Group the flat log stream into display sections (append-only, so index
  // keys stay stable per section).
  const systemLines = logs.filter((l) => l.level === "system" || l.level === "info");
  const thinkLines = logs.filter((l) => l.level === "think");
  const toolLogs = logs.filter((l) => l.level === "tool");
  const outputLogs = logs.filter((l) => l.level === "output");
  const errorLines = logs.filter((l) => l.level === "error" || l.level === "stderr");

  return (
    <div className="border border-kumo-line rounded-lg overflow-hidden bg-kumo-recessed">
      {/* Header — status + live elapsed timer + stop */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-kumo-line bg-kumo-elevated/50">
        <span className="text-[10px] text-kumo-subtle font-medium">Agent Output</span>
        <div className="flex items-center gap-2">
          {startedAt && (
            <span className="font-mono text-[11px] text-kumo-subtle tabular-nums" title="Elapsed">
              {fmtElapsed(elapsedMs)}
            </span>
          )}
          {running && (
            <button
              onClick={handleStop}
              className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors"
              title="Stop agent"
            >
              <Stop size={10} weight="fill" /> Stop
            </button>
          )}
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${
            running ? "text-amber-400 bg-amber-500/10" :
            status === "completed" ? "text-green-400 bg-green-500/10" :
            status === "failed" || status === "stopped" ? "text-red-400 bg-red-500/10" :
            "text-kumo-subtle bg-kumo-elevated"
          }`}>{status}</span>
          {onClose && (
            <button
              onClick={onClose}
              title="Tutup panel agent"
              className="p-1 rounded text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated transition-colors"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="max-h-80 overflow-y-auto p-3 space-y-2">
        {running && (
          <div className="flex items-center gap-2.5 rounded-lg border border-kumo-line/60 bg-kumo-elevated/30 px-3 py-2">
            <PixelLoader />
            <ShimmerLabel>Agent berjalan…</ShimmerLabel>
            <span className="font-mono text-[11px] text-kumo-subtle tabular-nums ml-auto">{fmtElapsed(elapsedMs)}</span>
          </div>
        )}

        {logs.length === 0 && replayPending && (
          <div className="text-kumo-subtle text-xs">Memuat riwayat agent…</div>
        )}
        {logs.length === 0 && !replayPending && status === "idle" && (
          <div className="text-kumo-subtle text-xs">Menunggu output agent…</div>
        )}

        {/* System / status lines */}
        {systemLines.length > 0 && (
          <div className="space-y-0.5">
            {systemLines.map((log, i) => (
              <div key={i} className={`text-[11px] ${log.level === "system" ? "text-green-400/70" : "text-kumo-subtle"} truncate`} title={log.message}>
                {log.message}
              </div>
            ))}
          </div>
        )}

        {/* Thinking (reasoning) prose */}
        {thinkLines.length > 0 && (
          <div className="space-y-1">
            {thinkLines.map((log, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-400/80 whitespace-pre-wrap break-words leading-relaxed">
                <CaretRight size={11} className="mt-0.5 shrink-0 opacity-60" />
                <span>{log.message}</span>
              </div>
            ))}
          </div>
        )}

        {/* Tools — collapsible accordion, separate from messages */}
        {toolLogs.length > 0 && (
          <div className="rounded-lg border border-kumo-line/60 overflow-hidden">
            <button
              onClick={() => setToolsOpen((o) => !o)}
              className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-[10px] font-medium text-kumo-subtle uppercase tracking-wider bg-kumo-elevated/40 hover:bg-kumo-tint transition-colors"
            >
              <CaretDown size={11} className={`transition-transform duration-200 ${toolsOpen ? "" : "-rotate-90"}`} />
              Tools <span className="opacity-70">({toolLogs.length})</span>
            </button>
            {toolsOpen && (
              <div className="p-2 space-y-1 max-h-56 overflow-y-auto">
                {toolLogs.map((log, i) => (
                  <ToolRow key={i} message={log.message} isLatest={i === toolLogs.length - 1} running={running} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Messages — streaming output */}
        {outputLogs.length > 0 && (
          <div className="space-y-1">
            {outputLogs.map((log, i) => (
              <StreamText key={i} text={log.message} animate={i === outputLogs.length - 1} />
            ))}
          </div>
        )}

        {/* Errors */}
        {errorLines.length > 0 && (
          <div className="space-y-1">
            {errorLines.map((log, i) => (
              <div key={i} className={`text-[11px] whitespace-pre-wrap break-words ${log.level === "error" ? "text-red-400" : "text-kumo-subtle"}`}>
                {log.message}
              </div>
            ))}
          </div>
        )}

        {/* Feedback — continue the session with a correction (no restart) */}
        {(status === "completed" || status === "failed") && onFeedback && (
          <FeedbackBox onSend={handleSendFeedback} />
        )}

        {stalled && (
          <div className="text-kumo-subtle animate-pulse text-xs">masih berjalan — menunggu model…</div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

/** One tool trace row — spinner while it's the active step, check when done.
 *  The message is `toolName: <input>`; the input is usually raw JSON, so we
 *  prettify it into `name + detail` (e.g. `read: spec_api.md`, `bash: npm test`). */
function ToolRow({ message, isLatest, running }: { message: string; isLatest: boolean; running: boolean }) {
  const { name, detail } = formatToolMessage(message);
  return (
    <div className="flex items-start gap-1.5 text-[11px] font-mono whitespace-pre-wrap break-words">
      {isLatest && running ? (
        <span className="mt-0.5 size-2.5 shrink-0 rounded-full border-[1.5px] border-kumo-line border-t-blue-400 animate-spin" />
      ) : (
        <Check size={11} className="mt-0.5 shrink-0 text-green-400/70" />
      )}
      <span className="text-blue-400/80 shrink-0">{name}</span>
      {detail && <span className="text-kumo-subtle min-w-0">{detail}</span>}
    </div>
  );
}

/** Split a tool log `name: <input>` and extract a readable summary from the
 *  (usually JSON) input — strip raw JSON + the noisy absolute project root. */
function formatToolMessage(message: string): { name: string; detail: string } {
  const idx = message.indexOf(":");
  if (idx === -1) return { name: message.trim(), detail: "" };
  const name = message.slice(0, idx).trim();
  const rest = message.slice(idx + 1).trim();
  let detail = rest;
  if (rest.startsWith("{") || rest.startsWith("[")) {
    try {
      detail = summarizeTool(name, JSON.parse(rest));
    } catch {}
  } else if (name === "file" || name === "read" || name === "write" || name === "edit") {
    // Plain-text path (codex `file: /abs/path`) — prettify it directly.
    detail = prettyPath(rest);
  }
  return { name, detail: stripRoot(detail) };
}

function summarizeTool(name: string, obj: any): string {
  switch (name) {
    case "read":
    case "write":
    case "edit":
    case "create":
    case "patch":
    case "file":
      return prettyPath(obj.filePath ?? obj.file_path ?? obj.path ?? obj.file ?? "");
    case "glob":
    case "ls":
    case "list":
      return obj.pattern ?? prettyPath(obj.path ?? "");
    case "bash":
    case "run":
      return obj.command ?? "";
    case "todowrite":
    case "todo":
    case "update_todo": {
      const n = Array.isArray(obj.todos) ? obj.todos.length : 0;
      return n > 0 ? `${n} todos` : "todos";
    }
    case "grep":
    case "search":
      return obj.pattern ?? obj.query ?? "";
    case "webfetch":
    case "fetch":
      return obj.url ?? obj.query ?? "";
    default:
      return JSON.stringify(obj).slice(0, 140);
  }
}

function prettyPath(p: string): string {
  if (!p) return "";
  // Already relative (e.g. "output/spec/x.md") — keep it.
  if (/^(input|output|src|packages|app|lib|docs)\//.test(p)) return p;
  // Strip the noisy absolute project root — show from input/output/src onwards.
  const m = p.match(/\/((?:input|output|src|packages|app|lib|docs)\/.*)$/);
  if (m) return m[1];
  const seg = p.split("/");
  return seg.length > 1 ? seg.slice(-2).join("/") : p;
}

/** Replace absolute `/…/project/…/input|output|…/…` prefixes with the short form
 *  so command output (e.g. `mkdir -p /Users/…/output/rtm`) reads as `output/rtm`. */
function stripRoot(text: string): string {
  return text.replace(/\/(?:[^/\s]+\/)+(input|output|src|packages|app|lib|docs)\//g, "$1/");
}
