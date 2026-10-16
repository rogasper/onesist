/**
 * One `codex app-server` per binary, shared by every thread of this Onesist process. The
 * handshake (`initialize`, then the `initialized` notification) runs once per server. Each
 * thread subscribes by `threadId`, both to notifications and to server requests (approvals),
 * so two threads on one server never see each other's output or decisions. The server is
 * stopped when Onesist exits or is signalled, like `opencode serve`: Bun does not run "exit"
 * listeners on a signal.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { RpcClient, type RpcNotification, type RpcServerRequest } from "./rpc";

export interface CodexConnection {
  rpc: RpcClient;
  baseKey: string;
  /** Notifications of one thread. Returns the unsubscribe function. */
  subscribe(threadId: string, handler: (n: RpcNotification) => void): () => void;
  /** Server requests (approvals, user-input asks) of one thread. Returns the unsubscribe function. */
  subscribeRequests(threadId: string, handler: (r: RpcServerRequest) => void): () => void;
  /** The server process ended or its connection broke. Returns the unsubscribe function. */
  onClosed(handler: (reason: string) => void): () => void;
}

interface Entry {
  child: ChildProcess;
  conn: CodexConnection;
  ready: Promise<void>;
}

const servers: Map<string, Entry> = ((globalThis as any).__onesistCodexServers ??= new Map());
const hooks: { installed: boolean } = ((globalThis as any).__onesistCodexHooks ??= { installed: false });

export function liveCodexServers(): number {
  return servers.size;
}

export function stopCodexServers(): void {
  for (const entry of servers.values()) {
    try {
      entry.child.kill();
    } catch {
      /* already gone */
    }
  }
  servers.clear();
}

function installHooks(): void {
  if (hooks.installed) return;
  hooks.installed = true;
  process.once("exit", stopCodexServers);
  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.once(signal, () => {
      stopCodexServers();
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}

/** Subscribers keyed by thread id; a handler set is dropped when its last handler leaves. */
function registry<T>() {
  const byThread = new Map<string, Set<T>>();
  return {
    add(threadId: string, handler: T): () => void {
      const set = byThread.get(threadId) ?? new Set<T>();
      set.add(handler);
      byThread.set(threadId, set);
      return () => {
        set.delete(handler);
        if (!set.size) byThread.delete(threadId);
      };
    },
    for(threadId: string): Iterable<T> {
      return byThread.get(threadId) ?? [];
    },
  };
}

export async function getCodexConnection(binary: string): Promise<CodexConnection> {
  installHooks();
  const existing = servers.get(binary);
  if (existing) {
    await existing.ready;
    return existing.conn;
  }

  const child = spawn(binary, ["app-server"], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: process.env });
  const rpc = new RpcClient((line) => {
    if (child.stdin?.writable) child.stdin.write(line);
  });
  const notifications = registry<(n: RpcNotification) => void>();
  const requests = registry<(r: RpcServerRequest) => void>();
  rpc.onNotification((n) => {
    const threadId = n.params?.threadId;
    if (typeof threadId !== "string") return;
    for (const h of notifications.for(threadId)) h(n);
  });
  rpc.onServerRequest((r) => {
    const threadId = r.params?.threadId;
    if (typeof threadId !== "string") return;
    for (const h of requests.for(threadId)) h(r);
  });
  child.stdout?.setEncoding("utf-8");
  child.stdout?.on("data", (chunk: string) => rpc.feed(chunk));
  child.stderr?.on("data", () => {
    /* the server logs to stderr; its lines are not protocol messages */
  });
  const drop = (reason: string) => {
    if (servers.get(binary)?.child === child) servers.delete(binary);
    rpc.close(reason);
  };
  child.on("error", (err) => drop(`Codex tidak bisa dijalankan: ${err.message}`));
  child.on("close", (code) => drop(`Proses Codex berhenti (kode ${code ?? "?"}).`));

  const conn: CodexConnection = {
    rpc,
    baseKey: binary,
    subscribe: (threadId, handler) => notifications.add(threadId, handler),
    subscribeRequests: (threadId, handler) => requests.add(threadId, handler),
    onClosed: (handler) => rpc.onClosed(handler),
  };
  const ready = (async () => {
    await rpc.request("initialize", { clientInfo: { name: "onesist", version: "0.0.0" }, capabilities: { experimentalApi: false, requestAttestation: false } }, 10_000);
    rpc.notify("initialized");
  })();
  servers.set(binary, { child, conn, ready });
  try {
    await ready;
  } catch (err) {
    drop(err instanceof Error ? err.message : String(err));
    throw err;
  }
  return conn;
}
