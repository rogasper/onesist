/**
 * The `opencode serve` process behind Onesist's OpenCode chat. One 2.x server
 * serves every project folder, so there is one per Onesist server: spawned on
 * first use on 127.0.0.1 with a random password (OpenCode 2 always requires one),
 * reused afterwards, killed when Onesist exits. A provider's Server URL (or
 * SA_OPENCODE_URL) attaches to a server the user runs instead (decision 11: spawn by
 * default, attach optional).
 *
 * State lives on globalThis: Vite's HMR re-evaluates modules, and a module-level
 * handle would orphan the running server on every reload.
 */
import { spawn, type ChildProcess } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import { basicAuth, ocInfo, type OpenCodeConnection } from "./client";

const READY_TIMEOUT_MS = 20_000;
const POLL_MS = 250;

interface ServerState {
  child: ChildProcess | null;
  conn: OpenCodeConnection | null;
  starting: Promise<OpenCodeConnection> | null;
  exitHooked: boolean;
}

const state: ServerState = ((globalThis as any).__onesistOpenCode ??= {
  child: null,
  conn: null,
  starting: null,
  exitHooked: false,
});

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function spawnServer(binary: string): Promise<OpenCodeConnection> {
  const password = crypto.randomBytes(24).toString("hex");
  const port = await freePort();
  const env: NodeJS.ProcessEnv = { ...process.env, OPENCODE_PASSWORD: password };
  delete env.OPENCODE_SERVER_PASSWORD;
  const child = spawn(binary, ["serve", "--hostname", "127.0.0.1", "--port", String(port)], {
    env,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr?.on("data", (chunk) => {
    stderr = (stderr + String(chunk)).slice(-2000);
  });
  const conn: OpenCodeConnection = { baseUrl: `http://127.0.0.1:${port}`, authorization: basicAuth(password) };
  let childGone = false;

  const failed = new Promise<never>((_, reject) => {
    child.once("error", (err: NodeJS.ErrnoException) => {
      childGone = true;
      reject(
        new Error(
          err.code === "ENOENT"
            ? `OpenCode tidak ditemukan ("${binary}"). Pasang OpenCode atau isi path-nya di pengaturan provider.`
            : `OpenCode gagal dijalankan: ${err.message}`,
        ),
      );
    });
    child.once("exit", (code) => {
      childGone = true;
      reject(new Error(`OpenCode berhenti sebelum siap (kode ${code ?? "?"}). ${stderr.trim().slice(0, 300)}`));
    });
  });
  const ready = (async () => {
    const deadline = Date.now() + READY_TIMEOUT_MS;
    // Stops as soon as the process is gone, so a failed start leaves no poller (and no unhandled rejection) behind.
    while (Date.now() < deadline && !childGone) {
      try {
        await ocInfo(conn, AbortSignal.timeout(1_000));
        return conn;
      } catch {
        await Bun.sleep(POLL_MS);
      }
    }
    throw new Error("OpenCode tidak siap dalam 20 detik.");
  })();
  ready.catch(() => {});

  try {
    await Promise.race([ready, failed]);
  } catch (err) {
    child.kill();
    throw err;
  }
  failed.catch(() => {}); // a later exit is handled by the listener below
  state.child = child;
  state.conn = conn;
  child.once("exit", () => {
    if (state.child === child) {
      state.child = null;
      state.conn = null;
    }
  });
  if (!state.exitHooked) {
    state.exitHooked = true;
    process.once("exit", () => stopOpenCodeServer());
  }
  return conn;
}

export async function getOpenCodeConnection(opts: {
  binary: string;
  /** A server the user runs themselves; wins over SA_OPENCODE_URL. */
  serverUrl?: string | null;
  serverPassword?: string | null;
}): Promise<OpenCodeConnection> {
  const own = opts.serverUrl?.trim();
  if (own) return { baseUrl: own.replace(/\/+$/, ""), authorization: basicAuth(opts.serverPassword ?? "") };
  const attach = process.env.SA_OPENCODE_URL?.trim();
  if (attach) {
    return { baseUrl: attach.replace(/\/+$/, ""), authorization: basicAuth(process.env.SA_OPENCODE_PASSWORD ?? "") };
  }
  if (state.conn && state.child && state.child.exitCode === null) return state.conn;
  if (!state.starting) {
    state.starting = spawnServer(opts.binary).finally(() => {
      state.starting = null;
    });
  }
  return state.starting;
}

export function stopOpenCodeServer(): void {
  const child = state.child;
  state.child = null;
  state.conn = null;
  if (child && child.exitCode === null) child.kill();
}

export function openCodeServerPid(): number | null {
  return state.child?.pid ?? null;
}
