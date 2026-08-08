import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { X, Square, Play } from "@phosphor-icons/react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { buildAgentCommand, type AgentCli } from "~/lib/agent-command";
import { attach, park, destroy as destroyCache, register } from "~/lib/xterm-cache";
import "@xterm/xterm/css/xterm.css";

interface AgentTermPanelProps {
  visible: boolean;
  onClose: () => void;
  defaultAgent?: string;
  projectId?: string;
}

const MIN_WIDTH = 280;
const DEFAULT_WIDTH = 420;
const MAX_WIDTH = 1200;

export function AgentTermPanel({ visible, onClose, defaultAgent = "opencode", projectId }: AgentTermPanelProps) {
  const [connected, setConnected] = useState(false);
  const [agentName, setAgentName] = useState(defaultAgent);
  const [port, setPort] = useState(4323);
  const [projectRoot, setProjectRoot] = useState("");
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const sessionId = `agent-${projectId ?? "default"}`;
  const sessionIdRef = useRef(sessionId);
  const boundSidRef = useRef<string | null>(null);
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [restartTick, setRestartTick] = useState(0);
  const needsReattach = useRef(false);
  const connectingRef = useRef(false);
  const manualEndRef = useRef(false);
  const lastSpawnTimeRef = useRef(0);
  const wheelBoundRef = useRef(false);
  const visibleRef = useRef(visible);
  useEffect(() => { visibleRef.current = visible; }, [visible]);

  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  useEffect(() => {
    fetch("/api/terminal/port", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.port) setPort(d.port);
    }).catch(() => {});
    fetch(`/api/config/project-root${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ""}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.root) setProjectRoot(d.root);
    }).catch(() => {});
  }, [projectId]);

  // Fetch latest project data to get current defaultAgent (route loader may be stale)
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.defaultAgent && d.defaultAgent !== agentName) setAgentName(d.defaultAgent);
    }).catch(() => {});
  }, [projectId]);

  // Sync agent name from defaultAgent prop
  useEffect(() => { setAgentName(defaultAgent); }, [defaultAgent]);

  // Auto-connect when panel opens; reattach the running session instead of respawning
  useEffect(() => {
    if (!visible || !port || !projectRoot) return;
    if (!agentName) return;
    const sid = sessionIdRef.current;
    manualEndRef.current = false;

    // Defensive cleanup: drop any stale/non-open socket and clear stuck flags
    // (e.g. leftover state from HMR or an interrupted flow).
    if (wsRef.current && wsRef.current.readyState !== WebSocket.OPEN) {
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
      connectingRef.current = false;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      if (boundSidRef.current === sid) return;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
      boundSidRef.current = null;
      connectingRef.current = false;
    }
    if (connectingRef.current) return;
    connectingRef.current = true;

    // Reattach cached terminal (close/reopen or navigation round-trip)
    if (!termRef.current) {
      const cached = attach(sid, containerRef.current!);
      if (cached) {
        termRef.current = cached.term;
        fitRef.current = cached.fit;
        try { safeFit(); } catch {}
      }
    }

    const ws = new WebSocket(`ws://localhost:${port}/wss`);
    wsRef.current = ws;

    ws.onopen = () => {
      boundSidRef.current = sid;
      ws.send(JSON.stringify({ type: "status", id: sid }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id !== sid) return;
        if (msg.type === "status") {
          if (msg.exists) {
            // Agent still running — just attach to the live session
            setConnected(true);
            if (!termRef.current && visibleRef.current) createXterm();
            requestAnimationFrame(() => {
              if (fitRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
                const dims = fitRef.current.proposeDimensions();
                if (dims) {
                  wsRef.current.send(JSON.stringify({ type: "resize", id: sid, cols: dims.cols, rows: dims.rows }));
                }
              }
            });
          } else {
            if (manualEndRef.current) {
              manualEndRef.current = false;
              setConnected(false);
              ws.close();
              return;
            }
            const cmd = buildAgentCommand(agentName as AgentCli, { mode: "new" });
            lastSpawnTimeRef.current = Date.now();
            ws.send(JSON.stringify({ type: "spawn", id: sid, command: cmd, cwd: projectRoot || "/tmp" }));
          }
        } else if (msg.type === "replay") {
          if (!termRef.current && visibleRef.current) createXterm();
          if (termRef.current) {
            termRef.current.write(msg.data);
          }
        } else if (msg.type === "ready") {
          setConnected(true);
          if (!termRef.current && visibleRef.current) createXterm();
        } else if (msg.type === "output") {
          if (!termRef.current && visibleRef.current) createXterm();
          if (termRef.current) {
            termRef.current.write(msg.data);
          }
        } else if (msg.type === "exit") {
          if (!termRef.current && visibleRef.current) createXterm();
          if (termRef.current) termRef.current.writeln(`\x1b[33m\nExited (code ${msg.code ?? "?"})\x1b[0m`);
          setConnected(false);
          boundSidRef.current = null;
          connectingRef.current = false;
          wsRef.current = null;
          ws.close();
          // Auto-restart if the process died on its own (not via End session)
          if (!manualEndRef.current && Date.now() - lastSpawnTimeRef.current > 3000) {
            setSessionEpoch((e) => e + 1);
          }
        }
      } catch {}
    };

    ws.onclose = () => { setConnected(false); wsRef.current = null; connectingRef.current = false; };
    ws.onerror = () => { setConnected(false); wsRef.current = null; connectingRef.current = false; };
  }, [visible, port, projectRoot, agentName, sessionId, sessionEpoch, restartTick]);

  // fit() in xterm 6.x can reset the viewport to the bottom; save/restore the
  // scroll position when the user is scrolled up in the normal buffer.
  const safeFit = useCallback(() => {
    const t = termRef.current;
    if (!t || !fitRef.current) return;
    const v = t.buffer.active.type === "normal" ? t.buffer.active.viewportY : 0;
    try { fitRef.current.fit(); } catch {}
    if (v > 0) {
      try { t.scrollToLine(v); } catch {}
    }
  }, []);

  const createXterm = () => {
    if (!containerRef.current || termRef.current) return;

    const fit = new FitAddon();
    const webLinks = new WebLinksAddon();
    const term = new Terminal({
      cursorBlink: true, cursorStyle: "bar", fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
      theme: {
        background: "#0d0d0d", foreground: "#e0e0e0", cursor: "#4ade80",
        selectionBackground: "#4ade8040",
        black: "#1a1a1a", red: "#f87171", green: "#4ade80", yellow: "#fbbf24",
        blue: "#60a5fa", magenta: "#c084fc", cyan: "#67e8f9", white: "#e0e0e0",
        brightBlack: "#404040", brightRed: "#fca5a5", brightGreen: "#86efac",
        brightYellow: "#fde68a", brightBlue: "#93c5fd", brightMagenta: "#d8b4fe",
        brightCyan: "#a5f3fc", brightWhite: "#ffffff",
      },
      allowProposedApi: true, scrollback: 5000,
    });

    term.loadAddon(fit);
    term.loadAddon(webLinks);
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {}

    term.open(containerRef.current);
    register(sessionIdRef.current, term, fit, term.element ?? containerRef.current);

    // Terminal.app-style fallback: while a fullscreen TUI (alt buffer) is
    // active and the program has NOT enabled mouse tracking, translate wheel
    // events into PageUp/PageDown key sequences and send them to the TUI.
    // Otherwise wheel would either do nothing or bubble up and scroll the
    // page behind the panel. When mouse tracking IS active, xterm.js already
    // converts wheel events to mouse sequences — leave it alone.
    if (!wheelBoundRef.current) {
      wheelBoundRef.current = true;
      containerRef.current.addEventListener("wheel", (e: WheelEvent) => {
        const t = termRef.current;
        if (!t || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
        if (t.buffer.active.type !== "alternate") return;
        if (t.modes.mouseTrackingMode !== "none") return;
        e.preventDefault();
        e.stopPropagation();
        const key = e.deltaY < 0 ? "\x1b[5~" : "\x1b[6~";
        wsRef.current.send(JSON.stringify({ type: "input", id: sessionIdRef.current, data: key }));
      }, { passive: false });
    }

    term.onResize(({ cols, rows }) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "resize", id: sessionIdRef.current, cols, rows }));
      }
    });

    term.onData((data: string) => {
      term.write(data);
      if (data === "\r") term.write("\n");
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", id: sessionIdRef.current, data }));
      }
    });

    termRef.current = term;
    fitRef.current = fit;

    const tryFit = (attempts = 0) => {
      const rect = containerRef.current!.getBoundingClientRect();
      if (rect.width >= 50 && rect.height >= 50) {
        try { safeFit(); } catch {}
      } else if (attempts < 40) {
        requestAnimationFrame(() => tryFit(attempts + 1));
      }
    };
    tryFit();

    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new ResizeObserver(() => {
      requestAnimationFrame(() => { try { safeFit(); } catch {} });
    });
    observerRef.current.observe(panelRef.current!);
  };

  // Park xterm when hidden, reattach when shown
  useEffect(() => {
    if (visible) {
      if (needsReattach.current) {
        needsReattach.current = false;
        requestAnimationFrame(() => {
          const cached = attach(sessionIdRef.current, containerRef.current!);
          if (cached) {
            termRef.current = cached.term;
            fitRef.current = cached.fit;
            safeFit();
            cached.term.focus();
          }
        });
      }
    } else {
      if (connected) {
        needsReattach.current = true;
        park(sessionIdRef.current);
        termRef.current = null;
        fitRef.current = null;
      }
    }
  }, [visible, connected]);

  useEffect(() => {
    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (wsRef.current) {
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (fitRef.current && containerRef.current) {
      try { safeFit(); } catch {}
    }
  }, [width, visible]);

  const handleResizeStart = useCallback(() => setDragging(true), []);
  const handleResizeEnd = useCallback(() => setDragging(false), []);

  const handleEndSession = () => {
    manualEndRef.current = true;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "kill", id: sessionIdRef.current }));
      wsRef.current.close();
      wsRef.current = null;
    }
    boundSidRef.current = null;
    if (termRef.current) {
      termRef.current.dispose();
      termRef.current = null;
      fitRef.current = null;
    }
    destroyCache(sessionIdRef.current);
    setConnected(false);
    connectingRef.current = false;
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, window.innerWidth - e.clientX)));
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  return (
    <>
      <div
        onMouseDown={handleResizeStart}
        onMouseUp={handleResizeEnd}
        className={`w-1.5 shrink-0 cursor-col-resize hover:bg-kumo-brand/50 transition-colors ${dragging ? "bg-kumo-brand/70" : "bg-transparent"}`}
        style={{ display: visible ? undefined : "none" }}
      />
      <div
        ref={panelRef}
        className="shrink-0 bg-[#0d0d0d] border-l border-kumo-line h-full relative"
        style={{ width, display: visible ? undefined : "none" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[#2a2a2a]">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-400 animate-pulse" : "bg-neutral-600"}`} />
            <span className="text-xs font-medium text-neutral-300">Terminal</span>
            {connected && <span className="text-[10px] text-green-400/70 font-mono">{agentName}</span>}
          </div>
          <div className="flex items-center gap-1">
            {connected ? (
              <button onClick={handleEndSession} title="End agent session" className="text-neutral-500 hover:text-red-400 transition-colors">
                <Square size={13} />
              </button>
            ) : (
              <button onClick={() => setRestartTick((t) => t + 1)} title="Start agent session" className="text-neutral-400 hover:text-green-400 transition-colors">
                <Play size={13} />
              </button>
            )}
            <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200 transition-colors ml-1">
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Terminal body */}
        <div style={{ position: "absolute", top: 40, left: 0, right: 0, bottom: 0 }}>
          <div ref={containerRef} style={{ position: "absolute", inset: 0, overflow: "hidden" }} />

          {!connected && (
            <div style={{ position: "absolute", inset: 0 }}
              className="flex items-center justify-center bg-[#0d0d0d] pointer-events-none z-10">
              <div className="text-neutral-500 text-xs text-center px-4">
                <span>Agent not running — press </span>
                <span className="text-green-400 font-medium">▶ Start</span>
                <span> to launch</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
