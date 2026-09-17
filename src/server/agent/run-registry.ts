/**
 * Run registry + approval waiting (FR-E4, FR-K6).
 *
 * Design decision worth recording: approvals are managed **server-side**.
 * The AI SDK offers a client-driven path (stream pauses, client
 * sends back a `tool-approval-response`, the server resumes via
 * `lastAssistantMessageIsCompleteWithApprovalResponses`). We chose the server
 * path because Onesist is a local desktop app with a single client:
 *
 *  - a single streaming request, no need to reassemble message parts in the UI
 *  - decisions stay on the server, so nothing can be forged from the WebView
 *  - the UI only needs to send one POST
 *
 * Consequence to be aware of: if the app is closed while an approval is
 * pending, that run is lost (marked `interrupted` on the next startup).
 * The AI SDK's client-driven path can be adopted later if we want approvals
 * that survive a restart.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { chatRuns } from "~/server/db/schema";
import type { RunStatus } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// HMAC secret for approvals (FR-K6)
// ─────────────────────────────────────────────────────────────────────────────

let cachedSecret: string | null = null;

function secretPath(): string {
  const dbPath = process.env.SA_DB_PATH ? path.resolve(process.env.SA_DB_PATH) : path.resolve(process.cwd(), "data.db");
  return path.join(path.dirname(dbPath), "agent-approval.secret");
}

/**
 * Random per-installation secret, created once then reused. The AI SDK uses it
 * to sign every approval request and verify it on replay, so approvals cannot
 * be forged by the client (spike T3).
 */
export function getApprovalSecret(): string {
  if (cachedSecret) return cachedSecret;
  if (process.env.SA_AGENT_APPROVAL_SECRET) {
    cachedSecret = process.env.SA_AGENT_APPROVAL_SECRET;
    return cachedSecret;
  }
  const file = secretPath();
  try {
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, "utf-8").trim();
      if (existing.length >= 32) {
        cachedSecret = existing;
        return cachedSecret;
      }
    }
    const fresh = crypto.randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, fresh, { encoding: "utf-8", mode: 0o600 });
    cachedSecret = fresh;
    return cachedSecret;
  } catch {
    // If the filesystem is not writable, still run with a session secret —
    // approvals keep working, they just don't survive restarts.
    cachedSecret = crypto.randomBytes(32).toString("hex");
    return cachedSecret;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Run state
// ─────────────────────────────────────────────────────────────────────────────

export interface ActiveRun {
  runId: string;
  threadId: string;
  projectId: string;
  abort: AbortController;
  status: RunStatus;
  stepCount: number;
  startedAt: number;
  /** Approval currently awaiting the user's decision, keyed by `toolCallId`. */
  pending: Map<string, PendingApproval>;
  /** Permission decisions per `toolCallId` — "auto" | "approved" | "denied".
   *  Kept so history can explain WHY a write went through
   *  unprompted (FR-B4), which cannot be reconstructed after the run closes. */
  decisions: Map<string, string>;
}

export interface PendingApproval {
  toolCallId: string;
  name: string;
  /** Argument summary shown on the approval card. */
  preview: string;
  reason?: string;
  resolve: (decision: "approved" | "denied") => void;
  timer: ReturnType<typeof setTimeout>;
}

const RUNS = new Map<string, ActiveRun>();

export const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

export function createRun(opts: { runId: string; threadId: string; projectId: string; startedAt?: string }): ActiveRun {
  const run: ActiveRun = {
    runId: opts.runId,
    threadId: opts.threadId,
    projectId: opts.projectId,
    abort: new AbortController(),
    status: "running",
    stepCount: 0,
    startedAt: Date.now(),
    pending: new Map(),
    decisions: new Map(),
  };
  RUNS.set(opts.runId, run);
  try {
    db.insert(chatRuns)
      .values({
        id: opts.runId,
        threadId: opts.threadId,
        status: "running",
        stepCount: 0,
        startedAt: opts.startedAt ?? new Date().toISOString(),
      })
      .run();
  } catch {
    /* run bookkeeping must never be what fails a conversation */
  }
  return run;
}

export function getRun(runId: string): ActiveRun | undefined {
  return RUNS.get(runId);
}

export function getRunForThread(threadId: string): ActiveRun | undefined {
  for (const run of RUNS.values()) if (run.threadId === threadId && run.status === "running") return run;
  return undefined;
}

export function listActiveRuns(): { runId: string; threadId: string; stepCount: number }[] {
  return [...RUNS.values()]
    .filter((r) => r.status === "running")
    .map((r) => ({ runId: r.runId, threadId: r.threadId, stepCount: r.stepCount }));
}

function persistStatus(runId: string, status: RunStatus, error?: string) {
  try {
    db.update(chatRuns)
      .set({ status, error: error ?? null, finishedAt: status === "running" ? null : new Date().toISOString() })
      .where(eq(chatRuns.id, runId))
      .run();
  } catch {
    /* idem */
  }
}

export function persistStepCount(runId: string, stepCount: number) {
  try {
    db.update(chatRuns).set({ stepCount }).where(eq(chatRuns.id, runId)).run();
  } catch {
    /* idem */
  }
}

export function finishRun(runId: string, status: RunStatus, error?: string): void {
  const run = RUNS.get(runId);
  if (run) {
    run.status = status;
    for (const pending of run.pending.values()) {
      clearTimeout(pending.timer);
      pending.resolve("denied");
    }
    run.pending.clear();
  }
  persistStatus(runId, status, error);
  RUNS.delete(runId);
}

/** Stops a run: cancels the stream, rejects pending approvals,
 *  and kills the child process via signal. */
export function stopRun(runId: string): boolean {
  const run = RUNS.get(runId);
  if (!run) return false;
  run.status = "stopped";
  run.abort.abort();
  for (const pending of run.pending.values()) {
    clearTimeout(pending.timer);
    pending.resolve("denied");
  }
  run.pending.clear();
  persistStatus(runId, "stopped");
  RUNS.delete(runId);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval
// ─────────────────────────────────────────────────────────────────────────────

/** Waits for the user's decision on a tool call. Timeout resolves to `denied` —
 *  hanging is safer than executing without consent. */
export function awaitApproval(
  runId: string,
  info: { toolCallId: string; name: string; preview: string; reason?: string },
): Promise<"approved" | "denied"> {
  const run = RUNS.get(runId);
  if (!run) return Promise.resolve("denied");
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      run.pending.delete(info.toolCallId);
      run.decisions.set(info.toolCallId, "denied-timeout");
      resolve("denied");
    }, APPROVAL_TIMEOUT_MS);
    run.pending.set(info.toolCallId, { ...info, resolve, timer });
  });
}

export function resolveApproval(runId: string, toolCallId: string, decision: "approved" | "denied"): boolean {
  const run = RUNS.get(runId);
  const pending = run?.pending.get(toolCallId);
  if (!run || !pending) return false;
  clearTimeout(pending.timer);
  run.pending.delete(toolCallId);
  run.decisions.set(toolCallId, decision);
  pending.resolve(decision);
  return true;
}

/** Records permission decisions that do NOT go through the approval card (auto mode,
 *  readonly mode) so history can still explain why. */
export function recordApprovalDecision(runId: string, toolCallId: string, decision: string): void {
  RUNS.get(runId)?.decisions.set(toolCallId, decision);
}

export function getApprovalDecision(runId: string, toolCallId: string): string | null {
  return RUNS.get(runId)?.decisions.get(toolCallId) ?? null;
}

export function listPendingApprovals(runId: string) {
  const run = RUNS.get(runId);
  if (!run) return [];
  return [...run.pending.values()].map(({ toolCallId, name, preview, reason }) => ({ toolCallId, name, preview, reason }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Startup hygiene
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marks runs still `running` as `interrupted`. Called when the server
 * boots: a freshly started process cannot still be running a run from a
 * previous session, and leaving them `running` makes the UI show an agent
 * that only appears to still be working.
 */
export function recoverInterruptedRuns(): number {
  try {
    const stale = db.select().from(chatRuns).where(eq(chatRuns.status, "running")).all();
    if (!stale.length) return 0;
    for (const row of stale) {
      db.update(chatRuns)
        .set({ status: "interrupted", finishedAt: new Date().toISOString(), error: "Aplikasi ditutup saat run berjalan." })
        .where(and(eq(chatRuns.id, row.id), eq(chatRuns.status, "running")))
        .run();
    }
    return stale.length;
  } catch {
    return 0;
  }
}
