/**
 * Path guard (FR-E2) and file-change computation (FR-C3).
 *
 * `file-router.writeFile()` uses `path.join(rootPath, relPath)` without
 * checking anything — `../../etc/hosts` would pass through as-is. That's why
 * EVERY tool touching files must go through `resolveInRoot()` first;
 * never call file-router utils with a raw path from the model.
 */
import fs from "node:fs";
import path from "node:path";

export class PathGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PathGuardError";
  }
}

export interface ResolvedPath {
  /** Absolute path already verified to be inside the root. */
  abs: string;
  /** Root-relative path, with `/` separators (for storage & display). */
  rel: string;
}

function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/**
 * Resolves `relPath` against `root` and ensures the result stays inside
 * root. Rejects:
 *  - escaping via `..`
 *  - absolute paths from another system
 *  - symlinks pointing outside root (checked on the existing portion)
 *  - NUL bytes
 */
export function resolveInRoot(root: string, relPath: string): ResolvedPath {
  const raw = String(relPath ?? "");
  if (!raw.trim()) {
    throw new PathGuardError('Path kosong. Untuk direktori root project, pakai path "." atau kosongkan argumen path pada list_dir.');
  }
  if (raw.includes("\0")) throw new PathGuardError("Path mengandung karakter tak sah.");

  const rootAbs = path.resolve(root);
  // Absolute paths: only accepted when genuinely inside root.
  const candidate = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(rootAbs, raw);

  const within = (p: string) => p === rootAbs || p.startsWith(rootAbs + path.sep);
  if (!within(candidate)) {
    throw new PathGuardError(
      `Path di luar workspace project ditolak: "${raw}". Semua operasi file harus di dalam ${rootAbs}.`,
    );
  }

  // A symlink can point outside root even when the path looks inside.
  // realpath only works on the existing portion, so we climb to the
  // nearest existing ancestor.
  let probe = candidate;
  while (!fs.existsSync(probe) && probe !== rootAbs) probe = path.dirname(probe);
  try {
    const realProbe = fs.realpathSync(probe);
    const realRoot = fs.realpathSync(rootAbs);
    if (realProbe !== realRoot && !realProbe.startsWith(realRoot + path.sep)) {
      throw new PathGuardError(`Path menembus keluar workspace lewat symlink: "${raw}".`);
    }
  } catch (err) {
    if (err instanceof PathGuardError) throw err;
    // realpath failed (e.g. root doesn't exist yet) — the `within` check above is enough.
  }

  const rel = toPosix(path.relative(rootAbs, candidate)) || ".";
  return { abs: candidate, rel };
}

/** `/`-marked relative path, for display to the user and storage in the DB. */
export function toRel(root: string, abs: string): string {
  return toPosix(path.relative(path.resolve(root), abs)) || ".";
}

// ─────────────────────────────────────────────────────────────────────────────
// File changes (FR-C3)
// ─────────────────────────────────────────────────────────────────────────────

export interface DiffStat {
  added: number;
  removed: number;
  /** Unified-style diff, already trimmed. Empty for new/deleted files. */
  diff: string;
  /** True when the content is too large for the diff to be fully computed. */
  truncated: boolean;
}

const MAX_DIFF_LINES = 3000;
const MAX_DIFF_OUTPUT_LINES = 200;
const CONTEXT_LINES = 2;

/**
 * Simple LCS-based diff. Computed from before & after contents already held
 * by the caller — does NOT re-read disk, so there's no race with
 * other changes between write and compute (FR-C3).
 *
 * For files above MAX_DIFF_LINES, the LCS computation is skipped and only line
 * counts are reported; a full diff for files that size is useless in the UI.
 */
export function diffStat(before: string, after: string): DiffStat {
  if (before === after) return { added: 0, removed: 0, diff: "", truncated: false };

  const a = before.length ? before.split("\n") : [];
  const b = after.length ? after.split("\n") : [];

  // New / deleted file: no LCS to compute.
  if (a.length === 0) return { added: b.length, removed: 0, diff: allLines(b, "+"), truncated: b.length > MAX_DIFF_OUTPUT_LINES };
  if (b.length === 0) return { added: 0, removed: a.length, diff: allLines(a, "-"), truncated: a.length > MAX_DIFF_OUTPUT_LINES };

  if (a.length > MAX_DIFF_LINES || b.length > MAX_DIFF_LINES) {
    return {
      added: Math.max(0, b.length - a.length),
      removed: Math.max(0, a.length - b.length),
      diff: `(berkas terlalu besar untuk diff rinci: ${a.length} → ${b.length} baris)`,
      truncated: true,
    };
  }

  const ops = lcsOps(a, b);
  let added = 0;
  let removed = 0;
  for (const op of ops) {
    if (op.type === "add") added++;
    else if (op.type === "del") removed++;
  }
  return { added, removed, diff: renderHunks(ops), truncated: false };
}

type Op = { type: "same" | "add" | "del"; line: string };

function allLines(lines: string[], prefix: string): string {
  const shown = lines.slice(0, MAX_DIFF_OUTPUT_LINES).map((l) => `${prefix}${l}`);
  if (lines.length > MAX_DIFF_OUTPUT_LINES) shown.push(`… (${lines.length - MAX_DIFF_OUTPUT_LINES} baris lagi)`);
  return shown.join("\n");
}

/** Classic LCS with a DP table. Safe for the sizes already capped above. */
function lcsOps(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  // dp[i][j] = LCS length of a[i..] and b[j..]
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: "same", line: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: "del", line: a[i] });
      i++;
    } else {
      ops.push({ type: "add", line: b[j] });
      j++;
    }
  }
  while (i < n) ops.push({ type: "del", line: a[i++] });
  while (j < m) ops.push({ type: "add", line: b[j++] });
  return ops;
}

/** Renders only the changed portions + a little context, not the whole file. */
function renderHunks(ops: Op[]): string {
  const keep = new Array<boolean>(ops.length).fill(false);
  ops.forEach((op, idx) => {
    if (op.type === "same") return;
    for (let k = Math.max(0, idx - CONTEXT_LINES); k <= Math.min(ops.length - 1, idx + CONTEXT_LINES); k++) keep[k] = true;
  });

  const out: string[] = [];
  let skipping = false;
  for (let idx = 0; idx < ops.length; idx++) {
    if (!keep[idx]) {
      if (!skipping) {
        out.push("@@");
        skipping = true;
      }
      continue;
    }
    skipping = false;
    const op = ops[idx];
    const prefix = op.type === "add" ? "+" : op.type === "del" ? "-" : " ";
    out.push(`${prefix}${op.line}`);
    if (out.length >= MAX_DIFF_OUTPUT_LINES) {
      out.push(`… (diff dipotong)`);
      break;
    }
  }
  return out.join("\n");
}
