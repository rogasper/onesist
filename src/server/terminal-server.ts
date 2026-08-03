import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

interface AgentSession {
  id: string;
  proc: ChildProcess;
  cwd: string;
  cols: number;
  rows: number;
  sizeFile: string;
  buffer: string;
}

const MAX_REPLAY = 64 * 1024;

const sessions = new Map<string, AgentSession>();

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

  const sizeFile = `/tmp/pty_size_${id}_${Date.now()}.txt`;
  try { fs.writeFileSync(sizeFile, `${rows} ${cols}`); } catch {}

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

  const proc = spawn("python3", ["-c", pythonCode, String(cols), String(rows), JSON.stringify(cmdParts), sizeFile], {
    cwd,
    env: {
      ...process.env,
      TERM: "xterm-256color",
      HOME: process.env.HOME || "/tmp",
      COLUMNS: String(cols),
      LINES: String(rows),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const session: AgentSession = { id, proc, cwd, cols, rows, sizeFile, buffer: "" };
  sessions.set(id, session);

  const broadcast = (data: string) => {
    session.buffer += data;
    if (session.buffer.length > MAX_REPLAY) {
      session.buffer = session.buffer.slice(-MAX_REPLAY);
    }
    for (const ws of activeSockets) {
      try { ws.send(JSON.stringify({ type: "output", id, data })); } catch {}
    }
  };

  proc.stdout?.on("data", (chunk: Buffer) => broadcast(chunk.toString("utf-8")));

  proc.stderr?.on("data", (chunk: Buffer) => broadcast(chunk.toString("utf-8")));

  proc.on("close", (code: number | null) => {
    try {
      for (const ws of activeSockets) {
        ws.send(JSON.stringify({ type: "exit", id, code }));
      }
    } catch {}
    if (sizeFile) {
      try { fs.unlinkSync(sizeFile); } catch {}
    }
    sessions.delete(id);
  });

  return session;
}

function writeStdin(id: string, data: string) {
  const session = sessions.get(id);
  if (!session || !session.proc.stdin?.writable) return;
  try { session.proc.stdin.write(data); } catch {}
}

function resizeSession(id: string, cols: number, rows: number) {
  const session = sessions.get(id);
  if (!session) return;
  session.cols = cols;
  session.rows = rows;
  if (session.sizeFile) {
    try { fs.writeFileSync(session.sizeFile, `${rows} ${cols}`); } catch {}
  }
  try { session.proc.kill("SIGWINCH"); } catch {}
}

function killSession(id: string) {
  const session = sessions.get(id);
  if (!session) return;
  try { session.proc.kill("SIGTERM"); } catch {}
  if (session.sizeFile) {
    try { fs.unlinkSync(session.sizeFile); } catch {}
  }
  sessions.delete(id);
}

const activeSockets = new Set<any>();

const port = parseInt(process.env.TERMINAL_PORT || "4323", 10);

try {
  Bun.serve({
    port,
    fetch(req, server) {
      if (server.upgrade(req, { data: { url: req.url } } as any)) return;
      return new Response("terminal", { headers: { "Access-Control-Allow-Origin": "*" } });
    },
    websocket: {
      open(ws: any) {
        activeSockets.add(ws);
      },
      message(ws: any, msg: string | Buffer) {
        try {
          const parsed = JSON.parse(msg as string);
          if (parsed.type === "spawn") {
            const s = runAgent(parsed.id, parsed.command, parsed.cwd || path.resolve(process.cwd(), ".."));
            if (s) {
              setTimeout(() => {
                try {
                  ws.send(JSON.stringify({ type: "ready", id: parsed.id, cwd: s.cwd }));
                } catch {}
              }, 300);
            }
          } else if (parsed.type === "status") {
            const s = sessions.get(parsed.id);
            if (s) {
              if (s.buffer) {
                ws.send(JSON.stringify({ type: "replay", id: parsed.id, data: s.buffer }));
              }
              ws.send(JSON.stringify({ type: "status", id: parsed.id, exists: true }));
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
      },
      close(ws: any) {
        activeSockets.delete(ws);
      },
    },
  });
  console.log(`[terminal] Ready on ws://localhost:${port}`);
} catch (e: any) {
  // Port already in use — another terminal server is running. Exit quietly
  // instead of crashing with an EADDRINUSE stack trace.
  if (e?.code === "EADDRINUSE") {
    console.log(`[terminal] Port ${port} already in use — another terminal server is running`);
    process.exit(0);
  }
  throw e;
}
