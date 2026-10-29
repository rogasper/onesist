/**
 * Ulangi: a failed run goes back to its agent in the same thread and worktree. A failed check
 * sends its output; any other failure sends the reason the run stopped.
 */
import { eq } from "drizzle-orm";
import { enqueue, kick } from "~/server/agent/queue";
import { db } from "~/server/db/client";
import { taskRuns, tasks } from "~/server/db/schema";
import type { RunValidation } from "~/shared/types";

const TAIL_CHARS = 1_500;

export function buildRetryMessage(input: { error: string | null; validation: RunValidation | null }): string {
  const lines = ["Perbaiki masalah berikut di folder kerja yang sama, lalu laporkan lagi dengan blok onesist-report.", ""];
  const failed = input.validation?.checks.filter((c) => !c.ok) ?? [];
  if (failed.length > 0) {
    lines.push("Cek yang gagal:");
    for (const c of failed) {
      lines.push(`- ${c.name} (${c.repo}), perintah \`${c.command}\`, exit ${c.exitCode ?? "tidak diketahui"}:`);
      lines.push("```", c.tail.slice(-TAIL_CHARS), "```");
    }
  } else {
    lines.push(`Run sebelumnya berhenti: ${input.error ?? "sebab tidak diketahui"}.`);
  }
  lines.push("", "Jangan commit. Biarkan perubahan di working tree.");
  return lines.join("\n");
}

export async function retryRun(runId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, runId)).get();
  if (!run) return { ok: false, status: 404, error: "Run tidak ditemukan." };
  if (run.state !== "failed") return { ok: false, status: 409, error: "Hanya run yang gagal bisa diulang." };
  if (!run.threadId) return { ok: false, status: 409, error: "Run ini belum punya thread untuk dilanjutkan." };

  const validation = run.validationJson ? (JSON.parse(run.validationJson) as RunValidation) : null;
  const now = new Date().toISOString();
  db.update(taskRuns).set({ state: "running", error: null, endedAt: null, updatedAt: now }).where(eq(taskRuns.id, runId)).run();
  db.update(tasks).set({ status: "in_progress", updatedAt: now }).where(eq(tasks.id, run.taskId)).run();
  enqueue(run.threadId, [buildRetryMessage({ error: run.error, validation })]);
  void kick(run.threadId);
  return { ok: true };
}
