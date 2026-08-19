import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { createRequire } from "node:module";
import type { IPty } from "node-pty";

interface AgentSession {
  id: string;
  proc?: ChildProcess;
  pty?: IPty;
  cwd: string;
  cols: number;
  rows: number;
  sizeFile: string;
  buffer: string;
  /** Which PTY backend spawned this session (drives frontend local-echo). */
  backend: "conpty" | "cmdpipe" | "python" | "node-pty";
}

// 16 KB is plenty for terminal handshakes and TUI replay while preventing
// excessive string memory accumulation under continuous full-screen TUI repaints.
const MAX_REPLAY = 16 * 1024;

const sessions = new Map<string, AgentSession>();

const pythonBin = process.platform === "win32" ? "python" : "python3";

// node-pty hangs under Bun's runtime on POSIX (fork never emits — spawn
// "succeeds" but no output ever arrives, so TUIs render empty). On Windows
// under Bun its ConPTY OUTPUT works, but the INPUT socket is created via
// `new net.Socket({ fd })` which Bun doesn't support — every write throws
// ERR_SOCKET_CLOSED (dead keyboard, local echo only). So node-pty/ConPTY is
// ONLY usable under Node.js. Bun always uses the Python PTY bridge (POSIX)
// or the cmd.exe pipe (win32) below.
const nodePtySupported = typeof Bun === "undefined";

let nodePty: typeof import("node-pty") | null = null;
if (nodePtySupported) {
  try {
    // createRequire-based require: node-pty is a CJS package and ESM named
    // interop (cjs-module-lexer) can miss `exports.spawn`; require() never
    // does. Resolution walks up from this file's directory, so the desktop
    // resource copy (web-dist/server/server/node_modules/node-pty) is found
    // by the spawned Node.js terminal server.
    const nodeRequire = createRequire(import.meta.url);
    const loaded = nodeRequire("node-pty") as typeof import("node-pty") | null;
    if (loaded && typeof loaded.spawn === "function") nodePty = loaded;
    else nodePty = null;
  } catch (err) {
    // Logging this turns a "mysteriously dead TUI" into a diagnosable one:
    // a load failure used to silently degrade every Windows session to the
    // cmd.exe pipe (no input/resize/scroll for TUIs).
    console.error("[terminal] node-pty failed to load — Windows TUIs will fall back to the cmd.exe pipe (input/resize/scroll limited):", err);
    nodePty = null;
  }
}

function parseCommand(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuote = false;
  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === " " && !inQuote) {
      if (current) { args.push(current); current = ""; }
    } else {
      current += ch;
    }
  }
  if (current) args.push(current);
  return args;
}

function runAgent(id: string, command: string, cwd: string, cols = 120, rows = 40) {
  const existing = sessions.get(id);
  if (existing) killSession(id);
  const cmdParts = parseCommand(command);
  if (cmdParts.length === 0) return null;

  const sizeFile = path.join(os.tmpdir(), `pty_size_${id}_${Date.now()}.txt`);
  try { fs.writeFileSync(sizeFile, `${rows} ${cols}`); } catch {}

  const session: AgentSession = { id, cwd, cols, rows, sizeFile, buffer: "", backend: "python" };
  sessions.set(id, session);
  const startedAt = Date.now();

  const broadcast = (data: string) => {
    session.buffer += data;
    if (session.buffer.length > MAX_REPLAY) {
      session.buffer = session.buffer.slice(-MAX_REPLAY);
    }
    for (const ws of activeSockets) {
      try { ws.send(JSON.stringify({ type: "output", id, data })); } catch {}
    }
  };

  const handleExit = (code: number | null) => {
    for (const ws of activeSockets) {
      try { ws.send(JSON.stringify({ type: "exit", id, code })); } catch {}
    }
    if (session.sizeFile) {
      try { fs.unlinkSync(session.sizeFile); } catch {}
    }
    sessions.delete(id);
  };

  // Backend 1: node-pty (native; Node.js + Windows/ConPTY under Node)
  if (nodePty) {
    try {
      // Windows: opencode/claude are .cmd shims that CreateProcess can't run
      // directly, so wrap the whole command in cmd.exe — the ConPTY still
      // provides a real resizable TTY (console resize events propagate to
      // child processes, so TUIs track the panel size).
      const isWin = process.platform === "win32";
      const pty = isWin
        ? nodePty.spawn(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
            name: "xterm-256color",
            cols,
            rows,
            cwd,
            env: {
              ...process.env,
              TERM: "xterm-256color",
              COLUMNS: String(cols),
              LINES: String(rows),
            },
          })
        : nodePty.spawn(cmdParts[0], cmdParts.slice(1), {
            name: "xterm-256color",
            cols,
            rows,
            cwd,
            env: {
              ...process.env,
              TERM: "xterm-256color",
              COLUMNS: String(cols),
              LINES: String(rows),
            },
          });
      session.pty = pty;
      session.backend = isWin ? "conpty" : "node-pty";
      // node-pty's Windows ConPTY pipes emit 'error' on writes after the
      // process dies: outSocket rethrows unless the pty has an 'error'
      // listener, and inSocket has NO listener at all (unhandled 'error'
      // noise). Swallow both — onExit drives the cleanup.
      try {
        (pty as any).on?.("error", () => {});
        const agent = (pty as any)._agent;
        agent?.inSocket?.on?.("error", () => {});
        agent?.outSocket?.on?.("error", () => {});
      } catch {}
      console.log(`[terminal] session ${id} backend=${isWin ? "conpty" : "node-pty"} (${cols}x${rows})`);
      pty.onData((data) => broadcast(data));
      pty.onExit(({ exitCode }) => {
        // Drop the pty reference first so no late write can hit the dead
        // ConPTY socket (the error the user saw), then clean up.
        session.pty = undefined;
        if (exitCode !== 0 && Date.now() - startedAt < 15000 && session.buffer.length > 0) {
          console.error(`[terminal] session ${id} exited early (code ${exitCode}) — output tail:\n${session.buffer.slice(-1500)}`);
        }
        handleExit(exitCode);
      });
      return session;
    } catch (err) {
      console.error("[terminal] node-pty spawn failed, falling back:", err);
      nodePty = null;
      session.pty = undefined;
    }
  }

  // Backend 2: Windows cmd.exe pipe (last resort when node-pty is
  // unavailable on Windows). No PTY — agent TUIs won't track panel size, but
  // basic command I/O still works.
  if (process.platform === "win32") {
    const comspec = process.env.ComSpec || "cmd.exe";
    try {
      const proc = spawn(comspec, ["/d", "/s", "/c", command], {
        cwd,
        env: {
          ...process.env,
          TERM: "xterm-256color",
          COLUMNS: String(cols),
          LINES: String(rows),
        },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      });
      session.proc = proc;
      session.backend = "cmdpipe";
      console.log(`[terminal] session ${id} backend=cmdpipe (${cols}x${rows})`);
      proc.stdout?.on("data", (chunk: Buffer) => broadcast(chunk.toString("utf-8")));
      proc.stderr?.on("data", (chunk: Buffer) => broadcast(chunk.toString("utf-8")));
      proc.on("close", (code: number | null) => handleExit(code));
      return session;
    } catch (err) {
      console.error("[terminal] cmd.exe spawn failed:", err);
    }
  }

  // Backend 3: Python PTY bridge (POSIX-only; primary path under Bun)
  const pythonCode = `
import pty, os, sys, struct, fcntl, termios, signal, select, json

cols = int(sys.argv[1])
rows = int(sys.argv[2])
cmd = json.loads(sys.argv[3])
size_file = sys.argv[4]

pid, fd = pty.fork()
if pid == 0:
    os.environ["TERM"] = "xterm-256color"
    os.environ["COLUMNS"] = str(cols)
    os.environ["LINES"] = str(rows)
    os.execvp(cmd[0], cmd)

try:
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, 0, 0))
except Exception:
    pass

def handle_winch(signum, frame):
    try:
        if os.path.exists(size_file):
            with open(size_file, "r") as f:
                parts = f.read().strip().split()
                r, c = int(parts[0]), int(parts[1])
                fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack("HHHH", r, c, 0, 0))
                os.kill(pid, signal.SIGWINCH)
    except Exception:
        pass

signal.signal(signal.SIGWINCH, handle_winch)

while True:
    try:
        rfds, _, _ = select.select([fd, 0], [], [])
        if fd in rfds:
            data = os.read(fd, 4096)
            if not data:
                break
            sys.stdout.buffer.write(data)
            sys.stdout.buffer.flush()
        if 0 in rfds:
            data = os.read(0, 4096)
            if not data:
                break
            os.write(fd, data)
    except Exception:
        break
`;

  const proc = spawn(pythonBin, ["-c", pythonCode, String(cols), String(rows), JSON.stringify(cmdParts), sizeFile], {
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      HOME: process.env.HOME || os.tmpdir(),
      COLUMNS: String(cols),
      LINES: String(rows),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  session.proc = proc;
  console.log(`[terminal] session ${id} backend=python (${cols}x${rows})`);

  proc.stdout?.on("data", (chunk: Buffer) => broadcast(chunk.toString("utf-8")));

  proc.stderr?.on("data", (chunk: Buffer) => broadcast(chunk.toString("utf-8")));

  proc.on("close", (code: number | null) => handleExit(code));

  return session;
}

function writeStdin(id: string, data: string) {
  const session = sessions.get(id);
  if (!session) return;
  try {
    if (session.pty) {
      session.pty.write(data);
    } else if (session.proc?.stdin?.writable) {
      session.proc.stdin.write(data);
    }
  } catch {
    // PTY died mid-write (ERR_SOCKET_CLOSED) — the onExit handler cleans up.
  }
}

function resizeSession(id: string, cols: number, rows: number) {
  const session = sessions.get(id);
  if (!session) return;
  session.cols = cols;
  session.rows = rows;
  try {
    if (session.pty) {
      session.pty.resize(cols, rows);
    } else {
      if (session.sizeFile) {
        try { fs.writeFileSync(session.sizeFile, `${rows} ${cols}`); } catch {}
      }
      try { session.proc?.kill("SIGWINCH"); } catch {}
    }
  } catch {}
}

function killSession(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  const pid = session.pty?.pid || session.proc?.pid;
  if (pid && process.platform === "win32") {
    try {
      // /T = terminate process tree (including child opencode.exe/node.exe), /F = force
      spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {}
  }
  try {
    if (session.pty) {
      session.pty.kill();
    } else {
      try { session.proc?.kill("SIGTERM"); } catch {}
    }
  } catch {}
  if (session.sizeFile) {
    try { fs.unlinkSync(session.sizeFile); } catch {}
  }
  sessions.delete(id);
  try {
    (globalThis as any).Bun?.gc?.(true);
  } catch {}
}

// Kill every live session when this process exits (crash, SIGTERM, quit).
// Without this, spawned agents (opencode serve etc.) become orphans (PPID=1)
// and keep running forever — they accumulate and eat GBs of memory.
function killAllSessions() {
  for (const id of Array.from(sessions.keys())) killSession(id);
}

// Also exit the process itself on signals: on Windows `pkill` doesn't exist,
// so an orphaned terminal server would otherwise hold port 4323 forever.
for (const sig of ["exit", "SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig as any, () => {
    killAllSessions();
    if (sig !== "exit") process.exit(0);
  });
}

// Desktop: this module runs as a detached `node terminal-server.node.js` child
// on Windows. If the Tauri shell (grandparent) dies, exit ourselves — never
// leak an orphaned process holding the terminal port. (On POSIX the module
// runs in-process inside the sidecar, whose own server.ts watchdog covers it;
// this check is a no-op there because PPID stays alive.)
if (process.env.SA_DESKTOP === "1" && typeof process.ppid === "number") {
  const parentPid = process.ppid;
  const watchdog = setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      killAllSessions();
      process.exit(0);
    }
  }, 3000);
  watchdog.unref?.();
}

const activeSockets = new Set<any>();

const port = parseInt(process.env.TERMINAL_PORT || "4323", 10);

function handleMessage(ws: any, msg: string | Buffer) {
  try {
    const parsed = JSON.parse(typeof msg === "string" ? msg : msg.toString());
    if (parsed.type === "spawn") {
      const s = runAgent(parsed.id, parsed.command, parsed.cwd || (process.env.SA_ROOT ? path.resolve(process.env.SA_ROOT) : path.resolve(process.cwd(), "..")), parsed.cols || 120, parsed.rows || 40);
      if (s) {
        setTimeout(() => {
          try {
            ws.send(JSON.stringify({ type: "ready", id: parsed.id, cwd: s.cwd, backend: s.backend }));
          } catch {}
        }, 300);
      }
    } else if (parsed.type === "status") {
      const s = sessions.get(parsed.id);
      if (s) {
        if (s.buffer) {
          ws.send(JSON.stringify({ type: "replay", id: parsed.id, data: s.buffer }));
        }
        ws.send(JSON.stringify({ type: "status", id: parsed.id, exists: true, backend: s.backend }));
      } else {
        ws.send(JSON.stringify({ type: "status", id: parsed.id, exists: false }));
      }
    } else if (parsed.type === "input") {
      writeStdin(parsed.id, parsed.data);
    } else if (parsed.type === "resize") {
      resizeSession(parsed.id, parsed.cols || 120, parsed.rows || 40);
    } else if (parsed.type === "kill") {
      killSession(parsed.id);
    }
  } catch {}
}

const isBun = typeof Bun !== "undefined";

function handleEaddrinuse() {
  console.log(`[terminal] Port ${port} already in use — another terminal server is running`);
  process.exit(0);
}

if (isBun) {
  // Primary: Bun.serve (native WebSocket, used under Bun runtime)
  try {
    Bun.serve({
      port,
      fetch(req, server) {
        const url = new URL(req.url);
        // Health/token endpoint so a new dev session can detect a stale
        // orphaned terminal server (old code/token) and kill it.
        if (url.pathname === "/__health") {
          return new Response(JSON.stringify({ token: process.env.SA_TERM_TOKEN || null, pid: process.pid }), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (server.upgrade(req, { data: { url: req.url } } as any)) return;
        return new Response("terminal", { headers: { "Access-Control-Allow-Origin": "*" } });
      },
      websocket: {
        open(ws: any) {
          activeSockets.add(ws);
        },
        message(ws: any, msg: string | Buffer) {
          handleMessage(ws, msg);
        },
        close(ws: any) {
          activeSockets.delete(ws);
        },
      },
    });
    console.log(`[terminal] Ready on ws://localhost:${port} (bun.serve)`);
  } catch (e: any) {
    // Port already in use — another terminal server is running. Exit quietly
    // instead of crashing with an EADDRINUSE stack trace.
    if (e?.code === "EADDRINUSE") {
      handleEaddrinuse();
    }
    throw e;
  }
} else {
  // Fallback: `ws` package over node:http (Node.js runtime, all platforms)
  const { createServer } = await import("node:http");
  const { WebSocketServer } = await import("ws");
  const httpServer = createServer((req, res) => {
    if (req.url?.startsWith("/__health")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ token: process.env.SA_TERM_TOKEN || null, pid: process.pid }));
      return;
    }
    res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
    res.end("terminal");
  });
  const wss = new WebSocketServer({ server: httpServer });
  wss.on("connection", (ws: any, req) => {
    ws.userData = { url: req.url };
    activeSockets.add(ws);
    ws.on("message", (data: Buffer) => handleMessage(ws, data));
    ws.on("close", () => activeSockets.delete(ws));
  });
  httpServer.on("error", (e: any) => {
    if (e?.code === "EADDRINUSE") handleEaddrinuse();
    throw e;
  });
  httpServer.listen(port, () => console.log(`[terminal] Ready on ws://localhost:${port} (ws)`));
}
