import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { X } from "@phosphor-icons/react";
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
  const sessionIdRef = useRef("agent-session");
  const needsReattach = useRef(false);
  const connectingRef = useRef(false);

  useEffect(() => {
    fetch("/api/terminal/port").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.port) setPort(d.port);
    }).catch(() => {});
    fetch("/api/config/project-root").then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.root) setProjectRoot(d.root);
    }).catch(() => {});
  }, []);

  // Fetch latest project data to get current defaultAgent (route loader may be stale)
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}`).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d?.defaultAgent && d.defaultAgent !== agentName) setAgentName(d.defaultAgent);
    }).catch(() => {});
  }, [projectId]);

  // Sync agent name from defaultAgent prop
  useEffect(() => { setAgentName(defaultAgent); }, [defaultAgent]);

  // Auto-connect when panel opens
  useEffect(() => {
    if (!visible || !port || !projectRoot) return;
    if (!agentName) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (connectingRef.current) return;
    connectingRef.current = true;

    const rootParam = projectRoot ? `?root=${encodeURIComponent(projectRoot)}` : "";
    const ws = new WebSocket(`ws://localhost:${port}/wss${rootParam}`);
    wsRef.current = ws;

    const cmd = buildAgentCommand(agentName as AgentCli, { mode: "new" });

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "spawn", id: sessionIdRef.current, command: cmd, cwd: projectRoot || "/tmp" }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.id !== sessionIdRef.current) return;
        if (msg.type === "ready") {
          setConnected(true);
          createXterm();
        } else if (msg.type === "output") {
          if (!termRef.current) createXterm();
          if (termRef.current) termRef.current.write(msg.data);
        } else if (msg.type === "exit") {
          if (!termRef.current) createXterm();
          if (termRef.current) termRef.current.writeln(`\x1b[33m\nExited (code ${msg.code ?? "?"})\x1b[0m`);
          setConnected(false);
        }
      } catch {}
    };

    ws.onclose = () => { setConnected(false); wsRef.current = null; connectingRef.current = false; };
    ws.onerror = () => { setConnected(false); wsRef.current = null; connectingRef.current = false; };
  }, [visible, port, projectRoot, agentName]);

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
    register(sessionIdRef.current, term, fit, containerRef.current);

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
        try { fit.fit(); } catch {}
      } else if (attempts < 40) {
        requestAnimationFrame(() => tryFit(attempts + 1));
      }
    };
    tryFit();

    if (observerRef.current) observerRef.current.disconnect();
    observerRef.current = new ResizeObserver(() => {
      requestAnimationFrame(() => { try { fit.fit(); } catch {} });
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
            cached.fit.fit();
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
      if (wsRef.current) {
        wsRef.current.send(JSON.stringify({ type: "kill", id: sessionIdRef.current }));
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (termRef.current) termRef.current.dispose();
      destroyCache(sessionIdRef.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (fitRef.current && containerRef.current) {
      try { fitRef.current.fit(); } catch {}
    }
  }, [width, visible]);

  const handleResizeStart = useCallback(() => setDragging(true), []);
  const handleResizeEnd = useCallback(() => setDragging(false), []);

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
                <span>Connecting to </span>
                <span className="text-green-400 font-medium">{agentName}</span>
                <span>...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
