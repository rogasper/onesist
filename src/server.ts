import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { handleApiRequest } from "~/server/api-router";
import { seedIfEmpty } from "~/server/db/seed";
import { startFileWatcher, registerWatchRoot } from "~/server/file-watcher";
import path from "node:path";
import net from "node:net";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

seedIfEmpty();

// Register every project root so the file watcher emits SSE file:changed
// events for project files (input/fsd etc.). Without this, the watcher only
// scanned SA_ROOT and project changes never reached the frontend.
// (Dynamic import — importing db at top level here collides with file-watcher's
// own db import in the compiled bundle and breaks Bun's __promiseAll helper.)
void (async () => {
  try {
    const { db } = await import("~/server/db/client");
    const { projects } = await import("~/server/db/schema");
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
  await import("~/server/terminal-server");
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

const ASSET_PREFIXES = ["/assets/", "/favicon", "/logo", "/manifest"];

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
