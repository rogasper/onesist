import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { relTime } from "~/lib/rel-time";
import { useChat } from "~/lib/ai-client";
import { isReasoningUIPart, isTextUIPart, isToolUIPart, isDynamicToolUIPart, getToolName, type UIMessage } from "~/lib/ai-client";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import { Button } from "@cloudflare/kumo";
import { BookOpen, Brain, Check, Globe, Lightning, ListChecks, MagnifyingGlass, PencilSimple, ShieldCheck, Terminal, Warning, Wrench, type Icon } from "@phosphor-icons/react";
import { InlineAlert } from "~/components/ui/InlineAlert";
import { CodeCard, isCardWorthyCode } from "~/components/chat/CodeCard";
import { FileCard } from "~/components/chat/FileCard";
import { WorkspacePanel, tabForPath } from "~/components/chat/WorkspacePanel";
import { MemoryPanel } from "~/components/chat/MemoryPanel";
import { Composer, type Attachment } from "~/components/chat/Composer";
import { MAX_STEPS_DEFAULT, MAX_STEPS_MAX } from "~/server/agent/types";
import {
  expandMentions,
  formatTokens,
  uploadAttachment,
  useChatActions,
  useChatSkills,
  useMentionFiles,
  usePendingApprovals,
  useThreadTransport,
  type ChatProviderOption,
  type PendingApproval,
  type ThreadDetail,
  type ThreadFile,
} from "~/lib/use-chat";

/**
 * Chat surface (FR-B, FR-C, FR-E4).
 *
 * The transcript is grouped into three deliberately distinct block kinds,
 * shaped so the eye can separate agent work phases without reading:
 *
 *   THINKING — dashed ring, dimmed background, italic text, collapsed. This
 *              is not the answer, and must never look like the answer.
 *   TOOL     — terminal-styled monospace block, with consecutive calls merged.
 *              Six tool calls become ONE "6 steps" block, not six separate
 *              cards filling the screen.
 *   ANSWER   — plain text with no box, 14px, loose line spacing. The only
 *              block meant to be read in sequence.
 *
 * Typography follows the Kumo guide: 14px content text (not 10-11px),
 * sentence-case headings, no `transition-colors` on hover, concentric radii,
 * and inline monospace text slightly smaller (0.8125rem) than regular text.
 */

interface Props {
  threadId: string;
  detail: ThreadDetail;
  providers: ChatProviderOption[];
  onRefresh: () => void;
  onOpenProviders: () => void;
}

const MONO = "font-mono text-[0.8125rem]";

/** Durations in readable units: 820 ms · 1.2 s · 1 min 5 s. */
function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(1, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(".", ",")} dtk`;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)} mnt ${total % 60} dtk`;
}

function elapsedSeconds(from: number, now: number): number {
  return Math.max(0, Math.floor((now - from) / 1000));
}

/** Errors that mean "the connection to our own server died", not "the model
 *  refused". WebKit says "Load failed", Chromium says "Failed to fetch". */
function isConnectionFailure(message: string): boolean {
  return /load failed|failed to fetch|networkerror|network error|the operation couldn/i.test(message);
}

export function ChatSurface({ threadId, detail, providers, onRefresh, onOpenProviders }: Props) {
  const projectId = detail.thread.projectId;
  const navigate = useNavigate();
  const transport = useThreadTransport(threadId);
  const initialMessages = useMemo(() => detail.messages as unknown as UIMessage[], []); // eslint-disable-line react-hooks/exhaustive-deps

  const { messages, sendMessage, status, stop, error } = useChat({
    id: threadId,
    transport: transport!,
    messages: initialMessages,
    onFinish: () => onRefresh(),
  });

  const streaming = status === "streaming" || status === "submitted";
  const { approvals, decide } = usePendingApprovals(threadId, streaming);

  const [input, setInput] = useState("");
  const [mode, setMode] = useState(detail.thread.mode);
  const [permissionMode, setPermissionMode] = useState(detail.thread.permissionMode);
  const [providerId, setProviderId] = useState(detail.thread.providerId ?? "");
  const [model, setModel] = useState<string | null>(detail.thread.model ?? null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachBusy, setAttachBusy] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  /** This thread's step ceiling; mirrored locally because raising it from the
   *  transcript must take effect immediately (the PUT persists it). */
  const [currentMaxSteps, setCurrentMaxSteps] = useState(detail.thread.maxSteps);
  /** Server log path, shown when a run dies mid-stream (fetched once). */
  const [logPath, setLogPath] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (typeof data?.logPath === "string") setLogPath(data.logPath);
      } catch {
        /* the hint is optional */
      }
    })();
  }, []);

  // Report stream failures into the server log as they appear. The server logs
  // its own side (a disconnect), so both halves of a broken run end up in one
  // file with timestamps — which is the only way to tell who dropped it.
  useEffect(() => {
    if (!error) return;
    void fetch("/api/system/client-error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ where: "chat-stream", message: error.message }),
      cache: "no-store",
    }).catch(() => {
      /* the server may be what is gone */
    });
  }, [error]);

  const { files: mentionFiles } = useMentionFiles(projectId, detail.rootPath ?? null);
  const { skills } = useChatSkills(projectId);
  const { actions, projectFile } = useChatActions(projectId);

  /** Files grouped by the answer that wrote them, so each turn can show its own
   *  section (UJI-MANUAL C9b). Rows with no `messageId` (written before the
   *  ledger tracked turns) are not lost: they render in the thread-level section
   *  above the composer. */
  const filesByMessage = useMemo(() => {
    const byMessage = new Map<string, ThreadFile[]>();
    for (const f of detail.files) {
      if (!f.messageId) continue;
      const list = byMessage.get(f.messageId);
      if (list) list.push(f);
      else byMessage.set(f.messageId, [f]);
    }
    return byMessage;
  }, [detail.files]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // Turn start time, for the "Generating reply · 12s" status line.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (streaming) {
      setStartedAt((prev) => prev ?? Date.now());
      return;
    }
    setStartedAt(null);
  }, [streaming]);

  useEffect(() => {
    if (!streaming) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [streaming]);

  // Only follow fresh output while the user is actually at the bottom —
  // so reading old history does not keep yanking them down while the agent
  // is still writing.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, approvals]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  const noProvider = providers.length === 0;

  /**
   * DB metadata wins over the live message metadata. Reason: token and
   * thinking-duration counts are only known after the turn finishes (the
   * server writes them in `onFinish`), so without this both vanish the
   * moment the message moves from stream to history.
   */
  const metadataById = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    for (const m of detail.messages) {
      if (m.metadata) map.set(m.id, m.metadata as Record<string, any>);
    }
    return map;
  }, [detail.messages]);

  // Tool durations: from the ledger once the turn is stored, from client-side
  // measurement while the stream is still running (FR-B5).
  const persistedToolMs = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of detail.toolCalls) {
      if (t.startedAt && t.endedAt) {
        const ms = new Date(t.endedAt).getTime() - new Date(t.startedAt).getTime();
        if (ms >= 0) map.set(t.toolCallId, ms);
      }
    }
    return map;
  }, [detail.toolCalls]);
  const liveToolMs = useLiveToolDurations(messages);

  /** The basis for a write's permission: "auto" means automatic mode,
   *  "approved"/"denied" mean the user decided, "protected-path" means a
   *  protected path. Captured while the run is live — it cannot be
   *  reconstructed again after the run closes (FR-B4). */
  const approvalById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of detail.toolCalls) {
      if (t.approval) map.set(t.toolCallId, t.approval);
    }
    return map;
  }, [detail.toolCalls]);

  const toolDuration = useCallback(
    (toolCallId: string | undefined) => {
      if (!toolCallId) return null;
      const ms = persistedToolMs.get(toolCallId) ?? liveToolMs[toolCallId];
      return ms == null ? null : ms;
    },
    [persistedToolMs, liveToolMs],
  );

  async function submit() {
    const text = input.trim();
    if (streaming) return;
    if (!text && !attachments.length) return;
    // Attachments are referenced as `@…` paths so the agent reads them via
    // `read_file` — the same way users mention files themselves.
    const attachmentLine = attachments.length ? `Lampiran:\n${attachments.map((a) => `@${a.path}`).join("\n")}\n\n` : "";
    // Mentions were inserted by name (compact chips); the model gets full paths.
    const expanded = expandMentions(text, mentionFiles);
    setInput("");
    setAttachments([]);
    atBottomRef.current = true;
    setNow(Date.now());
    await sendMessage({ text: `${attachmentLine}${expanded}`.trim() });
  }

  async function handleAttach(files: File[]) {
    if (!files.length) return;
    setAttachBusy(true);
    setAttachError(null);
    try {
      const saved: Attachment[] = [];
      for (const file of files) {
        saved.push(await uploadAttachment(threadId, file));
      }
      setAttachments((prev) => [...prev, ...saved]);
    } catch (err: any) {
      setAttachError(err?.message ?? "Gagal melampirkan berkas.");
    } finally {
      setAttachBusy(false);
    }
  }

  async function patchThread(patch: Record<string, unknown>) {
    await fetch(`/api/chat/threads/${threadId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
      cache: "no-store",
    });
  }

  /**
   * Approve the plan and run it (FR-B18) — without the user having to copy the
   * plan into a new message.
   *
   * The mode switch is PERSISTED before the message is sent: the server builds
   * the system prompt from the thread row it reads when the request arrives, so
   * sending first would run the plan with plan-mode tools (i.e. none) and the
   * agent would answer "I cannot write files".
   */
  async function approvePlan() {
    if (streaming) return;
    setMode("agent");
    await patchThread({ mode: "agent" });
    atBottomRef.current = true;
    setNow(Date.now());
    await sendMessage({ text: "Setujui rencana di atas. Jalankan langkah-langkahnya sekarang." });
  }

  const lastMessage = messages[messages.length - 1];
  const planReadyToApprove =
    mode === "plan" && !streaming && lastMessage?.role === "assistant" && Boolean((lastMessage.parts ?? []).some(isTextUIPart));

  /**
   * Continue a turn that was cut off by the step ceiling (FR-B11).
   *
   * The conversation is already stored, so continuing is just another message —
   * the agent does not lose what it did, it reads the history. `raiseLimit`
   * doubles THIS thread's ceiling (the app default only applies to new threads,
   * so a stored value would otherwise keep cutting the same task).
   */
  async function continueAfterStepLimit(raiseLimit: boolean) {
    if (streaming) return;
    if (raiseLimit) {
      const next = Math.min(MAX_STEPS_MAX, Math.max(currentMaxSteps * 2, MAX_STEPS_DEFAULT));
      setCurrentMaxSteps(next);
      await patchThread({ maxSteps: next });
    }
    atBottomRef.current = true;
    setNow(Date.now());
    await sendMessage({
      text: "Lanjutkan tugas tadi dari langkah terakhir. Jangan mengulang pembacaan atau analisis yang sudah dilakukan; selesaikan yang belum selesai.",
    });
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <WorkspacePanel
        files={mentionFiles}
        changed={detail.files}
        onOpen={(filePath) => {
          // The panel does not render artifact viewers; it hands the file to its
          // own tab, which already knows how to show it (FR-C7). Router
          // navigation, not `window.location.href` — a full page load would
          // abort a run that is still streaming in this panel.
          const tab = tabForPath(filePath);
          navigate({ to: (tab ? `/projects/$id/${tab}` : "/projects/$id") as any, params: { id: projectId } } as any);
        }}
      />

      <MemoryPanel projectId={projectId} />

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-6 py-6 grid gap-6">
          {!messages.length ? <EmptyState onPick={setInput} providerReady={!noProvider} /> : null}

          {messages.map((m, mi) => (
            <MessageBlock
              key={m.id ?? mi}
              message={m}
              streaming={streaming && mi === messages.length - 1}
              metadata={metadataById.get(m.id ?? "")}
              projectId={projectId}
              files={filesByMessage.get(m.id ?? "")}
              root={detail.rootPath ?? null}
              toolDuration={toolDuration}
              approvalById={approvalById}
              nextStepLimit={Math.min(MAX_STEPS_MAX, Math.max(currentMaxSteps * 2, MAX_STEPS_DEFAULT))}
              onContinueAfterLimit={() => void continueAfterStepLimit(true)}
            />
          ))}

          {approvals.map((a) => (
            <ApprovalBlock key={a.toolCallId} approval={a} onDecide={decide} />
          ))}

          {planReadyToApprove ? (
            // Plan mode has no write tool, so the plan is the end of the turn.
            // Approving flips the thread to Work mode and sends one message —
            // the plan itself is already in the conversation.
            <div className="flex items-center gap-3 rounded-xl ring ring-kumo-line bg-kumo-elevated px-3.5 py-3">
              <ListChecks size={16} className="text-kumo-brand shrink-0" />
              <span className="text-sm text-kumo-default flex-1 min-w-0">
                Rencana ini belum dijalankan. Menyetujui akan mengubah mode percakapan ke <span className="font-semibold">Kerjakan</span> dan langsung memulainya.
              </span>
              <Button variant="primary" onClick={() => void approvePlan()}>
                Setujui &amp; jalankan
              </Button>
            </div>
          ) : null}

          {error ? (
            // "Load failed" (WebKit) tells the user nothing. When the failure is
            // the connection to our own server, say what happened, that the
            // history survives, and where the log is — that is the difference
            // between a report we can act on and one we cannot.
            <InlineAlert>
              {isConnectionFailure(error.message) ? (
                <>
                  Koneksi ke server Onesist terputus di tengah run — run ditandai berhenti, tetapi riwayat tetap tersimpan.
                  Kirim ulang pesannya untuk melanjutkan.
                  {logPath ? (
                    <>
                      {" "}
                      Detailnya di <span className={`${MONO} break-all`}>{logPath}</span>
                    </>
                  ) : null}
                </>
              ) : (
                error.message
              )}
            </InlineAlert>
          ) : null}
        </div>
      </div>

      {streaming && startedAt ? (
        <div className="border-t border-kumo-line shrink-0">
          <div className="mx-auto w-full max-w-3xl px-6 py-1.5 flex items-center gap-2 text-xs text-kumo-subtle">
            <Pulse />
            <span>
              Menghasilkan balasan
              {mode === "agent" ? " · memakai tool" : mode === "plan" ? " · menyusun rencana" : ""} · berjalan {elapsedSeconds(startedAt, now)}s
            </span>
          </div>
        </div>
      ) : null}

      {detail.staleReads?.length ? <StaleReadsNotice reads={detail.staleReads} /> : null}

      <UnattributedFiles detail={detail} />

      <Composer
        projectId={projectId}
        input={input}
        onInput={setInput}
        onSubmit={submit}
        streaming={streaming}
        onStop={() => stop()}
        disabled={streaming}
        mentions={mentionFiles}
        providerReady={!noProvider}
        providers={providers}
        providerId={providerId}
        model={model}
        onSelectModel={(nextProviderId, nextModel) => {
          setProviderId(nextProviderId);
          setModel(nextModel);
          void patchThread({ providerId: nextProviderId || null, model: nextModel });
        }}
        onOpenProviders={onOpenProviders}
        threadMode={mode}
        onThreadMode={(v) => {
          setMode(v as any);
          void patchThread({ mode: v });
        }}
        permissionMode={permissionMode}
        onPermissionMode={(v) => {
          // Local state first so the label flips instantly; the PUT only
          // persists, it does not return the thread (the change only shows
          // after the next refresh if we wait for props).
          setPermissionMode(v as typeof permissionMode);
          void patchThread({ permissionMode: v });
        }}
        tokensUsed={detail.thread.tokensUsed}
        usage={detail.usage}
        hasSummary={detail.thread.hasSummary}
        attachments={attachments}
        onAttach={handleAttach}
        onRemoveAttachment={(path) => setAttachments((prev) => prev.filter((a) => a.path !== path))}
        attachBusy={attachBusy}
        attachError={attachError}
        actions={actions}
        actionFile={projectFile}
        skills={skills}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tool durations while the stream is still running. The server only writes
 * start and end times when the turn closes, so without client-side
 * measurement finished steps show no duration at all during the turn.
 */
function useLiveToolDurations(messages: UIMessage[]): Record<string, number> {
  const [done, setDone] = useState<Record<string, number>>({});
  const startedRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    let changed = false;
    const next = { ...done };
    for (const m of messages) {
      for (const part of (m.parts ?? []) as any[]) {
        const id = part?.toolCallId;
        if (!id) continue;
        const running = part.state === "input-streaming" || part.state === "input-available" || part.state === "approval-requested";
        if (running && !startedRef.current.has(id)) {
          startedRef.current.set(id, Date.now());
        }
        const finished = part.state === "output-available" || part.state === "output-error" || part.state === "output-denied";
        if (finished && next[id] == null) {
          const start = startedRef.current.get(id);
          if (start != null) {
            next[id] = Date.now() - start;
            changed = true;
          }
        }
      }
    }
    if (changed) setDone(next);
  }, [messages, done]);

  return done;
}

function EmptyState({ onPick, providerReady }: { onPick: (t: string) => void; providerReady: boolean }) {
  const contoh = [
    "Analisa FSD di input/fsd dan buatkan spec API, ERD, dan task card.",
    "Periksa konsistensi MASTER_SPEC_API.md dengan output/spec — laporkan yang tidak cocok.",
    "Susun test case SIT untuk modul yang belum punya di output/sit.",
    "Ringkas MASTER_ERD.md dan sebutkan entitas yang belum punya endpoint.",
  ];
  return (
    <div className="pt-8 grid gap-2">
      <div className="grid gap-1.5">
        <h2 className="text-sm font-semibold text-kumo-default">Mulai percakapan</h2>
        <p className="text-sm text-kumo-subtle">
          {providerReady
            ? "Agent membaca dan mengubah berkas di workspace project ini. Setiap perubahan berkas tampil di bawah kolom ini."
            : "Tambahkan provider dulu; setelah itu agent bisa membaca dan mengubah berkas project."}
        </p>
      </div>
      <div className="grid gap-2 mt-2">
        {contoh.map((t) => (
          <button
            key={t}
            onClick={() => onPick(t)}
            className="text-left text-sm rounded-xl px-4 py-3 ring ring-kumo-line hover:bg-kumo-elevated text-kumo-subtle"
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

type Block =
  | { kind: "text"; key: string; text: string }
  | { kind: "reasoning"; key: string; text: string }
  | { kind: "notice"; key: string; data: any }
  | { kind: "todos"; key: string; todos: TodoItem[] }
  | { kind: "subagent"; key: string; part: any }
  | { kind: "tools"; key: string; parts: any[] };

interface TodoItem {
  id?: string;
  text?: string;
  status?: "pending" | "in_progress" | "completed";
}

/** Todos carried by a `todo_write` call. The plan is the point of that tool, so
 *  it is shown as its own block instead of a generic tool row (FR-D5) — a row
 *  saying "Rencana 1 langkah" hides the only thing the user wants to read. */
function todosOf(part: any): TodoItem[] | null {
  if ((getToolName(part) || "") !== "todo_write") return null;
  const raw = part?.input?.todos ?? part?.output?.todos;
  if (!Array.isArray(raw)) return null;
  const todos = raw
    .filter((t: any) => t && typeof t === "object" && typeof t.text === "string" && t.text.trim())
    .map((t: any) => ({ id: typeof t.id === "string" ? t.id : undefined, text: t.text, status: t.status }));
  return todos.length ? todos : null;
}

/** Merges consecutive parts into blocks. Back-to-back tools become ONE
 *  block — this grouping is what keeps the transcript readable when the
 *  agent calls a dozen tools in a row. */
function groupParts(parts: any[]): Block[] {
  const blocks: Block[] = [];
  let tools: any[] = [];

  const flush = () => {
    if (tools.length) {
      blocks.push({ kind: "tools", key: `tools-${tools[0]?.toolCallId ?? blocks.length}`, parts: tools });
      tools = [];
    }
  };

  parts.forEach((part, i) => {
    if (isToolUIPart(part) || isDynamicToolUIPart(part)) {
      // A delegation is not an ordinary step: the row says WHICH subagent ran and
      // what came back, so the user can tell "the agent read 30 files" from "the
      // agent asked explorer to read 30 files" (FR-G5).
      if ((getToolName(part) || "") === "task") {
        flush();
        blocks.push({ kind: "subagent", key: `sub-${part?.toolCallId ?? i}`, part });
        return;
      }
      const todos = todosOf(part);
      if (todos) {
        // The plan stands on its own, so it ends the surrounding tool group.
        flush();
        blocks.push({ kind: "todos", key: `todo-${part?.toolCallId ?? i}`, todos });
        return;
      }
      tools.push(part);
      return;
    }
    flush();
    if (part?.type === "data-notice") {
      blocks.push({ kind: "notice", key: `n-${i}`, data: part.data });
      return;
    }
    if (isReasoningUIPart(part)) {
      if ((part.text ?? "").trim()) blocks.push({ kind: "reasoning", key: `r-${i}`, text: part.text });
      return;
    }
    if (isTextUIPart(part)) {
      if (part.text.trim()) blocks.push({ kind: "text", key: `t-${i}`, text: part.text });
    }
  });
  flush();
  return blocks;
}

function MessageBlock({
  message,
  streaming,
  metadata,
  projectId,
  files,
  root,
  toolDuration,
  approvalById,
  nextStepLimit,
  onContinueAfterLimit,
}: {
  message: UIMessage;
  streaming: boolean;
  metadata?: Record<string, any>;
  projectId: string;
  /** Files THIS turn wrote, from the ledger (UJI-MANUAL C9b). */
  files?: ThreadFile[];
  root: string | null;
  toolDuration: (toolCallId: string | undefined) => number | null;
  approvalById: Map<string, string>;
  /** Ceiling a step-limit notice would raise the thread to, and the action that
   *  does it and continues the turn (FR-B11). */
  nextStepLimit?: number;
  onContinueAfterLimit?: () => void;
}) {
  if (message.role === "user") {
    const text = (message.parts ?? []).map((p: any) => (isTextUIPart(p) ? p.text : "")).join("");
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-kumo-tint px-4 py-3 text-sm text-kumo-default whitespace-pre-wrap">
          {text}
        </div>
      </div>
    );
  }

  const blocks = groupParts(message.parts ?? []);
  const reasoningBlocks = blocks.filter((b) => b.kind === "reasoning").length;
  const reasoningMs = typeof metadata?.reasoningMs === "number" ? metadata.reasoningMs : null;
  const inputTokens = typeof metadata?.inputTokens === "number" ? metadata.inputTokens : null;
  const outputTokens = typeof metadata?.outputTokens === "number" ? metadata.outputTokens : null;
  const failed = metadata?.status === "error" || metadata?.status === "aborted";
  const meta = (message as any).metadata ?? {};
  const liveInput = typeof meta.inputTokens === "number" ? meta.inputTokens : null;
  const liveOutput = typeof meta.outputTokens === "number" ? meta.outputTokens : null;
  const inTok = inputTokens ?? liveInput;
  const outTok = outputTokens ?? liveOutput;

  return (
    // One assistant turn is wrapped in ONE container, not loose blocks:
    // the eye immediately knows what belongs to one agent job.
    <div className="rounded-xl bg-kumo-recessed/60 px-4 py-3.5 grid gap-3">
      {blocks.map((b) => {
        if (b.kind === "reasoning")
          return (
            <ThinkingBlock
              key={b.key}
              text={b.text}
              streaming={streaming}
              durationMs={reasoningMs}
              // The stored duration spans from the first to the last thinking
              // section. When a turn has several thinking phases, that number
              // is not one block's duration — say "total" so it does not
              // mislead.
              durationIsTotal={reasoningBlocks > 1}
            />
          );
        if (b.kind === "notice") {
          const limit = b.data?.kind === "stepLimit";
          return (
            <NoticeBlock
              key={b.key}
              data={b.data}
              nextLimit={limit ? nextStepLimit : undefined}
              onContinue={limit ? onContinueAfterLimit : undefined}
            />
          );
        }
        if (b.kind === "todos") return <TodoPanel key={b.key} todos={b.todos} />;
        if (b.kind === "subagent")
          return <SubagentBlock key={b.key} part={b.part} approval={approvalById.get(b.part?.toolCallId)} turnEnded={!streaming} />;
        if (b.kind === "tools")
          return <ToolGroup key={b.key} parts={b.parts} duration={toolDuration} approvalById={approvalById} turnEnded={!streaming} />;
        // Answer: no box and no background — the only block read in
        // sequence, so it must not compete with the surrounding chrome. The
        // `chat-markdown` class supplies the hierarchy Tailwind's preflight
        // removes (see styles.css).
        return (
          <div key={b.key} className="chat-markdown text-sm leading-relaxed text-kumo-default min-w-0">
            <MarkdownViewer
              content={b.text}
              codeRenderer={(lang, code) => (isCardWorthyCode(lang, code) ? <CodeCard lang={lang} code={code} projectId={projectId} /> : null)}
            />
          </div>
        );
      })}

      {/* The files this turn wrote, as their own section at the end of the
          answer (UJI-MANUAL C9b) — before the token footer, which is the turn's
          footnote and not part of its output. */}
      {files?.length ? (
        <div className="grid gap-2">
          {files.map((f) => (
            <FileCard key={f.id} file={f} root={root} projectId={projectId} />
          ))}
        </div>
      ) : null}

      {inTok || outTok ? (
        <p className="text-xs text-kumo-subtle border-t border-kumo-line pt-2 flex items-center gap-2">
          <span>↑{formatTokens(inTok ?? 0)} masuk</span>
          <span>↓{formatTokens(outTok ?? 0)} keluar</span>
          {reasoningMs ? <span>· berpikir {fmtDuration(reasoningMs)}</span> : null}
          {failed ? <span className="text-amber-400">· {metadata?.status === "aborted" ? "dihentikan" : "berakhir dengan error"}</span> : null}
        </p>
      ) : null}
    </div>
  );
}

/** One subagent run (FR-G5). Shown as its own row — subagent name, the question it
 *  was given, and the summary it returned — because this is the row that explains
 *  why the main context did NOT grow: the reading happened somewhere else. */
function SubagentBlock({ part, approval, turnEnded = false }: { part: any; approval?: string; turnEnded?: boolean }) {
  const [open, setOpen] = useState(false);
  const state = toolState(part, turnEnded);
  const name = String(part?.input?.subagent ?? "subagent");
  const prompt = String(part?.input?.prompt ?? "");
  const output = typeof part.output === "string" ? part.output : part.output ? JSON.stringify(part.output, null, 1) : "";
  const tint =
    state.tone === "err"
      ? "ring-red-400/40 bg-red-400/10"
      : state.tone === "warn"
        ? "ring-amber-400/40 bg-amber-400/10"
        : state.tone === "ok"
          ? "ring-green-400/40 bg-green-400/10"
          : "ring-blue-400/40 bg-blue-400/10";

  return (
    <div className={`rounded-lg ring overflow-hidden ${tint}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-black/5"
      >
        <RowIcon icon={Lightning} />
        <span className="text-sm font-medium text-kumo-default shrink-0">Subagent</span>
        <span className="font-mono text-[0.8125rem] text-kumo-default shrink-0">{name}</span>
        <span className="text-sm text-kumo-subtle truncate min-w-0 flex-1">{prompt}</span>
        <span className="text-sm text-kumo-subtle shrink-0">
          {state.label}
          {approval ? ` · ${approvalLabel(approval)}` : ""}
        </span>
        <span className="text-kumo-subtle shrink-0">{open ? "⌄" : "›"}</span>
      </button>
      {open ? (
        <div className="border-t border-kumo-line/60 px-3 py-2 grid gap-2">
          <div className="grid gap-0.5">
            <span className="text-xs text-kumo-subtle">Yang diminta</span>
            <p className="text-sm text-kumo-default whitespace-pre-wrap">{prompt || "(kosong)"}</p>
          </div>
          {output ? (
            <div className="grid gap-0.5">
              <span className="text-xs text-kumo-subtle">Ringkasan yang dikembalikan</span>
              <pre className={`${MONO} text-kumo-default whitespace-pre-wrap max-h-72 overflow-y-auto`}>{output.slice(0, 6000)}</pre>
            </div>
          ) : null}
          {part.errorText ? <InlineAlert>{part.errorText}</InlineAlert> : null}
          <p className="text-xs text-kumo-subtle">
            Subagent berjalan di konteks terpisah dan hanya bisa membaca — isi berkas yang dibacanya tidak masuk ke percakapan ini.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** The agent's step plan (FR-D5). Shown as a checklist rather than a tool row:
 *  the list IS the content, and its statuses are the reason the user looks. */
function TodoPanel({ todos }: { todos: TodoItem[] }) {
  const done = todos.filter((t) => t.status === "completed").length;
  const running = todos.some((t) => t.status === "in_progress");
  return (
    <div className="rounded-lg ring ring-kumo-line px-3 py-2.5 grid gap-1.5">
      <p className="flex items-center gap-2 text-sm text-kumo-subtle">
        <RowIcon icon={ListChecks} />
        Rencana · {done}/{todos.length} langkah selesai
        {running ? <Pulse /> : null}
      </p>
      <ChildRail>
        <div className="grid gap-1 py-1">
          {todos.map((t, i) => (
            <p key={t.id ?? i} className="flex items-start gap-2 text-sm">
              <span className="mt-0.5 shrink-0">
                {t.status === "completed" ? (
                  <Check size={13} className="text-green-400" />
                ) : t.status === "in_progress" ? (
                  <span className="inline-block w-[7px] h-[7px] mt-[5px] rounded-full bg-amber-400 animate-pulse" />
                ) : (
                  <span className="inline-block w-[7px] h-[7px] mt-[5px] rounded-full ring ring-kumo-line" />
                )}
              </span>
              <span className={t.status === "completed" ? "text-kumo-subtle line-through" : "text-kumo-default"}>{t.text}</span>
            </p>
          ))}
        </div>
      </ChildRail>
    </div>
  );
}

/** System-event marker in the transcript — for now context compaction
 *  (FR-B9), so the user knows when the agent starts losing early detail. */
function NoticeBlock({ data, nextLimit, onContinue }: { data: any; nextLimit?: number; onContinue?: () => void }) {
  if (data?.kind === "truncated") {
    // FR-A14/FR-B15: the provider cut the answer at the output ceiling. When it
    // happens mid tool call the tool never runs — the row above would otherwise
    // look like it is still working.
    return (
      <div className="rounded-lg ring ring-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-sm text-kumo-default grid gap-1.5">
        <span>
          <span className="font-semibold">Jawaban terpotong oleh batas token keluaran provider{data.outputTokens ? ` (${data.outputTokens.toLocaleString("id-ID")} token)` : ""}.</span>{" "}
          Kalau potongan itu jatuh di tengah argumen sebuah tool, toolnya tidak pernah dijalankan — langkah di atas yang
          masih terlihat "berjalan" berarti belum terjadi.
        </span>
        <span className="text-kumo-subtle">
          Dua jalan keluar: naikkan <span className="font-semibold">Max output tokens</span> di pengaturan provider, atau minta agent menulis berkas besar
          secara bertahap (kerangka dulu, lalu bagian berikutnya lewat <span className={MONO}>edit_file</span>).
        </span>
      </div>
    );
  }
  if (data?.kind === "stepLimit") {
    // FR-B11: reaching the step ceiling MUST be visible, otherwise the agent
    // simply stops mid-task and the transcript reads as "it gave up for no
    // reason" — observed as a real report: 30 steps of skill_read/list_dir/
    // todo_write with no file written and no explanation anywhere.
    return (
      <div className="rounded-lg ring ring-amber-400/40 bg-amber-400/10 px-3 py-2.5 text-sm text-kumo-default grid gap-2">
        <span>
          <span className="font-semibold">Batas langkah tercapai{data.steps ? ` (${data.steps} langkah)` : ""}.</span> Agent berhenti karena kehabisan
          langkah, bukan karena tugasnya selesai. Periksa apa yang sudah dikerjakan di atas — riwayatnya tetap ada, jadi
          melanjutkan tidak mengulang dari awal.
        </span>
        {onContinue && nextLimit ? (
          <span className="flex items-center gap-2">
            <Button variant="secondary" onClick={onContinue}>
              Naikkan batas ke {nextLimit} &amp; lanjutkan
            </Button>
            <span className="text-xs text-kumo-subtle">Batas tersimpan di percakapan ini, jadi tugas berikutnya tidak terpotong lagi.</span>
          </span>
        ) : null}
      </div>
    );
  }
  if (data?.kind !== "compacted") return null;
  return (
    <div className="rounded-lg ring ring-kumo-line px-3 py-2 text-sm text-kumo-subtle">
      Konteks percakapan diringkas
      {data.estimatedBefore ? ` · perkiraan ${formatTokens(data.estimatedBefore)} → ${formatTokens(data.estimatedAfter ?? 0)} token` : ""}.
      Pesan-pesan awal digantikan ringkasannya.
    </div>
  );
}

/** Thinking — deliberately looks "unfinished": dashed ring, dimmed
 *  background, italic text. The user must never mistake this for the answer. */
function ThinkingBlock({
  text,
  streaming,
  durationMs,
  durationIsTotal,
}: {
  text: string;
  streaming: boolean;
  durationMs: number | null;
  durationIsTotal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const detail = streaming
    ? ""
    : durationMs
      ? ` · ${durationIsTotal ? "total " : ""}${fmtDuration(durationMs)}`
      : ` · ${text.length} karakter`;
  return (
    <div className="grid">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-kumo-elevated">
        <RowIcon icon={Brain} />
        <span className="text-sm text-kumo-subtle truncate">
          {streaming ? "Sedang berpikir" : "Berpikir"}
          {detail}
        </span>
        <span className="ml-auto shrink-0 flex items-center gap-2">
          {streaming ? <Pulse /> : null}
          <Chevron open={open} />
        </span>
      </button>
      {open ? (
        <ChildRail>
          <div className="py-3 pr-3 text-sm leading-relaxed text-kumo-subtle whitespace-pre-wrap">{text}</div>
        </ChildRail>
      ) : null}
    </div>
  );
}

function Pulse() {
  return (
    <span className="inline-flex gap-1 items-center" aria-label="sedang bekerja">
      <span className="w-1 h-1 rounded-full bg-kumo-subtle animate-pulse" />
      <span className="w-1 h-1 rounded-full bg-kumo-subtle animate-pulse [animation-delay:150ms]" />
      <span className="w-1 h-1 rounded-full bg-kumo-subtle animate-pulse [animation-delay:300ms]" />
    </span>
  );
}

/** Visual state of a tool call.
 *
 *  `turnEnded` matters: a tool whose arguments were still streaming when the turn
 *  ended never ran (measured 2026-09-18 — a `write_file` cut off by the output
 *  token ceiling). Without it the row would say "berjalan" forever, in a
 *  transcript that is not running anything — the user reads that as "stuck" and
 *  has no way to tell it will never finish. */
function toolState(part: any, turnEnded = false): { tone: "run" | "ok" | "err" | "warn"; label: string } {
  if (part.state === "output-error" || part.errorText) return { tone: "err", label: "gagal" };
  if (part.state === "output-available") return { tone: "ok", label: "selesai" };
  if (part.state === "input-streaming" || part.state === "input-available") {
    return turnEnded ? { tone: "warn", label: "tidak selesai" } : { tone: "run", label: "berjalan" };
  }
  return turnEnded ? { tone: "warn", label: "tidak selesai" } : { tone: "run", label: "menunggu" };
}

type ToolKind = "terminal" | "tulis" | "baca" | "cari" | "web" | "rencana" | "lain";

/** What kind of job a tool does. Used to TITLE the group — "Edit 2 files"
 *  is far more informative than a list of tool names, and it is the same
 *  language as the design reference (Codex/ZCode): "Terminal · 2 commands". */
function toolKind(name: string): ToolKind {
  switch (name) {
    case "bash":
      return "terminal";
    case "write_file":
    case "edit_file":
      return "tulis";
    case "read_file":
    case "list_dir":
      return "baca";
    case "grep":
    case "glob":
      return "cari";
    case "web_fetch":
      return "web";
    case "todo_write":
      return "rencana";
    default:
      return "lain";
  }
}

const KIND_META: Record<ToolKind, { icon: Icon; label: string; satuan: string }> = {
  terminal: { icon: Terminal, label: "Terminal", satuan: "perintah" },
  tulis: { icon: PencilSimple, label: "Ubah", satuan: "berkas" },
  baca: { icon: BookOpen, label: "Baca", satuan: "berkas" },
  cari: { icon: MagnifyingGlass, label: "Cari", satuan: "pencarian" },
  web: { icon: Globe, label: "Ambil", satuan: "halaman" },
  rencana: { icon: ListChecks, label: "Rencana", satuan: "langkah" },
  lain: { icon: Wrench, label: "Tool", satuan: "langkah" },
};

/** Small 12px icon, aligned with the first text line (the Kumo
 *  `icon-alignment` rule). */
function RowIcon({ icon: Icon, size = 13 }: { icon: Icon; size?: number }) {
  return (
    <span className="h-lh flex items-center text-kumo-subtle shrink-0">
      <Icon size={size} />
    </span>
  );
}

/** Chevron on the RIGHT of the header, as in the reference — not on the left,
 *  so label and icon stay left-aligned and easy to scan. */
function Chevron({ open }: { open: boolean }) {
  return <span className="ml-auto shrink-0 text-kumo-subtle">{open ? "⌄" : "›"}</span>;
}

/** Child row inside a group: icon + label + content + status, indented with
 *  a vertical line on the left. */
function ChildRail({ children }: { children: React.ReactNode }) {
  return <div className="ml-[21px] border-l border-kumo-line pl-3 grid">{children}</div>;
}

/** Group title: if all tools are the same kind, name the kind; if mixed,
 *  just give the step count. This is what makes the group read as ONE job. */
function groupTitle(parts: any[]): { icon: Icon; text: string } {
  const kinds = parts.map((p) => toolKind(getToolName(p) || "tool"));
  const unik = [...new Set(kinds)];
  if (unik.length === 1) {
    const meta = KIND_META[unik[0]];
    return { icon: meta.icon, text: `${meta.label} ${parts.length} ${meta.satuan}` };
  }
  return { icon: Terminal, text: `${parts.length} langkah` };
}

/** Tool arguments, summarized. Never show the full JSON inline:
 *  `write_file` carries the entire file contents and `bash` can be very long. */
function toolTarget(name: string, input: any): string {
  if (!input || typeof input !== "object") return "";
  switch (name) {
    case "bash":
      return String(input.command ?? "");
    case "grep":
      return `${input.query ?? ""}${input.mode ? ` · ${input.mode}` : ""}`;
    case "glob":
      return String(input.pattern ?? "");
    case "web_fetch":
      return String(input.url ?? "");
    case "todo_write":
      return `${Array.isArray(input.todos) ? input.todos.length : 0} langkah`;
    case "edit_file":
      return String(input.path ?? "");
    default:
      return String(input.path ?? input.file_path ?? "");
  }
}

/** One tool row. When opened, arguments and results appear INSIDE the same
 *  card — not as a separate list below the group, because separating the
 *  two loses the link between command and result. */
/** Short label for a write's permission basis. */
function approvalLabel(approval: string | undefined): string | null {
  if (!approval) return null;
  if (approval === "auto") return "otomatis";
  if (approval === "approved") return "disetujui";
  if (approval === "denied") return "ditolak";
  if (approval === "denied-readonly") return "ditolak (hanya baca)";
  if (approval === "denied-timeout") return "ditolak (tanpa jawaban)";
  if (approval === "protected-path") return "path terproteksi";
  return approval;
}

function ToolRow({
  part,
  duration,
  approval,
  turnEnded = false,
}: {
  part: any;
  duration: (id: string | undefined) => number | null;
  approval?: string;
  turnEnded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const state = toolState(part, turnEnded);
  const name = getToolName(part) || "tool";
  const meta = KIND_META[toolKind(name)];
  const target = toolTarget(name, part.input);
  const output = typeof part.output === "string" ? part.output : part.output ? JSON.stringify(part.output, null, 1) : "";
  const hasDetail = !!part.input || !!output || !!part.errorText;
  const ms = state.tone === "run" ? null : duration(part.toolCallId);
  const izin = approvalLabel(approval);

  const tint =
    state.tone === "err"
      ? "ring-red-400/40 bg-red-400/10"
      : state.tone === "warn"
        ? "ring-amber-400/40 bg-amber-400/10"
        : state.tone === "ok"
          ? "ring-green-400/40 bg-green-400/10"
          : "ring-blue-400/40 bg-blue-400/10";

  return (
    <div className={`rounded-lg ring overflow-hidden mr-3 ${tint}`}>
      <button
        onClick={() => hasDetail && setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left ${hasDetail ? "hover:bg-black/5" : "cursor-default"}`}
      >
        <span className="h-lh flex items-center text-kumo-subtle shrink-0">
          {state.tone === "ok" ? <ShieldCheck size={13} /> : <meta.icon size={13} />}
        </span>
       
        <span className="text-sm font-medium text-kumo-default shrink-0">{meta.label}</span>
        <span className={`${MONO} text-kumo-subtle truncate min-w-0 flex-1`} title={target}>
          {name === "bash" ? `$ ${target}` : target || name}
        </span>
        <span className="text-sm text-kumo-subtle shrink-0">
          {state.label}
          {ms != null ? ` · ${fmtDuration(ms)}` : ""}
          {izin ? ` · ${izin}` : ""}
        </span>
        {hasDetail ? <span className="text-kumo-subtle shrink-0">{open ? "⌄" : "›"}</span> : null}
      </button>
      {open && hasDetail ? (
        <div className="border-t border-kumo-line/60 px-2.5 py-2 grid gap-2">
          {part.input ? (
            <pre className={`${MONO} text-kumo-subtle whitespace-pre-wrap break-all max-h-40 overflow-y-auto`}>
              {JSON.stringify(part.input, null, 1)}
            </pre>
          ) : null}
          {output ? (
            <pre className={`${MONO} text-kumo-subtle whitespace-pre-wrap break-all max-h-56 overflow-y-auto`}>{output.slice(0, 3000)}</pre>
          ) : null}
          {part.errorText ? <InlineAlert>{part.errorText}</InlineAlert> : null}
        </div>
      ) : null}
    </div>
  );
}

/** Work group: one title row + indented tool rows. All consecutive tools
 *  are merged so the transcript is not drowned by already-finished work. */
function ToolGroup({
  parts,
  duration,
  approvalById,
  turnEnded = false,
}: {
  parts: any[];
  duration: (id: string | undefined) => number | null;
  approvalById: Map<string, string>;
  /** The turn this group belongs to has finished (see `toolState`). */
  turnEnded?: boolean;
}) {
  const err = parts.map((p) => toolState(p, turnEnded)).filter((s) => s.tone === "err").length;
  const incomplete = parts.map((p) => toolState(p, turnEnded)).filter((s) => s.tone === "warn").length;
  const running = parts.map((p) => toolState(p, turnEnded)).filter((s) => s.tone === "run").length;
  const judul = groupTitle(parts);
  const JudulIcon = judul.icon;

  // `null` = the user has not decided yet. Undecided follows the work: rows are
  // visible while the group is running (you want to watch progress) and fold away
  // once it is done (finished work is a summary line, and the transcript stays
  // readable through a 30-step turn).
  //
  // The previous version ALWAYS showed the last two rows and toggled only what
  // came before them — so for the many one- and two-row groups a click changed
  // nothing at all, which reads as "the accordion cannot be closed" (reported
  // 2026-09-17). Now a click always has a visible effect.
  const [manualOpen, setManualOpen] = useState<boolean | null>(null);
  const open = manualOpen ?? running > 0;

  return (
    <div className="grid">
      <button
        onClick={() => setManualOpen(!open)}
        className="flex items-center gap-2 py-1.5 pr-3 text-left hover:bg-kumo-elevated rounded-lg px-1"
      >
        <RowIcon icon={JudulIcon} />
        <span className="text-sm text-kumo-subtle truncate">
          {judul.text} ·{" "}
          <span className={err ? "text-red-400" : incomplete ? "text-amber-400" : undefined}>
            {err ? `${err} gagal` : incomplete ? `${incomplete} tidak selesai` : running ? "berjalan" : "selesai"}
          </span>
        </span>
        <span className="ml-auto shrink-0 flex items-center gap-2">
          {running ? <Pulse /> : null}
          <span className="text-xs text-kumo-subtle">{open ? "sembunyikan" : `lihat ${parts.length} langkah`}</span>
          <Chevron open={open} />
        </span>
      </button>
      {open ? (
        <ChildRail>
          <div className="grid gap-1 py-1">
            {parts.map((part, i) => (
              <ToolRow key={part.toolCallId ?? i} part={part} duration={duration} approval={approvalById.get(part.toolCallId)} turnEnded={turnEnded} />
            ))}
          </div>
        </ChildRail>
      ) : null}
    </div>
  );
}

/** Approval (FR-E4). Deliberately prominent: the only block waiting on user
 *  action, and the agent truly stops until it is answered. */
function ApprovalBlock({ approval, onDecide }: { approval: PendingApproval; onDecide: (id: string, d: "approved" | "denied") => void }) {
  return (
    <div className="rounded-xl ring-1 ring-amber-400/50 bg-amber-400/10 px-4 py-3 grid gap-2">
      <div className="grid gap-1">
        <p className="text-sm font-medium text-kumo-default">Perlu persetujuan</p>
        <p className="text-sm text-kumo-subtle">
          Agent akan menjalankan <span className={`${MONO} text-kumo-default`}>{approval.name}</span>
          {approval.preview ? (
            <>
              {" — "}
              <span className={`${MONO} break-all`}>{approval.preview}</span>
            </>
          ) : null}
        </p>
        {approval.reason ? <p className="text-sm text-amber-400">{approval.reason}</p> : null}
      </div>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => onDecide(approval.toolCallId, "approved")}>
          Izinkan
        </Button>
        <Button variant="secondary" onClick={() => onDecide(approval.toolCallId, "denied")}>
          Tolak
        </Button>
      </div>
    </div>
  );
}

/** Files that changed under the agent (FR-C12). Deliberately visible rather than
 *  buried in a tool row: the agent's context may now be wrong, and its next write
 *  to one of these files will be refused (FR-C11) — the user should learn that
 *  here, not from a failed tool call they have to interpret. */
function StaleReadsNotice({ reads }: { reads: { path: string; readAt: string | null }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-kumo-line shrink-0">
      <div className="mx-auto w-full max-w-3xl px-6 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-start gap-2 rounded-lg ring ring-amber-400/40 bg-amber-400/10 px-3 py-2 text-left"
        >
          <Warning size={13} className="mt-0.5 shrink-0 text-amber-400" />
          <span className="text-sm text-kumo-default min-w-0">
            {reads.length === 1 ? "1 berkas berubah" : `${reads.length} berkas berubah`} di luar agent sejak terakhir dibaca — konteksnya bisa
            sudah tidak sesuai.
            <span className="block text-kumo-subtle">{open ? "Sembunyikan daftarnya" : "Lihat daftarnya"}</span>
          </span>
        </button>
        {open ? (
          <div className="mt-1.5 grid gap-0.5">
            {reads.map((r) => (
              <p key={r.path} className="flex items-center gap-2 text-sm">
                <span className={`${MONO} text-kumo-default truncate flex-1`} title={r.path}>
                  {r.path}
                </span>
                <span className="text-kumo-subtle shrink-0">{r.readAt ? `dibaca ${relTime(r.readAt)}` : ""}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Files of this thread the ledger cannot attribute to a turn.
 *
 *  Files written from now on appear under the answer that wrote them (see
 *  `FileCard`), so this section only carries rows recorded before the ledger knew
 *  which turn wrote them — older conversations, or a turn whose message failed to
 *  save. It renders the same cards, so a file is never listed twice and never
 *  disappears: it is either attributed (in the transcript) or it is here.
 */
function UnattributedFiles({ detail }: { detail: ThreadDetail }) {
  const [open, setOpen] = useState(true);
  const files = detail.files.filter((f) => !f.messageId);
  if (!files.length) return null;

  const totalAdd = files.reduce((n, f) => n + (f.linesAdded ?? 0), 0);
  const totalDel = files.reduce((n, f) => n + (f.linesRemoved ?? 0), 0);

  return (
    <div className="border-t border-kumo-line shrink-0">
      <div className="mx-auto w-full max-w-3xl px-6">
        <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 py-2.5 text-left hover:bg-kumo-elevated">
          <span className="text-kumo-subtle">{open ? "▾" : "▸"}</span>
          <span className="text-sm font-medium text-kumo-default">{files.length} berkas berubah</span>
          <span className="text-sm text-green-400">+{totalAdd}</span>
          <span className="text-sm text-red-400">−{totalDel}</span>
          <span className="text-xs text-kumo-subtle ml-1">dari sebelum berkas punya penanda jawaban</span>
        </button>
      </div>
      {open ? (
        <div className="mx-auto w-full max-w-3xl px-6 pb-3 grid gap-2 max-h-72 overflow-y-auto">
          {files.map((f) => (
            <FileCard key={f.id} file={f} root={detail.rootPath ?? null} projectId={detail.thread.projectId} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
