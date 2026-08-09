import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const TERMINAL_PORT = 4323;

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

/** Find the PID listening on a port (Windows-safe: netstat works everywhere,
 *  `pkill` does not exist on Windows). */
function pidByPort(port: number): number | null {
  try {
    const out = spawnSync("netstat", ["-ano"], { encoding: "utf-8", windowsHide: true }).stdout || "";
    for (const line of out.split(/\r?\n/)) {
      const m = line.trim().match(/TCP\s+127\.0\.0\.1:(\d+).*LISTENING\s+(\d+)/);
      if (m && Number(m[1]) === port) return Number(m[2]);
    }
  } catch {}
  return null;
}

function killProcess(pid: number) {
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
    } else {
      process.kill(pid, "SIGKILL");
    }
  } catch {}
}

function terminalServerPlugin() {
  let proc: ChildProcess | null = null;
  return {
    name: "terminal-server",
    async configureServer() {
      const token = randomUUID();
      if (await isPortInUse(TERMINAL_PORT)) {
        // The port is held by something. If it's a live terminal server from
        // this same dev session, reuse it; otherwise (stale orphan from a
        // previous vite that was SIGKILLed — pkill never ran on Windows) kill
        // it and spawn fresh, so we never serve old broken code.
        let ownerPid: number | null = null;
        let ownerToken: string | null | undefined;
        try {
          const res = await fetch(`http://127.0.0.1:${TERMINAL_PORT}/__health`, { signal: AbortSignal.timeout(2000) });
          const data = await res.json();
          ownerPid = data?.pid ?? null;
          ownerToken = data?.token ?? null;
        } catch {}
        if (ownerToken !== undefined && ownerToken === token) {
          console.log("[terminal-plugin] terminal server already running — reusing it");
          return;
        }
        const pid = ownerPid ?? pidByPort(TERMINAL_PORT);
        if (pid) {
          console.log(`[terminal-plugin] stale terminal server (pid ${pid}) — killing it`);
          killProcess(pid);
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      const script = path.resolve(__dirname, "src/server/terminal-server.ts");
      const isBun = typeof Bun !== "undefined";
      const nodeMajor = Number(process.versions.node?.split(".")[0] || 0);
      const args = isBun
        ? ["run", script]
        : [...(nodeMajor < 23 ? ["--experimental-strip-types"] : []), script];
      proc = spawn(process.execPath, args, {
        stdio: "inherit",
        env: { ...process.env, SA_TERM_TOKEN: token },
      });
      proc.on("error", () => {});
      console.log("[terminal-plugin] spawned terminal server");
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
    strictPort: true,
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
