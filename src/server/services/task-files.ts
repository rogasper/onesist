/**
 * Edit sendiri: reading and writing a file inside a run's worktree, and nothing outside it. The
 * writer is the user; after saving they validate again, the same as after an agent's work.
 */
import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { isInside } from "~/server/agent/workspace/location";
import { db } from "~/server/db/client";
import { taskRunRepos, taskRuns } from "~/server/db/schema";

const MAX_BYTES = 400_000;

/** The absolute path of a file inside one of the run's worktrees, or null when it is outside. */
function resolveInside(runId: string, repo: string, file: string): string | null {
  const row = db.select().from(taskRunRepos).where(and(eq(taskRunRepos.runId, runId), eq(taskRunRepos.repo, repo))).get();
  if (!row?.worktreePath) return null;
  if (!file || path.isAbsolute(file) || file.split(/[\\/]/).includes("..")) return null;
  const abs = path.resolve(row.worktreePath, file);
  return isInside(abs, row.worktreePath) ? abs : null;
}

export async function readRunFile(runId: string, repo: string, file: string): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const abs = resolveInside(runId, repo, file);
  if (!abs) return { ok: false, error: "Berkas di luar worktree run ini." };
  try {
    const stat = fs.statSync(abs);
    if (stat.size > MAX_BYTES) return { ok: false, error: "Berkas terlalu besar untuk diedit di sini." };
    return { ok: true, content: fs.readFileSync(abs, "utf-8") };
  } catch {
    return { ok: false, error: "Berkas tidak bisa dibaca." };
  }
}

export async function writeRunFile(runId: string, repo: string, file: string, content: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, runId)).get();
  if (!run) return { ok: false, error: "Run tidak ditemukan." };
  if (!["in_review", "failed"].includes(run.state)) return { ok: false, error: "Run ini sedang berjalan; edit setelah agen selesai." };
  const abs = resolveInside(runId, repo, file);
  if (!abs) return { ok: false, error: "Berkas di luar worktree run ini." };
  if (Buffer.byteLength(content, "utf-8") > MAX_BYTES) return { ok: false, error: "Isi berkas terlalu besar." };
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf-8");
  return { ok: true };
}
