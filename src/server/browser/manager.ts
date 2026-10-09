/**
 * The browser window Onesist opens to read design links (P4.2 / P4.3).
 *
 * One Chrome (or Edge) process, with its own profile folder, shared by every capture. It is
 * visible on purpose: Figma refuses headless browsers (CloudFront 403, measured), and a visible
 * window is also where the user signs in once for private files. The profile is separate from the
 * user's own browser, so Onesist never touches their other logins. It shuts down after five minutes
 * without use.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { appSettings } from "~/server/db/schema";
import { CdpClient, type SocketLike } from "./cdp";
import { findBrowser, type BrowserChoice } from "./locate";

export class BrowserError extends Error {}

const IDLE_MS = 5 * 60_000;
const VIEWPORT = { width: 1600, height: 1000, deviceScaleFactor: 2, mobile: false };

let child: ChildProcess | null = null;
let client: CdpClient | null = null;
let starting: Promise<CdpClient> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Where the browser keeps its own profile. Next to the database, never the working directory. */
export function profileDir(): string {
  const dbPath = process.env.SA_DB_PATH;
  const base = dbPath ? path.dirname(dbPath) : path.join(os.homedir(), ".onesist");
  return path.join(base, "browser-profile");
}

function configuredPath(): string | null {
  const row = db.select().from(appSettings).where(eq(appSettings.key, "browser.path")).get() as { value: string } | undefined;
  if (!row) return null;
  try {
    const value = JSON.parse(row.value);
    return typeof value === "string" && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function locateBrowser(): BrowserChoice | null {
  return findBrowser({ platform: process.platform, env: process.env, override: configuredPath() });
}

export function browserRunning(): boolean {
  return client !== null;
}

function touch(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(shutdown, IDLE_MS);
  idleTimer.unref?.();
}

/** Closes the window and the connection. The next use starts a new one. */
export function shutdown(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  client?.close();
  client = null;
  child?.kill();
  child = null;
}

async function readDebugPort(dir: string, timeoutMs = 15_000): Promise<number> {
  const file = path.join(dir, "DevToolsActivePort");
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (fs.existsSync(file)) {
      const port = Number(fs.readFileSync(file, "utf8").split("\n")[0]);
      if (port > 0) return port;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new BrowserError("Browser tidak merespons. Coba lagi, atau tutup jendela browser yang tertinggal.");
}

async function ensureBrowser(): Promise<CdpClient> {
  if (client) return client;
  if (starting) return starting;
  starting = (async () => {
    const choice = locateBrowser();
    if (!choice) {
      throw new BrowserError("Chrome atau Edge tidak ditemukan. Atur lokasinya di Pengaturan → Browser untuk tautan.");
    }
    const dir = profileDir();
    fs.mkdirSync(dir, { recursive: true });
    try {
      fs.unlinkSync(path.join(dir, "DevToolsActivePort"));
    } catch {
      /* first start: nothing to remove */
    }
    child = spawn(
      choice.path,
      [`--user-data-dir=${dir}`, "--remote-debugging-port=0", "--no-first-run", "--no-default-browser-check", "about:blank"],
      { stdio: "ignore" },
    );
    child.on("exit", () => {
      client = null;
      child = null;
    });
    const port = await readDebugPort(dir);
    const version = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()) as { webSocketDebuggerUrl: string };
    const socket = new WebSocket(version.webSocketDebuggerUrl) as unknown as SocketLike;
    const connected = new CdpClient(socket, 30_000);
    await connected.open();
    client = connected;
    return connected;
  })();
  try {
    return await starting;
  } finally {
    starting = null;
  }
}

/** Resolves with the next matching event of this page, or rejects after `ms`. */
function nextEvent(c: CdpClient, method: string, sessionId: string, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const off = c.on((ev) => {
      if (ev.method === method && ev.sessionId === sessionId) {
        clearTimeout(timer);
        off();
        resolve();
      }
    });
    const timer = setTimeout(() => {
      off();
      reject(new Error(`${method} timed out`));
    }, ms);
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


export interface CaptureResult {
  png: Buffer;
  finalUrl: string;
  title: string;
  /** The page is Figma's (or another) sign-in page: the file is private and needs a login. */
  loginRequired: boolean;
}

/**
 * Opens `url` in a new tab of the managed window, waits for it to settle, screenshots it, and
 * closes the tab. With `waitForCanvas`, waits (up to 25 s) for a canvas element first: Figma draws
 * its frames on one.
 */
/** Hides Figma's editor chrome and comment layer in the viewer (see the `hideUi` option). */
const FIGMA_CHROME_HIDDEN_CSS = [
  "left_panel_island_container",
  "rightPanelLoggedOutDesignContainer",
  "positioned_design_toolbelt",
  "logged_out_banner",
  "base_cookie_banner",
  "blocked_ui_loading_indicator",
  "comments_view",
  "multiplayer_cursors",
]
  .map((name) => `[class*="${name}"]`)
  .join(", ")
  .concat(" { display: none !important; }");

/** Figma's selection blue, the outline it draws around the node named by `node-id`. */
const SELECTION_RGB = [24, 160, 251];

/**
 * Runs in a blank page of the managed window, so the browser's own canvas decodes the PNG (no
 * decoder in Onesist). Finds the selection outline by colour, then crops to the inside of it. The
 * frame name above and the size label below sit outside the outline, so they are left out, and
 * the outline itself is inset out of the picture. Resolves to null when no outline is visible,
 * and the caller keeps the whole screenshot.
 */
const CROP_TO_SELECTION_SCRIPT = `async (b64, rgb, tolerance, minRun, inset) => {
  const img = new Image();
  img.src = "data:image/png;base64," + b64;
  await img.decode();
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, w, h).data;
  const near = (i) =>
    Math.abs(px[i] - rgb[0]) <= tolerance && Math.abs(px[i + 1] - rgb[1]) <= tolerance && Math.abs(px[i + 2] - rgb[2]) <= tolerance;
  const cols = new Uint32Array(w);
  const rows = new Uint32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (near((y * w + x) * 4)) {
        cols[x]++;
        rows[y]++;
      }
    }
  }
  let left = -1;
  let right = -1;
  let top = -1;
  for (let x = 0; x < w; x++) {
    if (cols[x] >= minRun) {
      if (left < 0) left = x;
      right = x;
    }
  }
  for (let y = 0; y < h; y++) {
    if (rows[y] >= minRun && top < 0) top = y;
  }
  if (left < 0 || top < 0 || right - left < minRun) return null;
  // The sides run the frame's whole height. Follow them down from the top and stop at the first
  // gap: Figma's own blue bars further down can touch the same columns.
  let bottom = top;
  let lastBlue = top;
  for (let y = top; y < h && y - lastBlue <= 3; y++) {
    if (near((y * w + left) * 4) || near((y * w + right) * 4)) {
      lastBlue = y;
      bottom = y;
    }
  }
  if (bottom - top < minRun) return null;
  const x0 = left + inset;
  const y0 = top + inset;
  const x1 = right - inset + 1;
  const y1 = bottom - inset + 1;
  const out = document.createElement("canvas");
  out.width = x1 - x0;
  out.height = y1 - y0;
  out.getContext("2d").drawImage(img, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png").split(",")[1];
}`;

/** Crops a screenshot to the selected frame, or returns null when no selection outline shows. */
async function cropToSelection(c: CdpClient, png: Buffer): Promise<Buffer | null> {
  const { targetId } = await c.send("Target.createTarget", { url: "about:blank" });
  try {
    const { sessionId } = await c.send("Target.attachToTarget", { targetId, flatten: true });
    // Device pixels: the viewport is 2x. A frame outline is at least 300 px long; the outline is
    // about 2 px wide, so 3 px inside it is clear of the stroke.
    const args = [png.toString("base64"), SELECTION_RGB, 30, 300, 3].map((v) => JSON.stringify(v)).join(", ");
    const result = await c.send(
      "Runtime.evaluate",
      { expression: `(${CROP_TO_SELECTION_SCRIPT})(${args})`, awaitPromise: true, returnByValue: true },
      sessionId,
    );
    const out = result.result?.value as string | null | undefined;
    return out ? Buffer.from(out, "base64") : null;
  } finally {
    await c.send("Target.closeTarget", { targetId }).catch(() => {});
  }
}

export async function capture(
  url: string,
  opts: { waitForCanvas?: boolean; settleMs?: number; viewportHeight?: number; cropToSelection?: boolean; hideUi?: boolean } = {},
): Promise<CaptureResult> {
  const c = await ensureBrowser();
  touch();
  const { targetId } = await c.send("Target.createTarget", { url: "about:blank" });
  try {
    const { sessionId } = await c.send("Target.attachToTarget", { targetId, flatten: true });
    await c.send("Page.enable", {}, sessionId);
    await c.send("Runtime.enable", {}, sessionId);
    await c.send("Emulation.setDeviceMetricsOverride", { ...VIEWPORT, height: opts.viewportHeight ?? VIEWPORT.height }, sessionId);
    const loaded = nextEvent(c, "Page.loadEventFired", sessionId, 25_000).catch(() => {});
    await c.send("Page.navigate", { url }, sessionId);
    await loaded;
    const evalJs = async (expression: string) => (await c.send("Runtime.evaluate", { expression, returnByValue: true }, sessionId)).result?.value;
    if (opts.waitForCanvas) {
      for (let i = 0; i < 50; i++) {
        if ((await evalJs("document.querySelectorAll('canvas').length")) > 0) break;
        await sleep(500);
      }
    }
    await sleep(opts.settleMs ?? 1500);
    if (opts.hideUi) {
      // Figma's keyboard shortcuts for this (Shift+C, Cmd+\) do nothing in the public viewer, so the
      // editor chrome and the comment layer are hidden with a stylesheet instead. Matched by class
      // name prefix, which Figma's CSS modules keep stable: file name and menu, right panel, bottom
      // toolbelt, "Sign up" and cookie banners, loading indicator, comments and cursors.
      await evalJs(
        `(() => { const style = document.createElement("style"); style.textContent = ${JSON.stringify(FIGMA_CHROME_HIDDEN_CSS)}; document.head.appendChild(style); })()`,
      );
      await sleep(500);
    }
    // Drawing settles when two screenshots in a row are identical (at most 15 s).
    let previous = "";
    let shot = "";
    for (let i = 0; i < 30; i++) {
      shot = (await c.send("Page.captureScreenshot", { format: "png" }, sessionId)).data as string;
      if (shot === previous) break;
      previous = shot;
      await sleep(500);
    }
    const finalUrl = String((await evalJs("location.href")) ?? url);
    const title = String((await evalJs("document.title")) ?? "");
    let png: Buffer = Buffer.from(shot, "base64");
    if (opts.cropToSelection) png = (await cropToSelection(c, png)) ?? png;
    return {
      png,
      finalUrl,
      title,
      loginRequired: /\/(login|signup)\b/.test(finalUrl),
    };
  } finally {
    await c.send("Target.closeTarget", { targetId }).catch(() => {});
  }
}

/** Opens a page in the managed window and leaves it open, so the user can sign in there. */
export async function openForLogin(url: string): Promise<void> {
  const c = await ensureBrowser();
  touch();
  await c.send("Target.createTarget", { url });
}

/** Forgets the sign-ins: shuts the window down and deletes the profile folder. */
export function clearProfile(): void {
  shutdown();
  fs.rmSync(profileDir(), { recursive: true, force: true });
}
