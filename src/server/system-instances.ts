import { spawnSync } from "node:child_process";

export type InstanceRole = "dev-server" | "dev-wrapper" | "terminal-server" | "desktop-server" | "other";

export interface InstanceInfo {
  pid: number;
  ppid: number;
  role: InstanceRole;
  rssMB: number | null;
  startedAt: string | null;
  command: string;
  /** True when the process is part of the CURRENT server's tree (self or a
   *  descendant) — the widget must not offer a Kill button for these. */
  selfTree: boolean;
}

interface PsRow {
  pid: number;
  ppid: number;
  command: string;
  rssKB: number | null;
  startedAt: string | null;
}

function psList(): PsRow[] {
  if (process.platform === "win32") {
    try {
      const out = spawnSync("wmic", ["process", "get", "ProcessId,ParentProcessId,CommandLine", "/format:csv"], { encoding: "utf-8", windowsHide: true }).stdout || "";
      const rows: PsRow[] = [];
      for (const line of out.split(/\r?\n/)) {
        const m = line.trim().match(/^"[^"]*",(\d+),(\d+),"(.*)"$/);
        if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3], rssKB: null, startedAt: null });
      }
      return rows;
    } catch { return []; }
  }
  try {
    const out = spawnSync("ps", ["-eo", "pid=,ppid=,rss=,lstart=,command="], { encoding: "utf-8", windowsHide: true }).stdout || "";
    const rows: PsRow[] = [];
    for (const line of out.split("\n")) {
      // lstart = "Wed Aug 12 12:13:05 2026" (space separated) — greedy match.
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?\s+\d{4})\s+(.*)$/);
      if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), rssKB: Number(m[3]), startedAt: m[4], command: m[5] });
    }
    return rows;
  } catch { return []; }
}

function classifyRole(command: string): InstanceRole {
  if (command.includes("terminal-server.ts")) return "terminal-server";
  if (command.includes("onesist-server")) return "desktop-server";
  if (/node_modules[\\/]\.bin[\\/]vite/.test(command)) return "dev-server";
  return "dev-wrapper";
}

/** All processes that look like this app's own instances (dev servers, their
 *  bun wrappers, terminal servers, desktop sidecar) — used by the frontend
 *  "Server Instances" widget to detect + kill duplicates.
 *
 *  Matching is deliberately NARROW: only this project's unique markers
 *  (vite/terminal paths resolved against cwd, or the sidecar binary name) —
 *  never a bare `bun run dev` or a broad cwd substring, which would let one
 *  app's widget kill another project's dev server. Parent bun wrappers are
 *  then folded in by walking UP from a matched process. */
export function scanInstances(): InstanceInfo[] {
  const rows = psList();
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const cwd = process.cwd();
  const markers = [
    cwd.length > 2 ? `${cwd}/node_modules/.bin/vite` : "",
    cwd.length > 2 ? `${cwd}/src/server/terminal/terminal-server.ts` : "",
    "onesist-server",
  ].filter(Boolean);
  const isApp = (c: string) => markers.some((m) => c.includes(m));

  const matched = rows.filter((r) => isApp(r.command));
  // Walk up from each match through bun/node wrappers so the parent `bun run
  // dev` tree shows as one unit (stop before the shell/init).
  const pids = new Set<number>();
  for (const r of matched) {
    let cur: PsRow | undefined = r;
    while (cur && !pids.has(cur.pid)) {
      pids.add(cur.pid);
      const parent = byPid.get(cur.ppid);
      if (parent && /(bun|node)/.test(parent.command)) cur = parent;
      else break;
    }
  }

  // Mark processes that belong to the CURRENT server tree (self + ancestors +
  // descendants) so the UI can show them as "bagian dari server ini".
  const self = process.pid;
  const selfTree = new Set<number>([self]);
  let anc = byPid.get(self);
  for (let i = 0; i < 12 && anc; i++) {
    if (anc.ppid > 1) selfTree.add(anc.ppid);
    anc = byPid.get(anc.ppid);
  }
  const childOf = new Map<number, number[]>();
  for (const r of rows) {
    if (!childOf.has(r.ppid)) childOf.set(r.ppid, []);
    childOf.get(r.ppid)!.push(r.pid);
  }
  const q = [self];
  while (q.length) {
    const p = q.pop()!;
    for (const c of childOf.get(p) ?? []) {
      if (!selfTree.has(c)) { selfTree.add(c); q.push(c); }
    }
  }

  return [...pids]
    .map((pid) => {
      const r = byPid.get(pid)!;
      return {
        pid,
        ppid: r.ppid,
        role: classifyRole(r.command),
        rssMB: r.rssKB != null ? Math.round(r.rssKB / 1024) : null,
        startedAt: r.startedAt,
        command: r.command.slice(0, 240),
        selfTree: selfTree.has(pid),
      };
    })
    .sort((a, b) => a.pid - b.pid);
}

/** Kill a process AND its whole descendant tree. Returns number of pids killed.
 *  Refuses to kill the current process. */
export function killTree(pid: number): number {
  if (!pid || pid === process.pid) return 0;
  const rows = psList();
  const children = new Map<number, number[]>();
  for (const r of rows) {
    if (!children.has(r.ppid)) children.set(r.ppid, []);
    children.get(r.ppid)!.push(r.pid);
  }
  const toKill = new Set<number>([pid]);
  const queue = [pid];
  while (queue.length) {
    const p = queue.pop()!;
    for (const c of children.get(p) ?? []) {
      if (!toKill.has(c) && c !== process.pid) { toKill.add(c); queue.push(c); }
    }
  }
  let killed = 0;
  for (const p of toKill) {
    try {
      process.kill(p, "SIGKILL");
      killed++;
    } catch {}
  }
  return killed;
}

/** Kill `opencode run` processes that are (transitive) children of `parentPid`
 *  but NOT in `trackedPids`. SSR module reloads (dev edits) wipe the in-memory
 *  RUNNING_AGENTS map and orphan the spawned agent — this cleans those up so
 *  restarts don't accumulate hung opencode processes. */
export function killUntrackedAgentChildren(parentPid: number, trackedPids: Set<number>): number {
  const rows = psList();
  const byPid = new Map(rows.map((r) => [r.pid, r]));
  const isChildOf = (pid: number): boolean => {
    let cur = byPid.get(pid);
    for (let i = 0; i < 12 && cur; i++) {
      if (cur.pid === parentPid) return true;
      cur = byPid.get(cur.ppid);
    }
    return false;
  };
  const targets = rows.filter((r) => r.command.includes("opencode run") && !trackedPids.has(r.pid) && isChildOf(r.pid));
  let killed = 0;
  for (const r of targets) {
    try { process.kill(r.pid, "SIGKILL"); killed++; } catch {}
  }
  return killed;
}
