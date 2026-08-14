import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { resolveNodeExe as sharedResolveNodeExe } from "./src/lib/resolve-node";

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

interface PsRow {
  pid: number;
  ppid: number;
  command: string;
}

/** Snapshot of running processes (pid/ppid/command). */
function psList(): PsRow[] {
  const { spawnSync } = require("node:child_process") as typeof import("node:child_process");
  if (process.platform === "win32") {
    try {
      const out = spawnSync("wmic", ["process", "get", "ProcessId,ParentProcessId,CommandLine", "/format:csv"], { encoding: "utf-8", windowsHide: true }).stdout || "";
      const rows: PsRow[] = [];
      for (const line of out.split(/\r?\n/)) {
        const m = line.trim().match(/^"[^"]*",(\d+),(\d+),"(.*)"$/);
        if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] });
      }
      return rows;
    } catch { return []; }
  }
  try {
    const out = spawnSync("ps", ["-eo", "pid=,ppid=,command="], { encoding: "utf-8", windowsHide: true }).stdout || "";
    const rows: PsRow[] = [];
    for (const line of out.split("\n")) {
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] });
    }
    return rows;
  } catch { return []; }
}

/** Find stale dev-server trees of THIS project (vite/terminal-server spawned
 *  from this directory) so a fresh `bun run dev` can kill them ALL — not just
 *  the current port holder. Kills each tree fully (parent wrappers + children)
 *  so orphans (PPID=1) stop accumulating ~120MB each. Excludes our own tree. */
function findStaleInstancePids(): number[] {
  const rows = psList();
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const self = process.pid;

  // Build children map up front (used for both self-tree exclusion and the
  // descendant collection of stale roots).
  const children = new Map<number, number[]>();
  for (const r of rows) {
    if (!children.has(r.ppid)) children.set(r.ppid, []);
    children.get(r.ppid)!.push(r.pid);
  }

  // Exclude our ENTIRE tree (self + ancestors + descendants) — never touch the
  // terminal-server / vite children we're about to spawn or their parents.
  const selfTree = new Set<number>([self]);
  let anc = byPid.get(self);
  for (let i = 0; i < 12 && anc; i++) {
    if (anc.ppid > 1) selfTree.add(anc.ppid);
    anc = byPid.get(anc.ppid);
  }
  const q = [self];
  while (q.length) {
    const p = q.pop()!;
    for (const c of children.get(p) ?? []) {
      if (!selfTree.has(c)) { selfTree.add(c); q.push(c); }
    }
  }

  const viteMarker = path.join(__dirname, "node_modules", ".bin", "vite");
  const termMarker = path.join(__dirname, "src", "server", "terminal", "terminal-server.ts");
  // NARROW match: only this project's unique vite/terminal paths — a bare
  // `bun run dev`/cwd match could kill ANOTHER project's dev server.
  const isOurs = (c: string) => c.includes(viteMarker) || c.includes(termMarker);
  const isWrapper = (c: string) => /bun run dev/.test(c) || /bun run --bun vite/.test(c) || /bun run /.test(c);

  // Processes that belong to this project — but NOT our own tree.
  const matched = rows.filter((r) => !selfTree.has(r.pid) && isOurs(r.command));
  if (matched.length === 0) return [];

  // Walk each matched process up through bun wrappers to the topmost tree root
  // (so we kill the whole tree, not a lone child). The walk can only pass
  // through bun wrappers, and it starts FROM our unique markers — so an
  // unrelated project's `bun run dev` is never touched.
  const roots = new Set<number>();
  for (const r of matched) {
    let node: PsRow | undefined = r;
    for (let i = 0; i < 16 && node; i++) {
      const parent = byPid.get(node.ppid);
      if (parent && isWrapper(parent.command) && !selfTree.has(parent.pid)) {
        node = parent;
      } else break;
    }
    roots.add(node!.pid);
  }

  // Collect every descendant of each root.
  const toKill = new Set<number>(roots);
  const queue = [...roots];
  while (queue.length) {
    const p = queue.pop()!;
    for (const c of children.get(p) ?? []) {
      if (!toKill.has(c) && !selfTree.has(c)) {
        toKill.add(c);
        queue.push(c);
      }
    }
  }
  return [...toKill];
}

/** First free port starting at `start` (capped to avoid scanning forever). */
async function findFreePort(start: number): Promise<number> {
  for (let port = start; port < start + 20; port++) {
    if (!(await isPortInUse(port))) return port;
  }
  return start;
}

/** Resolve a node executable WITHOUT spawning (Bun's spawnSync of PATH
 *  executables inside the vite config misbehaves and can segfault Bun).
 *  Shared with the packaged server — nvm-windows layouts included. */
function resolveNodeExe(): string {
  return sharedResolveNodeExe();
}

function terminalServerPlugin() {
  let proc: ChildProcess | null = null;
  let shuttingDown = false;
  let respawnCount = 0;
  let lastRespawnTime = 0;
  const token = randomUUID();

  const spawnTerminalServer = (port: number) => {
    if (shuttingDown) return;
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
    const label = wantNode ? "node" : "bun";
    const child = proc;
    console.log(`[terminal-plugin] spawned terminal server on port ${port} (${label})`);
    child.on("error", (err: any) => {
      // node missing / couldn't spawn — fall back to Bun (input broken, but
      // the server still runs with the cmd.exe pipe fallback).
      if (wantNode) {
        console.warn(`[terminal-plugin] node spawn failed (${err?.code || err?.message}) — falling back to bun (terminal input will be broken)`);
        try { child.kill(); } catch {}
        if (proc === child) {
          proc = spawn(process.execPath, ["run", script], {
            stdio: "inherit",
            env: { ...process.env, SA_TERM_TOKEN: token },
          });
          proc.on("error", () => {});
        }
      }
    });
    child.on("exit", (code) => {
      if (proc === child) proc = null;
      if (shuttingDown) return;
      // Respawn when the terminal server dies (e.g. user restarts it from the
      // InstanceWatch widget) — but rate-limit so a crash-looping server
      // doesn't spin forever: max 3 respawns per 30s.
      const now = Date.now();
      if (now - lastRespawnTime > 30000) respawnCount = 0;
      lastRespawnTime = now;
      respawnCount++;
      if (respawnCount > 3) {
        console.warn(`[terminal-plugin] terminal server exited ${respawnCount}× within 30s — giving up respawning`);
        return;
      }
      console.log(`[terminal-plugin] terminal server exited (code ${code}) — respawning`);
      spawnTerminalServer(port);
    });
  };

  return {
    name: "terminal-server",
    async configureServer() {
      // Kill EVERY stale instance of this project (orphaned vite/terminal
      // trees from earlier `bun run dev` runs — port holders AND port-less
      // zombies that otherwise accumulate ~120MB each). Self is excluded.
      try {
        const stale = findStaleInstancePids();
        if (stale.length > 0) {
          console.log(`[terminal-plugin] killing ${stale.length} stale dev instance(s): ${stale.join(", ")}`);
          for (const pid of stale) killProcess(pid);
          await new Promise((r) => setTimeout(r, 600));
        }
      } catch (e: any) {
        console.warn(`[terminal-plugin] stale-instance scan failed: ${e?.message ?? e}`);
      }
      // Fallback: if the HTTP port is still held by something (permissions or a
      // non-project process), kill it so vite can bind.
      const httpOwner = (await isPortInUse(4321)) ? pidByPort(4321) : null;
      if (httpOwner) {
        console.log(`[terminal-plugin] port 4321 held by stale process (pid ${httpOwner}) — killing it`);
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
      spawnTerminalServer(port);
      // Ensure the child dies with the vite process even on SIGKILL paths
      const killChild = () => { shuttingDown = true; try { proc?.kill(); } catch {} };
      process.once("exit", killChild);
      process.once("SIGINT", killChild);
      process.once("SIGTERM", killChild);
    },
    closeBundle() {
      shuttingDown = true;
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
