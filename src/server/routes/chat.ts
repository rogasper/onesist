/**
 * Chat endpoint (FR-B, FR-E4).
 *
 * Transport: `POST /api/chat/threads/:id/messages` returns the `Response` from
 * `createUIMessageStreamResponse()` — so chat does NOT use the `eventBus` +
 * `/api/events` path like the old CLI route. That `Response` fits the `ApiHandler`
 * signature in `src/server/http/router.ts`, and removes the 300-event ring buffer
 * replay problem because history is persisted in the DB.
 */
import { json } from "../http/response";
import { Router } from "../http/router";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "~/server/db/client";
import { chatThreads, projects } from "~/server/db/schema";
import { createUIMessageStreamResponse, toUIMessageStream, type UIMessage } from "~/server/agent/ai";
import { makeRunId, startTurn } from "~/server/agent/agent";
import {
  ENV_PROVIDER_ID,
  envBootstrapProvider,
  isProviderUsable,
  listProviders,
  maskApiKey,
  redactSecrets,
  resolveProvider,
} from "~/server/agent/config";
import { buildSystemPrompt, scanInventory } from "~/server/agent/prompt";
import { getIndexStatus, indexProject } from "~/server/agent/index/service";
import { finishRun, getRunForThread, listPendingApprovals, resolveApproval, stopRun } from "~/server/agent/run-registry";
import {
  addTokens,
  appendMessage,
  autoTitleFrom,
  createThread,
  deleteThread,
  getThread,
  listMessages,
  listThreadFiles,
  listThreadReads,
  listThreads,
  listToolCalls,
  newId,
  recordThreadRead,
  recordToolCall,
  searchChatMessages,
  threadTokens,
  getAppSubagents,
  getAppSubagent,
  createAppSubagent,
  updateAppSubagent,
  deleteAppSubagent,
  getAppSubagentByName,
  setThreadSummary,
  toUIMessages,
  updateThread,
  upsertThreadFile,
} from "~/server/agent/store";
import { createStreamTiming, tapStream } from "~/server/agent/stream-timing";
import { getApprovalDecision } from "~/server/agent/run-registry";
import { resolveChatActions } from "~/server/agent/actions";
import { resolveSkills, skillSummaries } from "~/server/agent/skills";
import { SUBAGENT_LIMITS, SUBAGENT_TOOLS, parseSubagent, resolveSubagents, subagentSummaries } from "~/server/agent/subagents";
import {
  MEMORY_LIMITS,
  appendMemory,
  composeMemoryForPrompt,
  deleteMemoryEntry,
  readMemory,
  writeMemoryContent,
  type MemoryScope,
} from "~/server/agent/memory";
import { estimateCost } from "~/server/agent/cost";
import { getSetting, normalizeAgentMaxSteps } from "~/server/agent/settings";
import type { FileChange } from "~/server/agent/tools";
import { normalizeMaxSteps } from "~/server/agent/types";

export const router = new Router();

function publicThread(row: NonNullable<ReturnType<typeof getThread>>) {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    mode: row.mode,
    providerId: row.providerId,
    model: row.model,
    permissionMode: row.permissionMode,
    maxSteps: row.maxSteps,
    tokensUsed: row.tokensUsed,
    archived: row.archived,
    hasSummary: !!row.summary?.trim(),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function projectRootOf(projectId: string): string | null {
  const row = db.select().from(projects).where(eq(projects.id, projectId)).get() as { rootPath?: string | null } | undefined;
  return row?.rootPath?.trim() || null;
}

/** Tool name from a UIMessage part. In UI parts the tool name is EMBEDDED in
 *  `type` (`tool-write_file`), not in a `toolName` field — except dynamic tools. */
function toolNameOf(part: any): string {
  const type = String(part?.type ?? "");
  if (type === "dynamic-tool") return part.toolName ?? "tool";
  if (type.startsWith("tool-")) return type.slice("tool-".length);
  return part?.toolName ?? type ?? "tool";
}

/** Tool result excerpt for storing in `chat_tool_calls`. Tool results can be
 *  tens of KB (file contents, bash output) and need not be stored whole. */
function previewOf(value: unknown): string | null {
  if (value == null) return null;
  const text = typeof value === "string" ? value : (() => {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  })();
  return text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
}

/**
 * Files the thread read whose content no longer matches what the agent saw
 * (FR-C12). Recomputed on every thread load rather than pushed over SSE: the
 * transcript is DB-driven, and a comparison against the disk is deterministic —
 * an event-based version would need replay to survive a restart, and would still
 * have to answer the same question the first time a thread is opened.
 */
function staleReadsFor(threadId: string, root: string | null): { path: string; readAt: string | null }[] {
  if (!root) return [];
  const out: { path: string; readAt: string | null }[] = [];
  for (const read of listThreadReads(threadId)) {
    try {
      const abs = path.join(root, read.path);
      // A deleted file is a change too — the agent's context points at nothing.
      const current = fs.existsSync(abs) ? hashFileContent(fs.readFileSync(abs, "utf-8")) : null;
      if (current !== read.hash) out.push({ path: read.path, readAt: read.readAt ?? null });
    } catch {
      /* unreadable file: not worth reporting as a stale read */
    }
  }
  // Bounded: a long thread may have read hundreds of files, and the transcript
  // only needs to show that context went stale, not an exhaustive inventory.
  return out.slice(0, 50);
}

/** Content hash used for both sides of the FR-C12 comparison. Must stay in step
 *  with `hashContent` in `agent/tools.ts` — the stored value came from there. */
function hashFileContent(text: string): string {
  return createHash("sha256").update(text, "utf-8").digest("hex").slice(0, 16);
}

// ── Thread ───────────────────────────────────────────────────────────────────

router.get("chat/threads", async (ctx) => {
  const projectId = ctx.query.get("projectId");
  if (!projectId) return json({ error: "projectId wajib." }, 400);
  const includeArchived = ctx.query.get("archived") === "1";
  return json({ threads: listThreads(projectId, includeArchived).map(publicThread) });
});

router.post("chat/threads", async (ctx) => {
  const body = await ctx.body();
  const projectId = String(body.projectId ?? "");
  if (!projectId) return json({ error: "projectId wajib." }, 400);
  if (!projectRootOf(projectId)) {
    return json({ error: "Project tidak ditemukan atau belum punya root path." }, 404);
  }
  const thread = createThread({
    projectId,
    title: body.title ? String(body.title) : null,
    // Validated rather than cast: an unknown mode used to reach the DB and the
    // runtime, which then silently fell back to agent behavior.
    mode: body.mode === "ask" || body.mode === "plan" ? body.mode : "agent",
    providerId: body.providerId ? String(body.providerId) : null,
    model: body.model ? String(body.model) : null,
    permissionMode: (body.permissionMode as any) ?? "ask",
    // A thread that does not specify its own limit inherits the application
    // default (FR-L7), which is why that preference exists at all.
    maxSteps: typeof body.maxSteps === "number" ? normalizeMaxSteps(body.maxSteps) : normalizeAgentMaxSteps(getSetting("agentMaxSteps")),
  });
  return json({ thread: publicThread(thread) }, 201);
});

router.get("chat/threads/:id", async (ctx) => {
  const thread = getThread(ctx.params.id);
  if (!thread) return json({ error: "Thread tidak ditemukan." }, 404);
  const messages = listMessages(thread.id);
  const provider = resolveProvider(thread.providerId);
  const root = projectRootOf(thread.projectId);
  return json({
    thread: publicThread(thread),
    messages: toUIMessages(messages),
    files: listThreadFiles(thread.id),
    toolCalls: listToolCalls(thread.id).map((t) => ({
      toolCallId: t.toolCallId,
      name: t.name,
      isError: t.isError,
      approval: t.approval,
      startedAt: t.startedAt,
      endedAt: t.endedAt,
    })),
    staleReads: staleReadsFor(thread.id, root),
    // Usage + cost (Fase 5.5). The price comes from the provider the user
    // configured; without one the estimate is null and the UI shows tokens only.
    usage: (() => {
      const tokens = threadTokens(thread.id);
      const estimate = provider
        ? estimateCost({
            inputTokens: tokens.in,
            outputTokens: tokens.out,
            inputPricePerMTok: (provider as any).inputPricePerMTok ?? null,
            outputPricePerMTok: (provider as any).outputPricePerMTok ?? null,
          })
        : null;
      return { tokensIn: tokens.in, tokensOut: tokens.out, estimate };
    })(),
    provider: provider
      ? { id: provider.id, name: provider.name, apiKeyMasked: maskApiKey(provider.apiKey), source: provider.source, model: provider.model }
      : null,
  });
});

router.put("chat/threads/:id", async (ctx) => {
  const thread = getThread(ctx.params.id);
  if (!thread) return json({ error: "Thread tidak ditemukan." }, 404);
  const body = await ctx.body();
  const patch: Partial<typeof chatThreads.$inferInsert> = {};
  if (body.title !== undefined) patch.title = body.title ? String(body.title) : null;
  if (body.mode === "ask" || body.mode === "agent" || body.mode === "plan") patch.mode = body.mode;
  // `no-shell` was missing from this list since the mode was introduced (Fase 6):
  // picking "Tanpa shell" in the composer changed the label but the PUT was
  // silently ignored, so the thread kept its old permission mode.
  if (
    body.permissionMode === "ask" ||
    body.permissionMode === "auto" ||
    body.permissionMode === "no-shell" ||
    body.permissionMode === "readonly"
  ) {
    patch.permissionMode = body.permissionMode;
  }
  if (body.providerId !== undefined) patch.providerId = body.providerId ? String(body.providerId) : null;
  if (body.model !== undefined) patch.model = body.model ? String(body.model).trim() : null;
  if (body.archived !== undefined) patch.archived = !!body.archived;
  if (body.maxSteps !== undefined) patch.maxSteps = normalizeMaxSteps(Number(body.maxSteps));
  if (body.clearSummary === true) patch.summary = null;
  updateThread(thread.id, patch);
  return json({ thread: publicThread(getThread(thread.id)!) });
});

router.delete("chat/threads/:id", async (ctx) => {
  const thread = getThread(ctx.params.id);
  if (!thread) return json({ error: "Thread tidak ditemukan." }, 404);
  deleteThread(thread.id);
  return json({ deleted: true });
});

router.get("chat/threads/:id/files", async (ctx) => {
  const thread = getThread(ctx.params.id);
  if (!thread) return json({ error: "Thread tidak ditemukan." }, 404);
  return json({ files: listThreadFiles(thread.id) });
});

// ── Cross-thread search (Fase 5.3, FR-B17) ─────────────────────────────────

/** Message search across every thread of one project. Project-scoped because
 *  that is the unit the chat panel lives in; the FTS index itself carries the
 *  thread id, so widening it to all projects later is a query change, not a
 *  schema change. */
router.get("chat/search", async (ctx) => {
  const projectId = ctx.query.get("projectId");
  if (!projectId) return json({ error: "projectId wajib." }, 400);
  const q = (ctx.query.get("q") ?? "").trim();
  // Below two characters every message matches, which is noise, not a result.
  if (q.length < 2) return json({ hits: [] });
  const limit = Math.min(50, Math.max(1, Number(ctx.query.get("limit") ?? 20) || 20));
  return json({ hits: searchChatMessages(projectId, q, limit) });
});

// ── Send message → UI message stream ───────────────────────────────────────

router.post("chat/threads/:id/messages", async (ctx) => {
  const thread = getThread(ctx.params.id);
  if (!thread) return json({ error: "Thread tidak ditemukan." }, 404);

  const root = projectRootOf(thread.projectId);
  if (!root) return json({ error: "Project belum punya root path." }, 400);

  const provider = resolveProvider(thread.providerId);
  if (!provider) {
    return json(
      {
        error:
          "Belum ada provider yang bisa dipakai. Tambahkan konfigurasi provider Anda sendiri (BYOK) lewat " +
          "pengaturan provider — dari pemilih model di kolom pesan, atau ikon gear di panel chat.",
      },
      400,
    );
  }

  const body = await ctx.body();
  const uiMessages = (Array.isArray(body.messages) ? body.messages : []) as UIMessage[];
  if (!uiMessages.length) return json({ error: "messages kosong." }, 400);

  // The user message is persisted BEFORE the run starts, so it survives even if
  // the run fails or the app closes midway.
  const lastUser = [...uiMessages].reverse().find((m) => m.role === "user");
  if (lastUser) {
    const text = (lastUser.parts ?? [])
      .map((p: any) => (p?.type === "text" ? p.text : ""))
      .join(" ")
      .trim();
    if (text) {
      appendMessage({ threadId: thread.id, role: "user", parts: lastUser.parts, id: lastUser.id });
      if (!thread.title) updateThread(thread.id, { title: autoTitleFrom(text) });
    }
  }

  const current = getThread(thread.id)!;
  const system = buildSystemPrompt({
    projectName: (db.select().from(projects).where(eq(projects.id, current.projectId)).get() as any)?.name ?? "Project",
    root,
    mode: current.mode as any,
    permissionMode: current.permissionMode as any,
    inventory: scanInventory(root),
    summary: current.summary,
    // Progressive disclosure (FR-F2): the prompt carries name + description only.
    // The body is fetched with `skill_read` when the task actually needs it.
    skills: skillSummaries(resolveSkills(root)),
    // Both scopes, project last (FR-H1..H3): the more specific one should be the
    // final thing the model reads when the two disagree.
    memory: composeMemoryForPrompt(root),
    // Subagents are advertised by name + description only; the callable list is
    // resolved again when `task` runs, so a definition added mid-conversation is
    // usable without a restart.
    subagents: subagentSummaries(resolveSubagents(root, getAppSubagents()).subagents),
  });

  const runId = makeRunId();
  let errorText: string | null = null;

  // Changed-file ledger (FR-C3, FR-C4) and duration measurement (FR-B5).
  // Both MUST be attached here: without `onFileChange` the files do get
  // written to disk, but nothing records them, so the "changed files" card
  // stays empty and the artifact tab has no trace at all.
  const diffsByPath = new Map<string, string>();
  const onFileChange = (change: FileChange) => {
    diffsByPath.set(change.path, change.diff);
    upsertThreadFile({
      threadId: current.id,
      path: change.path,
      route: change.route,
      op: change.op,
      source: change.source,
      linesAdded: change.linesAdded,
      linesRemoved: change.linesRemoved,
      diff: change.diff,
    });
  };

  // Stream parts carry no persistent timestamps, so the thinking phase and each
  // tool's duration are measured as their parts pass by (FR-B5). True failure
  // detection is here too: only the `error` part — not `tool-error`, which is
  // a normal result the model reads (FR-D7, FR-B15).
  const timing = createStreamTiming({
    onFatalError: (err) => {
      errorText = redactSecrets(err, provider.apiKey);
      timing.fatalError = errorText;
    },
  });

  let result;
  try {
    result = await startTurn({
      runId,
      threadId: current.id,
      projectId: current.projectId,
      root,
      provider,
      permissionMode: current.permissionMode as any,
      maxSteps: normalizeMaxSteps(current.maxSteps),
      mode: current.mode as any,
      system,
      messages: uiMessages,
      summary: current.summary,
      onFileChange,
      // FR-C12: remember what the agent has seen so a later external edit can be
      // reported against it.
      onFileRead: ({ path: readPath, hash }) => {
        try {
          recordThreadRead({ threadId: current.id, path: readPath, hash });
        } catch (err) {
          console.error("[chat] failed to record file read:", err);
        }
      },
      onCompact: (info) => {
        // FR-B8/FR-B9: the summary is stored on the thread (not just in one
        // turn's memory) and the event is written as a marker message so it
        // stays visible after reload.
        setThreadSummary(current.id, info.summary);
        appendMessage({
          threadId: current.id,
          role: "system",
          kind: "compactNotice",
          parts: [
            {
              type: "data-notice",
              data: {
                kind: "compacted",
                estimatedBefore: info.estimatedBefore,
                estimatedAfter: info.estimatedAfter,
              },
            },
          ],
        });
      },
      onStepFinish: () => {
        /* step counting already handled by run-registry */
      },
    });
  } catch (err) {
    // Failure BEFORE the stream starts (e.g. incomplete provider config) still
    // throws; that is different from a mid-stream failure.
    finishRun(runId, "error", redactSecrets(err, provider.apiKey));
    return json({ error: redactSecrets(err, provider.apiKey) }, 400);
  }

  // Client disconnected: do not leave the run hanging as `running`.
  ctx.request.signal.addEventListener("abort", () => {
    finishRun(runId, "stopped", "Koneksi klien terputus.");
  });

  const stream = toUIMessageStream({
    stream: tapStream(result.stream, timing),
    originalMessages: uiMessages,
    // The reply message id is set by the server. Previously the id came from the
    // stream and could be EMPTY; an empty id as the `chat_messages` primary key
    // made the next reply fail to save (UNIQUE constraint) without any message.
    generateMessageId: () => newId("msg"),
    onError: (err: unknown) => {
      // Only prepare client-safe text (FR-K7: the provider responseBody can
      // contain API key fragments). Fatal status is decided by the `error` part
      // in `timing`, because this callback also fires for `tool-error`.
      return redactSecrets(err, provider.apiKey);
    },
    onFinish: async ({ messages, isAborted }: { messages: any[]; isAborted: boolean }) => {
      try {
        const assistant = [...(messages ?? [])].reverse().find((m) => m?.role === "assistant");
        if (assistant) {
          let inputTokens: number | null = null;
          let outputTokens: number | null = null;
          try {
            const usage: any = await result.usage;
            inputTokens = usage?.inputTokens ?? null;
            outputTokens = usage?.outputTokens ?? null;
          } catch {
            /* usage unavailable — no reason to fail the save */
          }
          const messageId = appendMessage({
            threadId: current.id,
            role: "assistant",
            parts: assistant.parts,
            id: typeof assistant.id === "string" ? assistant.id : undefined,
            providerId: provider.id,
            model: current.model ?? provider.model,
            inputTokens,
            outputTokens,
            reasoningMs: timing.reasoningMs,
            status: isAborted ? "aborted" : errorText ? "error" : "ok",
            error: errorText,
          }).id;
          if (inputTokens || outputTokens) addTokens(current.id, inputTokens ?? 0, outputTokens ?? 0);

          // Tool calls & their durations (FR-B4, FR-B5). This table was previously
          // never written, so step durations and per-tool diffs had no data
          // source at all.
          for (const part of assistant.parts ?? []) {
            const type = String(part?.type ?? "");
            const isToolPart = type === "dynamic-tool" || (type.startsWith("tool-") && !type.startsWith("tool-approval"));
            if (!isToolPart) continue;
            const toolCallId = part.toolCallId ?? part.id;
            if (!toolCallId) continue;
            const startedMs = timing.toolStart.get(toolCallId);
            const endedMs = timing.toolEnd.get(toolCallId);
            const args = part.input ?? part.args ?? null;
            const isError = part.state === "output-error" || !!part.errorText;
            const output = part.output ?? part.result;
            const path = typeof args?.path === "string" ? args.path : null;
            recordToolCall({
              threadId: current.id,
              messageId,
              toolCallId,
              name: toolNameOf(part),
              args,
              resultPreview: previewOf(output ?? part.errorText),
              isError,
              diff: path ? diffsByPath.get(path) ?? null : null,
              approval: getApprovalDecision(runId, toolCallId),
              startedAt: startedMs != null ? new Date(startedMs).toISOString() : null,
              endedAt: endedMs != null ? new Date(endedMs).toISOString() : null,
            });
          }
        }
      } catch (err) {
        // Never fail silently: this is what used to make replies vanish from
        // history without a trace.
        console.error("[chat] failed to persist assistant reply:", err);
      } finally {
        finishRun(runId, isAborted ? "stopped" : errorText ? "error" : "done", errorText ?? undefined);
      }
    },
  });

  return createUIMessageStreamResponse({ stream });
});


// ── File attachments ───────────────────────────────────────────────────────

/**
 * POST /api/chat/threads/:id/attachments — saves files the user attaches to
 * the conversation. Body: raw bytes, file name via `?filename=<base64>` (the
 * same pattern as FSD uploads, because `FormData` is not used in this app and
 * base64 in the query already works for non-ASCII file names).
 *
 * The file is placed INSIDE the workspace (`input/uploads/<thread>/`) for two
 * reasons: the agent can read it with `read_file` — so the untrusted-content
 * rules FR-K1 apply automatically — and this app's convention "documents live
 * on disk, the DB holds only metadata" is kept. The alternative of embedding
 * the file contents in the message was rejected: the content would then exist
 * only in the DB, invisible in the file explorer, and unreferenceable in later
 * messages.
 */
router.post("chat/threads/:id/attachments", async (ctx) => {
  const thread = getThread(ctx.params.id);
  if (!thread) return json({ error: "Thread tidak ditemukan." }, 404);
  const root = projectRootOf(thread.projectId);
  if (!root) return json({ error: "Project belum punya root path." }, 400);

  try {
    const filenameRaw = new URL(ctx.request.url).searchParams.get("filename") ?? "";
    let originalName = "";
    try {
      originalName = Buffer.from(filenameRaw, "base64").toString("utf-8");
    } catch {
      /* name unreadable — use the fallback name below */
    }
    const buf = Buffer.from(await ctx.request.arrayBuffer());
    if (!buf.length) return json({ error: "Berkas kosong." }, 400);
    if (buf.length > MAX_ATTACHMENT_BYTES) {
      return json({ error: `Berkas terlalu besar (maks ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB).` }, 413);
    }

    const dir = path.join(root, "input", "uploads", thread.id);
    fs.mkdirSync(dir, { recursive: true });
    const safe = safeFileName(originalName);
    let rel = `input/uploads/${thread.id}/${safe}`;
    let abs = path.join(dir, safe);
    for (let n = 2; fs.existsSync(abs) && n < 100; n++) {
      const ext = path.extname(safe);
      const stem = safe.slice(0, safe.length - ext.length);
      rel = `input/uploads/${thread.id}/${stem}-${n}${ext}`;
      abs = path.join(dir, `${stem}-${n}${ext}`);
    }
    fs.writeFileSync(abs, buf);
    return json({ path: rel, name: path.basename(rel), size: buf.length }, 201);
  } catch (e: any) {
    return json({ error: `Gagal menyimpan lampiran: ${e?.message ?? e}` }, 500);
  }
});

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Safe file name: no path components, no control characters, bounded length.
 *  The final path is still built from this name, so there is no way out of
 *  the attachment folder. */
export function safeFileName(name: string): string {
  const base = path.basename(name || "").replace(/[\u0000-\u001f/\\:*?"<>|]/g, "_").trim();
  const cleaned = base.replace(/^\.+/, "").slice(0, 120);
  return cleaned || "lampiran";
}

// Per-THREAD approvals. The client only knows the threadId, not the runId — and
// the runId is an internal detail the UI never needs. The running run for this
// thread is looked up in the registry.
router.get("chat/threads/:id/approvals", async (ctx) => {
  const thread = getThread(ctx.params.id);
  if (!thread) return json({ error: "Thread tidak ditemukan." }, 404);
  const run = getRunForThread(thread.id);
  if (!run) return json({ runId: null, approvals: [] });
  return json({ runId: run.runId, approvals: listPendingApprovals(run.runId) });
});

router.post("chat/threads/:id/approvals", async (ctx) => {
  const thread = getThread(ctx.params.id);
  if (!thread) return json({ error: "Thread tidak ditemukan." }, 404);
  const body = await ctx.body();
  const toolCallId = String(body.toolCallId ?? "");
  const decision = body.decision === "approved" || body.decision === "denied" ? body.decision : null;
  if (!toolCallId || !decision) return json({ error: "toolCallId dan decision wajib." }, 400);

  const run = getRunForThread(thread.id);
  if (!run) return json({ error: "Tidak ada run yang berjalan untuk percakapan ini." }, 404);
  const ok = resolveApproval(run.runId, toolCallId, decision);
  return json({ runId: run.runId, resolved: ok }, ok ? 200 : 404);
});

// ── Run control ────────────────────────────────────────────────────────────

router.post("chat/runs/:id/stop", async (ctx) => {
  const stopped = stopRun(ctx.params.id);
  return json({ stopped }, stopped ? 200 : 404);
});

router.post("chat/runs/:id/approve", async (ctx) => {
  const body = await ctx.body();
  const toolCallId = String(body.toolCallId ?? "");
  const decision = body.decision === "approved" || body.decision === "denied" ? body.decision : null;
  if (!toolCallId || !decision) return json({ error: "toolCallId dan decision wajib." }, 400);
  const ok = resolveApproval(ctx.params.id, toolCallId, decision);
  return json({ resolved: ok }, ok ? 200 : 404);
});

router.get("chat/runs/:id", async (ctx) => json({ approvals: listPendingApprovals(ctx.params.id) }));

// Agent memory for a project (FR-H1..H5). Read and written by the Memory panel;
// injected into every turn's system prompt by the messages route.
router.get("chat/memory", async (ctx) => {
  const projectId = ctx.query.get("projectId");
  if (!projectId) return json({ error: "projectId wajib." }, 400);
  const root = projectRootOf(projectId);
  if (!root) return json({ error: "Project tidak ditemukan atau belum punya root path." }, 404);
  const state = readMemory(root);
  return json({
    // The project path is shown relative so the user can find it in the workspace;
    // the global file deliberately lives outside the project.
    project: { ...state.project, path: ".agents/ONESIST.md" },
    global: state.global,
    limits: MEMORY_LIMITS,
  });
});

/** Shared validation for the three write shapes below. */
function memoryTarget(ctx: any): { root: string; scope: MemoryScope } | { error: string; status: number } {
  const projectId = ctx.query.get("projectId");
  if (!projectId) return { error: "projectId wajib.", status: 400 };
  const root = projectRootOf(projectId);
  if (!root) return { error: "Project tidak ditemukan atau belum punya root path.", status: 404 };
  const scope = ctx.query.get("scope");
  if (scope !== "project" && scope !== "global") return { error: 'scope harus "project" atau "global".', status: 400 };
  return { root, scope };
}

router.post("chat/memory", async (ctx) => {
  const target = memoryTarget(ctx);
  if ("error" in target) return json({ error: target.error }, target.status);
  const body = await ctx.body();
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) return json({ error: "text wajib." }, 400);
  try {
    const entry = appendMemory(target.root, target.scope, text);
    return json({ entry, ...readMemory(target.root) }, 201);
  } catch (err: any) {
    return json({ error: err?.message ?? "Gagal menyimpan catatan." }, 400);
  }
});

router.put("chat/memory", async (ctx) => {
  const target = memoryTarget(ctx);
  if ("error" in target) return json({ error: target.error }, target.status);
  const body = await ctx.body();
  if (typeof body.content !== "string") return json({ error: "content wajib." }, 400);
  writeMemoryContent(target.root, target.scope, body.content);
  return json(readMemory(target.root));
});

router.delete("chat/memory", async (ctx) => {
  const target = memoryTarget(ctx);
  if ("error" in target) return json({ error: target.error }, target.status);
  const removed = deleteMemoryEntry(target.root, target.scope, Number(ctx.query.get("index")));
  if (!removed) return json({ error: "Entri tidak ditemukan." }, 404);
  return json(readMemory(target.root));
});

// Index status and full reindex (FR-I7). The status is what the Settings panel
// polls while a build runs: `done`/`total` come from the in-memory progress of
// the running pass, `stats` from the tables.
router.get("chat/index", async (ctx) => {
  const projectId = ctx.query.get("projectId");
  if (!projectId) return json({ error: "projectId wajib." }, 400);
  const root = projectRootOf(projectId);
  if (!root) return json({ error: "Project tidak ditemukan atau belum punya root path." }, 404);
  return json(getIndexStatus(projectId));
});

router.post("chat/index", async (ctx) => {
  const projectId = ctx.query.get("projectId");
  if (!projectId) return json({ error: "projectId wajib." }, 400);
  const root = projectRootOf(projectId);
  if (!root) return json({ error: "Project tidak ditemukan atau belum punya root path." }, 404);
  const result = indexProject(projectId, root);
  return json({ ...result, ...getIndexStatus(projectId) });
});

// Subagents for a project (FR-G1, FR-G2, FR-G7). The list is the resolved view:
// project files beat app rows beat built-ins, and a definition that asks for a
// mutating tool is returned in `rejected` with the reason instead of being
// silently usable.
router.get("chat/subagents", async (ctx) => {
  const projectId = ctx.query.get("projectId");
  if (!projectId) return json({ error: "projectId wajib." }, 400);
  const root = projectRootOf(projectId);
  if (!root) return json({ error: "Project tidak ditemukan atau belum punya root path." }, 404);
  const resolved = resolveSubagents(root, getAppSubagents());
  return json({
    subagents: resolved.subagents.map((s) => ({
      name: s.name,
      description: s.description,
      tools: s.tools,
      source: s.source,
      maxSteps: s.maxSteps,
      /** Only app rows can be edited from the UI; the others are files/built-ins. */
      id: s.source === "app" ? getAppSubagents().find((r) => r.name === s.name)?.id ?? null : null,
    })),
    rejected: resolved.rejected,
    allowedTools: SUBAGENT_TOOLS,
    limits: { maxSteps: SUBAGENT_LIMITS.maxSteps, concurrency: SUBAGENT_LIMITS.concurrency },
  });
});

/** Shared validation for writes: the definition must survive the same parse the
 *  runtime uses, so the UI cannot store something `task` would refuse. */
function validateSubagentBody(body: any): { ok: true; value: { name: string; description: string; tools: string[]; instructions: string; maxSteps: number | null } } | { ok: false; error: string } {
  const name = String(body.name ?? "").trim();
  const description = String(body.description ?? "").trim();
  const instructions = String(body.instructions ?? "").trim();
  const tools = Array.isArray(body.tools) ? body.tools.map(String) : [];
  if (!name || !description || !instructions) return { ok: false, error: "name, description, dan instructions wajib." };
  const maxSteps = body.maxSteps == null || body.maxSteps === "" ? null : Number(body.maxSteps);
  if (maxSteps !== null && (!Number.isFinite(maxSteps) || maxSteps < 1 || maxSteps > 30)) {
    return { ok: false, error: "maxSteps harus antara 1 dan 30." };
  }
  return { ok: true, value: { name, description, tools, instructions, maxSteps } };
}

router.post("chat/subagents", async (ctx) => {
  const body = await ctx.body();
  const valid = validateSubagentBody(body);
  if (!valid.ok) return json({ error: valid.error }, 400);
  if (getAppSubagentByName(valid.value.name)) return json({ error: `Subagent "${valid.value.name}" sudah ada.` }, 409);
  // Validate the whole definition (not just the fields) so a mutating tool is
  // refused here rather than discovered later by a failing `task` call (FR-G7).
  const parsed = parseSubagent(
    `---\nname: ${valid.value.name}\ndescription: ${valid.value.description}\ntools: ${valid.value.tools.join(", ")}\n---\n\n${valid.value.instructions}`,
  );
  if (!parsed.ok) return json({ error: parsed.reason }, 400);
  const row = createAppSubagent(valid.value);
  return json({ subagent: row }, 201);
});

router.put("chat/subagents/:id", async (ctx) => {
  const body = await ctx.body();
  const existing = getAppSubagent(ctx.params.id);
  if (!existing) return json({ error: "Subagent tidak ditemukan." }, 404);
  const valid = validateSubagentBody({ ...existing, ...body });
  if (!valid.ok) return json({ error: valid.error }, 400);
  const duplicate = getAppSubagentByName(valid.value.name);
  if (duplicate && duplicate.id !== existing.id) return json({ error: `Subagent "${valid.value.name}" sudah ada.` }, 409);
  const parsed = parseSubagent(
    `---\nname: ${valid.value.name}\ndescription: ${valid.value.description}\ntools: ${valid.value.tools.join(", ")}\n---\n\n${valid.value.instructions}`,
  );
  if (!parsed.ok) return json({ error: parsed.reason }, 400);
  return json({ subagent: updateAppSubagent(existing.id, valid.value) });
});

router.delete("chat/subagents/:id", async (ctx) => {
  const removed = deleteAppSubagent(ctx.params.id);
  return removed ? json({ removed: true }) : json({ error: "Subagent tidak ditemukan." }, 404);
});

// Skills available to a project (FR-F1, FR-F4): the same layered resolution the
// agent's system prompt uses, so the `$` popup and the prompt can never disagree
// about which skill is in effect — including which layer won a name collision.
router.get("chat/skills", async (ctx) => {
  const projectId = ctx.query.get("projectId");
  if (!projectId) return json({ error: "projectId wajib." }, 400);
  const root = projectRootOf(projectId);
  if (!root) return json({ error: "Project tidak ditemukan atau belum punya root path." }, 404);
  const skills = resolveSkills(root);
  return json({
    skills: skills.map((s) => ({
      name: s.name,
      // Truncated for the popup; the agent gets its own capped copy in the prompt.
      description: skillSummaries([s])[0].description,
      source: s.source,
      references: s.files.length,
    })),
  });
});

// Composer actions for a project (FR-C14): the built-in list merged with
// `<project>/.agents/onesist-actions.json`. Resolution happens on the server so
// the client never reads the workspace itself, and so the "where did this action
// come from" marking cannot be forged by the content of the file.
router.get("chat/actions", async (ctx) => {
  const projectId = ctx.query.get("projectId");
  if (!projectId) return json({ error: "projectId wajib." }, 400);
  const root = projectRootOf(projectId);
  if (!root) return json({ error: "Project tidak ditemukan atau belum punya root path." }, 404);
  return json(resolveChatActions(root));
});

// Providers available for the model picker in the composer.
router.get("chat/providers", async () => {
  const rows = listProviders();
  const env = envBootstrapProvider();
  const all = [...rows, ...(env ? [env] : [])];
  return json({
    providers: all.filter(isProviderUsable).map((p) => ({
      id: p.id,
      name: p.name,
      model: p.model,
      // The stored model list is sent along so the model picker can show
      // per-provider choices without an extra endpoint — and stays useful for
      // providers without `GET /models` (FR-L4).
      models: parseModelList((p as any).modelsJson).concat(p.model ? [p.model] : []).filter((m, i, arr) => m && arr.indexOf(m) === i),
      source: p.source,
      isDefault: p.isDefault,
      apiStyle: p.apiStyle,
      envFallback: p.id === ENV_PROVIDER_ID,
    })),
  });
});

/** Stored model list; tolerant of non-JSON contents. */
function parseModelList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === "string");
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
