import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import net from "node:net";
import { spawn, type ChildProcess } from "node:child_process";

const TERMINAL_PORT = 4323;

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
  });
}

function terminalServerPlugin() {
  let proc: ChildProcess | null = null;
  return {
    name: "terminal-server",
    async configureServer() {
      // Reuse an already-running terminal server (e.g. orphaned by a previous
      // vite process) instead of crashing with EADDRINUSE.
      if (await isPortInUse(TERMINAL_PORT)) {
        console.log("[terminal-plugin] terminal server already running — reusing it");
        return;
      }
      const script = path.resolve(__dirname, "src/server/terminal-server.ts");
      const isBun = typeof Bun !== "undefined";
      const nodeMajor = Number(process.versions.node?.split(".")[0] || 0);
      const args = isBun
        ? ["run", script]
        : [...(nodeMajor < 23 ? ["--experimental-strip-types"] : []), script];
      proc = spawn(process.execPath, args, {
        stdio: "inherit",
        env: { ...process.env },
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
