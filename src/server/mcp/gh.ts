/**
 * GitHub MCP through the `gh` CLI.
 *
 * GitHub publishes no dynamic client registration, so the browser OAuth flow
 * cannot work for it (measured 2026-10-16: the metadata has no
 * `registration_endpoint`). The `gh` CLI has already done that authorization on
 * this machine, and its token is accepted by the GitHub MCP endpoint — verified
 * end to end, 46 tools. So "connect" here means borrowing the CLI's token
 * instead of registering an OAuth app.
 *
 * Each spawn carries its arguments as an inline literal with no shell, so
 * nothing from a request can reach the command line. The token is never cached.
 */
import { spawn } from "node:child_process";
import { resolveExecutable } from "~/lib/agent-cli";

export interface GhStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
  /** Logged in with a token that can be read. */
  authenticated: boolean;
  account: string | null;
  tokenPrefix: string | null;
  /** Scopes the token carries, as reported by `gh auth status`. */
  scopes: string[];
  error: string | null;
}

/** `gh auth token` prints the active account's token, or nothing when logged out. */
export function readGhToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("gh", ["auth", "token"], { windowsHide: true });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const token = out.trim();
      if (code !== 0 || !token) {
        reject(new Error("gh CLI tidak mengembalikan token. Jalankan `gh auth login` dulu."));
        return;
      }
      resolve(token);
    });
  });
}

/** `gh auth status` writes its report to stderr and exits non-zero when logged out. */
function authStatusText(): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn("gh", ["auth", "status"], { windowsHide: true });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(out));
  });
}

function ghVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const child = spawn("gh", ["version"], { windowsHide: true });
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.on("error", () => resolve(null));
    child.on("close", () => resolve(out.split("\n")[0]?.trim() || null));
  });
}

function parseAuthStatus(output: string): { account: string | null; scopes: string[] } {
  const account = output.match(/account\s+(\S+)/i)?.[1] ?? null;
  const scopeLine = output.match(/Token scopes:\s*(.+)/i)?.[1];
  const scopes = scopeLine
    ? scopeLine
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean)
    : [];
  return { account, scopes };
}

export async function ghStatus(): Promise<GhStatus> {
  const exe = resolveExecutable("gh");
  if (!exe) {
    return {
      installed: false,
      path: null,
      version: null,
      authenticated: false,
      account: null,
      tokenPrefix: null,
      scopes: [],
      error: null,
    };
  }

  const { account, scopes } = parseAuthStatus(await authStatusText());

  let tokenPrefix: string | null = null;
  let authenticated = false;
  try {
    tokenPrefix = (await readGhToken()).slice(0, 4);
    authenticated = true;
  } catch {}

  return {
    installed: true,
    path: exe,
    version: await ghVersion(),
    authenticated,
    account,
    tokenPrefix,
    scopes,
    error: authenticated ? null : "gh CLI terpasang tetapi belum login. Jalankan `gh auth login`.",
  };
}
