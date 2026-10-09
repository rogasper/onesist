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
export async function capture(url: string, opts: { waitForCanvas?: boolean; settleMs?: number } = {}): Promise<CaptureResult> {
  const c = await ensureBrowser();
  touch();
  const { targetId } = await c.send("Target.createTarget", { url: "about:blank" });
  try {
    const { sessionId } = await c.send("Target.attachToTarget", { targetId, flatten: true });
    await c.send("Page.enable", {}, sessionId);
    await c.send("Runtime.enable", {}, sessionId);
    await c.send("Emulation.setDeviceMetricsOverride", VIEWPORT, sessionId);
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
    return {
      png: Buffer.from(shot, "base64"),
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
