import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { handleApiRequest } from "~/server/api-router";
import { seedIfEmpty } from "~/server/db/seed";
import { startFileWatcher, registerWatchRoot } from "~/server/realtime/file-watcher";
import path from "node:path";
import net from "node:net";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { db } from "~/server/db/client";
import { projects } from "~/server/db/schema";

seedIfEmpty();

// Register every project root so the file watcher emits SSE file:changed
// events for project files (input/fsd etc.). Without this, the watcher only
// scanned SA_ROOT and project changes never reached the frontend.
// (Imports are STATIC — dynamic `await import()` here made Bun's compiled
// bundle batch db/client + route-utils into a `__promiseAll([...])` call whose
// helper it fails to emit, crashing the desktop sidecar at startup.)
void (async () => {
  try {
    const all = db.select().from(projects).all() as { rootPath: string | null }[];
    for (const p of all) if (p.rootPath) registerWatchRoot(p.rootPath);
  } catch {}
})();

startFileWatcher();

// Start the terminal server (port 4323). Its module self-starts Bun.serve on
// import. In dev the Vite plugin may have already spawned it as a child — the
// port check prevents a duplicate. In production (bun dist/server/server.js,
// Tauri sidecar, or compiled executable) this is the only starter.
async function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    s.once("connect", () => { s.destroy(); resolve(true); });
    s.once("error", () => resolve(false));
  });
}

async function ensureTerminalServer() {
  const port = parseInt(process.env.TERMINAL_PORT || "4323", 10);
  if (await portInUse(port)) {
    // Port is held by something — could be a stale terminal-server from a
    // previous crash. Kill it (safe: only our own process type) and retry.
    try {
      spawnSync("pkill", ["-9", "-f", "terminal-server.ts"], { stdio: "ignore" });
      await new Promise((r) => setTimeout(r, 500));
    } catch {}
    if (await portInUse(port)) return; // still busy → someone else's port, skip
  }

  // On Windows under Bun, node-pty is unavailable (Bun's runtime doesn't
  // support net.Socket({ fd }) which ConPTY requires for input). Without
  // node-pty the terminal falls back to a cmd.exe pipe that cannot resize,
  // so TUIs (opencode, claude) are stuck at their initial grid and never
  // track the panel size. Fix: spawn the terminal server under Node.js where
  // node-pty works and ConPTY resize events propagate correctly.
  if (process.platform === "win32" && typeof Bun !== "undefined") {
    try {
      const { spawn } = await import("node:child_process");
      const clientDir = process.env.SA_CLIENT_DIR || path.resolve(import.meta.dirname ?? ".", "..", "client");
      // The web-dist layout nests the terminal server build two levels deep
      // (web-dist/server/server/terminal-server.node.js), so relative to the
      // client dir it's ../server/server/. Check both shapes defensively.
      const candidates = [
        path.resolve(clientDir, "..", "server", "server", "terminal-server.node.js"),
        path.resolve(clientDir, "..", "server", "terminal-server.node.js"),
      ];
      const nodeServerPath = candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
      const child = spawn("node", [nodeServerPath], {
        env: { ...process.env, TERMINAL_PORT: String(port) },
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });
      child.unref();
      child.stdout?.on("data", (d: Buffer) => process.stdout.write(d));
      child.stderr?.on("data", (d: Buffer) => process.stderr.write(d));
      for (let i = 0; i < 50; i++) {
        if (await portInUse(port)) return;
        await new Promise((r) => setTimeout(r, 200));
      }
      console.error(`[server] ${nodeServerPath} did not start within 10s, falling back to in-process`);
    } catch (e) {
      console.error("[server] Failed to spawn terminal server under Node.js:", e);
    }
  }

  // Non-Windows or spawn failed: run in-process (Bun uses Bun.serve +
  // Python PTY bridge on POSIX; on Windows without node-pty it uses the
  // cmd.exe pipe which cannot resize — TUIs won't track panel size).
  await import("~/server/terminal/terminal-server");
}

ensureTerminalServer();

// Desktop sidecar safety net: if the Tauri shell dies abruptly (crash,
// SIGTERM, force-quit), the parent PID disappears. Exit ourselves so we
// never leak an orphaned server holding ports 4321/4323.
if (process.env.SA_DESKTOP === "1" && typeof process.ppid === "number") {
  const parentPid = process.ppid;
  const watchdog = setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      process.exit(0);
    }
  }, 3000);
  watchdog.unref?.();
}

const startHandler = createStartHandler({ handler: defaultStreamHandler });

// Serve built client assets (/assets/*, favicon etc.) from the client dist.
// In dev, Vite serves these itself (never reaches here because handleApiRequest
// and startHandler handle / and /_build/ first). In production the client dist
// lives next to the server bundle; the Tauri sidecar can point here explicitly.
const clientDir =
  process.env.SA_CLIENT_DIR || path.resolve(import.meta.dirname, "..", "client");

const ASSET_PREFIXES = ["/assets/", "/images/", "/favicon", "/logo", "/manifest"];

async function serveStatic(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (!ASSET_PREFIXES.some((p) => url.pathname.startsWith(p))) return null;
  const rel = url.pathname.replace(/^\/+/, "");
  const filePath = path.resolve(clientDir, rel);
  if (!filePath.startsWith(clientDir)) return null;
  try {
    const data = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).slice(1);
    const types: Record<string, string> = {
      js: "text/javascript", css: "text/css", json: "application/json",
      svg: "image/svg+xml", png: "image/png", jpg: "image/jpeg",
      ico: "image/x-icon", woff2: "font/woff2", txt: "text/plain",
      html: "text/html", map: "application/json", mjs: "text/javascript",
    };
    return new Response(data, {
      headers: { "Content-Type": types[ext] || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return null;
  }
}

export default {
  async fetch(request: Request, opts?: Parameters<typeof startHandler>[1]) {
    const apiResponse = await handleApiRequest(request);
    if (apiResponse) return apiResponse;
    const staticResponse = await serveStatic(request);
    if (staticResponse) return staticResponse;
    const res = await startHandler(request, opts);
    // Never let the WebView cache SSR HTML — it embeds per-request state
    // (agent detect, project data) that must reflect the live server.
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-store");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  },
};
