import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";

const TERMINAL_PORT = 4323;

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

/** System32 helper (avoid PATH-dependent spawnSync — Bun 1.3.0 segfaults
 *  after PATH resolution of unknown executables inside the vite config). */
function system32(name: string): string {
  return path.join(process.env.SystemRoot || "C:\\Windows", "System32", name);
}

/** Find the PID listening on a port (Windows-safe: netstat works everywhere,
 *  `pkill` does not exist on Windows). Matches ANY local address — Bun.serve
 *  binds 0.0.0.0/[::], not just 127.0.0.1. */
function pidByPort(port: number): number | null {
  try {
    const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
    const out = spawnSync(system32("netstat.exe"), ["-ano"], { encoding: "utf-8", windowsHide: true }).stdout || "";
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(/TCP\s+(\[[^\]]*\]|[^:]+):(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
      if (m && Number(m[2]) === port) return Number(m[3]);
    }
  } catch {}
  return null;
}

function killProcess(pid: number) {
  try {
    if (process.platform === "win32") {
      const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
      spawnSync(system32("taskkill.exe"), ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {}
}

/** First free port starting at `start` (capped to avoid scanning forever). */
async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 20; port++) {
    if (!(await isPortInUse(port))) return port;
  }
  return start;
}

/** Resolve a node executable WITHOUT spawning (Bun's spawnSync of PATH
 *  executables inside the vite config misbehaves and can segfault Bun). */
function resolveNodeExe(): string {
  const candidates = [
    process.env.ProgramFiles ? path.join(process.env.ProgramFiles, "nodejs", "node.exe") : "",
    process.env["ProgramFiles(x86)"] ? path.join(process.env["ProgramFiles(x86)"], "nodejs", "node.exe") : "",
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Programs", "nodejs", "node.exe") : "",
  ].filter(Boolean);
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  // Last resort: rely on spawn's own PATH lookup (works even if spawnSync doesn't).
  return "node";
}

function terminalServerPlugin() {
  let proc: ChildProcess | null = null;
  return {
    name: "terminal-server",
    async configureServer() {
      const token = randomUUID();
      // Self-heal the HTTP port: if 4321 is held by a STALE dev server of this
      // app (typically an elevated session invisible from a normal shell),
      // kill it so vite can bind — two dev servers can't share 4321 anyway.
      // Killing its tree also frees the terminal port. No-op when we lack
      // rights (non-elevated) — vite will then report "Port 4321 is in use".
      const httpOwner = (await isPortInUse(4321)) ? pidByPort(4321) : null;
      if (httpOwner) {
        console.log(`[terminal-plugin] port 4321 held by stale dev server (pid ${httpOwner}) — killing it`);
        killProcess(httpOwner);
        await new Promise((r) => setTimeout(r, 600));
      }
      let port = TERMINAL_PORT;
      if (await isPortInUse(port)) {
        // The port is held by something — normally a stale orphan from a
        // previous vite that was SIGKILLed (pkill never ran on Windows).
        let ownerPid: number | null = null;
        try {
          const res = await fetch(`http://127.0.0.1:${port}/__health`, { signal: AbortSignal.timeout(1500) });
          const data = await res.json();
          ownerPid = data?.pid ?? null;
        } catch {}
        ownerPid = ownerPid ?? pidByPort(port);
        if (ownerPid) {
          console.log(`[terminal-plugin] stale terminal server (pid ${ownerPid}) — killing it`);
          killProcess(ownerPid);
          await new Promise((r) => setTimeout(r, 600));
        }
        if (await isPortInUse(port)) {
          // Owner survived (hung/un-killable orphan, e.g. phantom socket).
          // Fall back to the next free port so dev keeps working; the frontend
          // discovers it via /api/terminal/port, which reads TERMINAL_PORT.
          port = await findFreePort(TERMINAL_PORT + 1);
          console.log(`[terminal-plugin] port ${TERMINAL_PORT} stuck — falling back to ${port}`);
        }
      }
      process.env.TERMINAL_PORT = String(port);
      const script = path.resolve(__dirname, "src/server/terminal/terminal-server.ts");
      const isBun = typeof Bun !== "undefined";
      const nodeMajor = Number(process.versions.node?.split(".")[0] || 0);
      // On Windows the terminal server MUST run under Node: node-pty's ConPTY
      // input socket is created via `new net.Socket({ fd })`, which Bun does
      // not support — output renders but every write throws ERR_SOCKET_CLOSED
      // (keyboard input dead, local echo only). Node gives full ConPTY
      // (TUI + input + resize). Bun stays as fallback when node is missing.
      const wantNode = isBun && process.platform === "win32";
      const execPath = wantNode ? resolveNodeExe() : process.execPath;
      const args = (wantNode || !isBun)
        ? [...(nodeMajor < 23 ? ["--experimental-strip-types"] : []), script]
        : ["run", script];
      proc = spawn(execPath, args, {
        stdio: "inherit",
        env: { ...process.env, SA_TERM_TOKEN: token },
      });
      let label = wantNode ? "node" : "bun";
      proc.on("error", (err: any) => {
        // node missing / couldn't spawn — fall back to Bun (input broken, but
        // the server still runs with the cmd.exe pipe fallback).
        if (wantNode) {
          console.warn(`[terminal-plugin] node spawn failed (${err?.code || err?.message}) — falling back to bun (terminal input will be broken)`);
          label = "bun";
          try { proc?.kill(); } catch {}
          proc = spawn(process.execPath, ["run", script], {
            stdio: "inherit",
            env: { ...process.env, SA_TERM_TOKEN: token },
          });
          proc.on("error", () => {});
        }
      });
      console.log(`[terminal-plugin] spawned terminal server on port ${port} (${label})`);
      // Ensure the child dies with the vite process even on SIGKILL paths
      const killChild = () => { try { proc?.kill(); } catch {} };
      process.once("exit", killChild);
      process.once("SIGINT", killChild);
      process.once("SIGTERM", killChild);
    },
    closeBundle() {
      proc?.kill();
    },
  };
}

export default defineConfig({
  server: {
    port: 4321,
    // Don't die when 4321 is stuck (kernel-stale socket from a killed/hung
    // process — invisible to taskkill, only cleared by reboot): auto-increment
    // to 4322/4323 so dev still starts. Everything (API, terminal, SSR) is
    // relative, so any port works.
    strictPort: false,
  },
  optimizeDeps: {
    include: ["swagger-ui-react"],
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // The remaining >500kB chunks are all ON-DEMAND async vendors that only
    // load when their feature opens: swagger (~1.3MB, Swagger view), codemirror
    // (~1.6MB, ERD/FSD editors), xterm (~600kB, terminal panel — lazy since
    // the layout no longer imports it). Mermaid is NOT grouped on purpose:
    // its 11.x entry lazy-loads each diagram type internally, keeping the
    // core chunk ~650kB + small per-diagram chunks on demand.
    // The initial entry chunk is ~520kB. Raise the limit so these legit
    // lazy chunks don't warn.
    chunkSizeWarningLimit: 3500,
  },
  // TanStack Start builds "client" + "ssr" environments (Vite 8). Group heavy
  // vendors into stable named chunks for the CLIENT build only — the SSR
  // bundle stays single-file.
  environments: {
    client: {
      build: {
        rolldownOptions: {
          output: {
            codeSplitting: {
              groups: [
                {
                  name: "vendor-markdown",
                  test: /(?:node_modules|\.pnpm)[\\/](?:react-markdown|remark-gfm|remark-parse|remark-rehype|remark-\w+|rehype-\w+|unified|micromark|hast-|mdast-|vfile|bail|trough|extend|devlop|character-entities|decode-named-character-reference|property-information|space-separated-tokens|comma-separated-tokens|ccount|trim-lines|is-plain-obj)/,
                  priority: 30,
                },
                // NOTE: no vendor-mermaid group on purpose — mermaid 11 ships a
                // core entry that lazy-imports each diagram type internally
                // (flowchart/sequence/er/...). Grouping them would collapse
                // that built-in splitting into one 3.4MB chunk; natural
                // splitting keeps core + per-diagram chunks on demand.
                {
                  name: "vendor-swagger",
                  test: /(?:node_modules|\.pnpm)[\\/](?:swagger-ui-react|swagger-client|js-yaml|react-immutable-proptypes|xml)/,
                  priority: 30,
                },
                {
                  name: "vendor-xyflow",
                  test: /(?:node_modules|\.pnpm)[\\/]@xyflow/,
                  priority: 30,
                },
                {
                  name: "vendor-codemirror",
                  test: /(?:node_modules|\.pnpm)[\\/](?:@codemirror|@uiw|@lezer|@replit)/,
                  priority: 30,
                },
                {
                  name: "vendor-xterm",
                  test: /(?:node_modules|\.pnpm)[\\/]@xterm/,
                  priority: 30,
                },
                {
                  name: "vendor-mdxeditor",
                  test: /(?:node_modules|\.pnpm)[\\/](?:@mdxeditor|mdast-util-to-hast)/,
                  priority: 30,
                },
              ],
            },
          },
        },
      },
    },
  },
  plugins: [
    terminalServerPlugin(),
    tailwindcss(),
    tanstackStart({ srcDirectory: "src" }),
    react(),
  ],
  ssr: {
    external: [
      "bun:sqlite",
      "drizzle-orm/bun-sqlite",
      "drizzle-orm/bun-sqlite/migrator",
      "drizzle-orm/better-sqlite3",
      "drizzle-orm/better-sqlite3/migrator",
      "better-sqlite3",
      "node-pty",
      "ws",
    ],
  },
});
