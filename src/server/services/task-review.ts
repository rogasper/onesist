/**
 * The AI reviewer: a read-only chat thread that reads a run's changes and answers with findings.
 * It can never write (permission mode `readonly`), and its findings are only shown; nothing
 * applies them automatically.
 */
import { eq } from "drizzle-orm";
import { createThread, getThread, listMessages, messageText, parseParts } from "~/server/agent/store";
import { db } from "~/server/db/client";
import { taskRunRepos, taskRuns, tasks } from "~/server/db/schema";
import { parseReviewFindings, type ReviewFinding } from "~/lib/run-review";
import { getExecSettings } from "./exec-settings";

export function buildReviewPrompt(input: { title: string; code: string | null; criteria: string[]; changed: string[] }): string {
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- (tidak ada)");
  return [
    `Tinjau perubahan untuk task ${input.code ?? input.title}: ${input.title}.`,
    "",
    "Berkas yang berubah:",
    list(input.changed),
    "",
    "Acceptance criteria:",
    list(input.criteria),
    "",
    "Periksa: fungsi atau helper baru yang sebenarnya sudah ada di repo (cari dulu sebelum menyetujui), pelanggaran AGENTS.md atau CLAUDE.md, bug yang jelas, dan kriteria yang belum terlihat terpenuhi.",
    "JANGAN mengubah berkas apa pun. Hanya baca.",
    "",
    "Jawab dengan tepat satu blok ```onesist-review``` berisi JSON array. Setiap temuan:",
    '{"file": "input/code/nama/src/berkas.ts", "line": 12, "severity": "info|warn|error", "message": "...", "suggestion": "...", "relatedSymbol": "nama yang mirip"}',
    "Jika tidak ada temuan, tulis blok dengan array kosong.",
  ].join("\n");
}

export type ReviewStart = { ok: true; threadId: string; title: string; text: string } | { ok: false; status: number; error: string };

export async function startReview(runId: string, opts: { reviewerProviderId?: string | null } = {}): Promise<ReviewStart> {
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, runId)).get();
  if (!run) return { ok: false, status: 404, error: "Run tidak ditemukan." };
  const task = db.select().from(tasks).where(eq(tasks.id, run.taskId)).get();
  if (!task) return { ok: false, status: 404, error: "Task tidak ditemukan." };

  const settings = getExecSettings(run.projectId);
  const providerId = opts.reviewerProviderId ?? settings.reviewerProviderId ?? settings.execProviderId;
  const repos = db.select().from(taskRunRepos).where(eq(taskRunRepos.runId, runId)).all();
  const changed = repos.map((r: typeof taskRunRepos.$inferSelect) => `${r.repo}${r.branch ? ` (branch ${r.branch})` : ""}`);
  const criteria: string[] = (() => {
    try {
      const v: unknown = JSON.parse(task.acceptanceCriteriaJson ?? "[]");
      return Array.isArray(v) ? v.filter((c): c is string => typeof c === "string") : [];
    } catch {
      return [];
    }
  })();
  const title = `Tinjau · ${task.code ?? task.title}`;
  const thread = createThread({
    projectId: run.projectId,
    title,
    mode: "agent",
    providerId,
    model: settings.reviewerModel ?? settings.execModel,
    permissionMode: "readonly",
  });
  db.update(taskRuns).set({ reviewerThreadId: thread.id, updatedAt: new Date().toISOString() }).where(eq(taskRuns.id, runId)).run();
  const text = buildReviewPrompt({ title: task.title, code: task.code, criteria, changed });
  return { ok: true, threadId: thread.id, title, text };
}

export async function readReview(runId: string, threadId: string): Promise<{ ok: true; findings: ReviewFinding[] } | { ok: false; status: number; error: string }> {
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, runId)).get();
  if (!run || run.reviewerThreadId !== threadId || !getThread(threadId)) return { ok: false, status: 404, error: "Tinjauan tidak ditemukan." };
  const last = listMessages(threadId).filter((m) => m.role === "assistant").at(-1);
  const parsed = parseReviewFindings(last ? messageText(parseParts(last.contentJson)) : "");
  if (!parsed.ok) return { ok: false, status: 422, error: parsed.error };
  db.update(taskRuns).set({ reviewJson: JSON.stringify({ threadId, findings: parsed.findings }), updatedAt: new Date().toISOString() }).where(eq(taskRuns.id, runId)).run();
  return { ok: true, findings: parsed.findings };
}


