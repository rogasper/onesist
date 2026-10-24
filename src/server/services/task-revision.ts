/**
 * A reviewed run goes back to its agent: the user's comments and chosen AI findings become one
 * message in the run's thread, and the revision number goes up. Discarding ends the run without
 * touching its worktrees.
 */
import { eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { taskRuns, tasks } from "~/server/db/schema";
import { promoteQueued } from "./task-runs";

const MAX_ITEMS = 50;

export interface RevisionComment {
  file: string;
  line: number | null;
  text: string;
}

export interface RevisionFinding {
  file: string;
  line: number | null;
  message: string;
}

const where = (file: string, line: number | null) => (line ? `${file}:${line}` : file);

/** The message the run's thread receives. Pure, so the wording can be tested. */
export function buildRevisionMessage(input: { comments: RevisionComment[]; findings: RevisionFinding[] }): string {
  const lines = [
    "Hasil tinjauan. Perbaiki hal-hal berikut di folder kerja yang sama, lalu laporkan lagi dengan blok onesist-report.",
    "",
  ];
  if (input.comments.length) {
    lines.push("Komentar dari reviewer:");
    for (const c of input.comments) lines.push(`- ${where(c.file, c.line)}: ${c.text}`);
    lines.push("");
  }
  if (input.findings.length) {
    lines.push("Temuan AI yang dipilih untuk diperbaiki:");
    for (const f of input.findings) lines.push(`- ${where(f.file, f.line)}: ${f.message}`);
    lines.push("");
  }
  lines.push("Jangan commit. Biarkan perubahan di working tree.");
  return lines.join("\n");
}

function cleanComments(raw: unknown): RevisionComment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
    .map((c) => ({
      file: typeof c.file === "string" ? c.file.trim() : "",
      line: Number.isInteger(c.line) && (c.line as number) > 0 ? (c.line as number) : null,
      text: typeof c.text === "string" ? c.text.trim() : "",
    }))
    .filter((c) => c.file && c.text)
    .slice(0, MAX_ITEMS);
}

function cleanFindings(raw: unknown): RevisionFinding[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === "object")
    .map((f) => ({
      file: typeof f.file === "string" ? f.file.trim() : "",
      line: Number.isInteger(f.line) && (f.line as number) > 0 ? (f.line as number) : null,
      message: typeof f.message === "string" ? f.message.trim() : "",
    }))
    .filter((f) => f.file && f.message)
    .slice(0, MAX_ITEMS);
}

export type RevisionResult = { ok: true; revision: number; text: string } | { ok: false; status: number; error: string };

const REVIEWABLE = ["in_review", "failed"];

export async function requestRevision(runId: string, input: { comments: unknown; findings: unknown }): Promise<RevisionResult> {
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, runId)).get();
  if (!run) return { ok: false, status: 404, error: "Run tidak ditemukan." };
  if (!REVIEWABLE.includes(run.state)) return { ok: false, status: 409, error: "Run ini tidak bisa direvisi sekarang." };
  const comments = cleanComments(input.comments);
  const findings = cleanFindings(input.findings);
  if (comments.length + findings.length === 0) return { ok: false, status: 400, error: "Tulis komentar atau pilih temuan dulu." };

  const now = new Date().toISOString();
  const revision = run.revision + 1;
  db.update(taskRuns).set({ state: "running", revision, error: null, endedAt: null, updatedAt: now }).where(eq(taskRuns.id, runId)).run();
  db.update(tasks).set({ status: "in_progress", updatedAt: now }).where(eq(tasks.id, run.taskId)).run();
  return { ok: true, revision, text: buildRevisionMessage({ comments, findings }) };
}

export async function discardRun(runId: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const run = db.select().from(taskRuns).where(eq(taskRuns.id, runId)).get();
  if (!run) return { ok: false, status: 404, error: "Run tidak ditemukan." };
  const discardable = [...REVIEWABLE, "validating", "queued"];
  if (!discardable.includes(run.state)) return { ok: false, status: 409, error: "Run ini tidak bisa dibuang sekarang." };
  const now = new Date().toISOString();
  db.update(taskRuns).set({ state: "discarded", endedAt: now, updatedAt: now }).where(eq(taskRuns.id, runId)).run();
  db.update(tasks).set({ status: "todo", updatedAt: now }).where(eq(tasks.id, run.taskId)).run();
  void promoteQueued(run.projectId).catch((err) => console.error("[task-revision] promote failed:", err));
  return { ok: true };
}
