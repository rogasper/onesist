import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "~/lib/ai-client";
import { isReasoningUIPart, isTextUIPart, isToolUIPart, isDynamicToolUIPart, getToolName, type UIMessage } from "~/lib/ai-client";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import { Button } from "@cloudflare/kumo";
import { BookOpen, Brain, Check, Globe, ListChecks, MagnifyingGlass, PencilSimple, ShieldCheck, Terminal, Warning, Wrench, type Icon } from "@phosphor-icons/react";
import { InlineAlert } from "~/components/ui/InlineAlert";
import { CodeCard, isCardWorthyCode } from "~/components/chat/CodeCard";
import { ArtifactPreview } from "~/components/chat/ArtifactPreview";
import { WorkspacePanel, tabForPath } from "~/components/chat/WorkspacePanel";
import { Composer, type Attachment } from "~/components/chat/Composer";
import {
  uploadAttachment,
  useChatActions,
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

const ROUTE_TO_TAB: Record<string, { tab: string; label: string }> = {
  erd: { tab: "erd", label: "ERD" },
  spec: { tab: "spec", label: "API Spec" },
  task: { tab: "tasks", label: "Tasks" },
  td: { tab: "docs", label: "Docs" },
  rtm: { tab: "rtm", label: "Traceability" },
  sit: { tab: "sit", label: "SIT" },
  timeline: { tab: "tasks", label: "Timeline" },
  fsd: { tab: "fsd", label: "FSD" },
  sketch: { tab: "canvas", label: "Canvas" },
};

const MONO = "font-mono text-[0.8125rem]";

/** Token numbers that scan fast: 8,512 below ten thousand, 12.3k above. */
function fmtTokens(n: number): string {
  if (n < 10_000) return n.toLocaleString("id-ID");
  return new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

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

export function ChatSurface({ threadId, detail, providers, onRefresh, onOpenProviders }: Props) {
  const projectId = detail.thread.projectId;
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

  const { files: mentionFiles } = useMentionFiles(projectId);
  const { actions, projectFile } = useChatActions(projectId);

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
    setInput("");
    setAttachments([]);
    atBottomRef.current = true;
    setNow(Date.now());
    await sendMessage({ text: `${attachmentLine}${text}`.trim() });
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

  return (
    <div className="flex flex-col h-full min-h-0">
      <WorkspacePanel
        files={mentionFiles}
        changed={detail.files}
        onOpen={(filePath) => {
          // The panel does not render artifact viewers; it hands the file to its
          // own tab, which already knows how to show it (FR-C7).
          const tab = tabForPath(filePath);
          window.location.href = tab ? `/projects/${projectId}/${tab}` : `/projects/${projectId}/overview`;
        }}
      />

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
              toolDuration={toolDuration}
              approvalById={approvalById}
            />
          ))}

          {approvals.map((a) => (
            <ApprovalBlock key={a.toolCallId} approval={a} onDecide={decide} />
          ))}

          {error ? <InlineAlert>{error.message}</InlineAlert> : null}
        </div>
      </div>

      {streaming && startedAt ? (
        <div className="border-t border-kumo-line shrink-0">
          <div className="mx-auto w-full max-w-3xl px-6 py-1.5 flex items-center gap-2 text-xs text-kumo-subtle">
            <Pulse />
            <span>
              Menghasilkan balasan
              {mode === "agent" ? " · memakai tool" : ""} · berjalan {elapsedSeconds(startedAt, now)}s
            </span>
          </div>
        </div>
      ) : null}

      {detail.staleReads?.length ? <StaleReadsNotice reads={detail.staleReads} /> : null}

      {detail.files.length ? <ChangedFiles detail={detail} /> : null}

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
        hasSummary={detail.thread.hasSummary}
        attachments={attachments}
        onAttach={handleAttach}
        onRemoveAttachment={(path) => setAttachments((prev) => prev.filter((a) => a.path !== path))}
        attachBusy={attachBusy}
        attachError={attachError}
        actions={actions}
        actionFile={projectFile}
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
  toolDuration,
  approvalById,
}: {
  message: UIMessage;
  streaming: boolean;
  metadata?: Record<string, any>;
  projectId: string;
  toolDuration: (toolCallId: string | undefined) => number | null;
  approvalById: Map<string, string>;
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
        if (b.kind === "notice") return <NoticeBlock key={b.key} data={b.data} />;
        if (b.kind === "todos") return <TodoPanel key={b.key} todos={b.todos} />;
        if (b.kind === "tools") return <ToolGroup key={b.key} parts={b.parts} duration={toolDuration} approvalById={approvalById} />;
        // Answer: no box and no background — the only block read in
        // sequence, so it must not compete with the surrounding chrome.
        return (
          <div key={b.key} className="text-sm leading-relaxed text-kumo-default">
            <MarkdownViewer
              content={b.text}
              codeRenderer={(lang, code) => (isCardWorthyCode(lang, code) ? <CodeCard lang={lang} code={code} projectId={projectId} /> : null)}
            />
          </div>
        );
      })}

      {inTok || outTok ? (
        <p className="text-xs text-kumo-subtle border-t border-kumo-line pt-2 flex items-center gap-2">
          <span>↑{fmtTokens(inTok ?? 0)} masuk</span>
          <span>↓{fmtTokens(outTok ?? 0)} keluar</span>
          {reasoningMs ? <span>· berpikir {fmtDuration(reasoningMs)}</span> : null}
          {failed ? <span className="text-amber-400">· {metadata?.status === "aborted" ? "dihentikan" : "berakhir dengan error"}</span> : null}
        </p>
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
function NoticeBlock({ data }: { data: any }) {
  if (data?.kind !== "compacted") return null;
  return (
    <div className="rounded-lg ring ring-kumo-line px-3 py-2 text-sm text-kumo-subtle">
      Konteks percakapan diringkas
      {data.estimatedBefore ? ` · perkiraan ${fmtTokens(data.estimatedBefore)} → ${fmtTokens(data.estimatedAfter ?? 0)} token` : ""}.
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

function toolState(part: any): { tone: "run" | "ok" | "err"; label: string } {
  if (part.state === "output-error" || part.errorText) return { tone: "err", label: "gagal" };
  if (part.state === "output-available") return { tone: "ok", label: "selesai" };
  if (part.state === "input-streaming" || part.state === "input-available") return { tone: "run", label: "berjalan" };
  return { tone: "run", label: "menunggu" };
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
}: {
  part: any;
  duration: (id: string | undefined) => number | null;
  approval?: string;
}) {
  const [open, setOpen] = useState(false);
  const state = toolState(part);
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
}: {
  parts: any[];
  duration: (id: string | undefined) => number | null;
  approvalById: Map<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const err = parts.map(toolState).filter((s) => s.tone === "err").length;
  const running = parts.map(toolState).filter((s) => s.tone === "run").length;
  const judul = groupTitle(parts);
  const JudulIcon = judul.icon;
  const tampil = open ? parts : parts.slice(-2);

  return (
    <div className="grid">
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 py-1.5 pr-3 text-left hover:bg-kumo-elevated rounded-lg px-1">
        <RowIcon icon={JudulIcon} />
        <span className="text-sm text-kumo-subtle truncate">
          {judul.text} · <span className={err ? "text-red-400" : undefined}>{err ? `${err} gagal` : running ? "berjalan" : "selesai"}</span>
        </span>
        <span className="ml-auto shrink-0 flex items-center gap-2">
          {running ? <Pulse /> : null}
          <Chevron open={open} />
        </span>
      </button>
      <ChildRail>
        <div className="grid gap-1 py-1">
          {tampil.map((part, i) => (
            <ToolRow key={part.toolCallId ?? i} part={part} duration={duration} approval={approvalById.get(part.toolCallId)} />
          ))}
          {!open && parts.length > 2 ? (
            <button onClick={() => setOpen(true)} className="text-left text-sm text-kumo-brand hover:underline py-1">
              +{parts.length - 2} langkah lagi
            </button>
          ) : null}
        </div>
      </ChildRail>
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

/** Coarse relative time. The read timestamp is ISO; the only question the user
 *  has is "before or after my edit", so minutes and hours are enough. */
function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "baru saja";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const jam = Math.floor(min / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}

/** Changed files (FR-C3, FR-C4), read from the ledger in the DB. The diff
 *  was already computed at write time, so expanding a row touches no disk. */
function ChangedFiles({ detail }: { detail: ThreadDetail }) {
  const [open, setOpen] = useState(true);
  const files = detail.files;
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
        </button>
      </div>
      {open ? (
        <div className="mx-auto w-full max-w-3xl px-6 pb-3 grid gap-1 max-h-64 overflow-y-auto">
          {files.map((f) => (
            <FileRow key={f.id} file={f} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FileRow({ file }: { file: ThreadFile }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"diff" | "content">("diff");
  const target = file.route ? ROUTE_TO_TAB[file.route] : undefined;
  const opLabel = file.op === "create" ? "baru" : file.op === "update" ? "diubah" : file.op === "delete" ? "dihapus" : "dipindah";
  const projectId = window.location.pathname.split("/")[2];
  const diff = file.diffJson ?? null;
  const canPreview = file.op !== "delete";

  return (
    <div className="grid">
      <div className="flex items-center gap-3 text-sm">
        <button
          onClick={() => (diff || canPreview) && setOpen((v) => !v)}
          className={`w-16 shrink-0 text-left text-kumo-subtle ${diff || canPreview ? "hover:text-kumo-default" : "cursor-default"}`}
          title={diff ? "Lihat perubahan atau isinya" : canPreview ? "Lihat isinya" : undefined}
        >
          {diff || canPreview ? (open ? "▾ " : "▸ ") : ""}
          {opLabel}
        </button>
        <span className={`${MONO} text-kumo-default truncate flex-1`} title={file.path}>
          {file.path}
        </span>
        {file.linesAdded || file.linesRemoved ? (
          <span className="shrink-0">
            <span className="text-green-400">+{file.linesAdded ?? 0}</span> <span className="text-red-400">−{file.linesRemoved ?? 0}</span>
          </span>
        ) : null}
        {file.source !== "tool" ? <span className="text-kumo-subtle shrink-0">({file.source})</span> : null}
        {target && projectId ? (
          <a href={`/projects/${projectId}/${target.tab}`} className="text-kumo-brand shrink-0 hover:underline">
            {target.label}
          </a>
        ) : null}
      </div>
      {open ? (
        <div className="mt-1 mb-2 grid gap-1.5">
          {/* Two views of the same file, never both at once: the panel is ~460px
              wide, and stacking a diff under a preview buries the transcript. */}
          <div className="flex rounded-lg ring ring-kumo-line p-0.5 w-fit">
            {(diff ? (["diff", "content"] as const) : (["content"] as const)).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-md px-2 py-0.5 text-xs ${view === v ? "bg-kumo-tint text-kumo-default" : "text-kumo-subtle hover:bg-kumo-elevated"}`}
              >
                {v === "diff" ? "Perubahan" : "Isi"}
              </button>
            ))}
          </div>
          {view === "diff" && diff ? (
            <pre className={`${MONO} max-h-56 overflow-auto rounded-lg ring ring-kumo-line px-2.5 py-2 bg-kumo-base`}>
              {diff.split("\n").map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("+") ? "text-green-400" : line.startsWith("-") ? "text-red-400" : line.startsWith("@@") ? "text-kumo-brand" : "text-kumo-subtle"
                  }
                >
                  {line || " "}
                </div>
              ))}
            </pre>
          ) : (
            <ArtifactPreview path={file.path} route={file.route} projectId={projectId} />
          )}
        </div>
      ) : null}
    </div>
  );
}
