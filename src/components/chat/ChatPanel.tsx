import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Popover } from "@cloudflare/kumo";
import { CaretUpDown, Check, Gear, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { ChatSurface, type QueuedMessage } from "~/components/chat/ChatSurface";
import { ProjectIdProvider } from "~/components/markdown/workspace-image";
import { ProviderSettings } from "~/components/providers/ProviderSettings";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { InlineAlert } from "~/components/ui/InlineAlert";
import { useChatProviders, useChatSearch, useChatThread, useChatThreads, type ThreadSummary } from "~/lib/use-chat";
import { relTime } from "~/lib/rel-time";
import { usePanelResize } from "~/lib/use-panel-resize";

/**
 * Chat panel docked on the right side (FR-B1).
 *
 * Deliberately a PANEL, not a tab page: the conversation runs alongside
 * work in other tabs — run the agent, then switch to the ERD tab to check
 * the result without losing the stream. The docking pattern matches the
 * terminal panel, including the `hidden`-instead-of-unmount trick so a
 * running stream does not break when the panel is hidden.
 */

const MIN_WIDTH = 320;
const DEFAULT_WIDTH = 460;
const MAX_WIDTH = 900;

const QUEUE_STORAGE_KEY = "onesist.chat.queue";

/** Queued messages per thread, and which threads have their queue held. */
interface QueueStorage {
  queues: Record<string, QueuedMessage[]>;
  paused: Record<string, boolean>;
}

function readQueueStorage(): QueueStorage {
  const empty: QueueStorage = { queues: {}, paused: {} };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    return {
      queues: parsed?.queues && typeof parsed.queues === "object" ? parsed.queues : {},
      paused: parsed?.paused && typeof parsed.paused === "object" ? parsed.paused : {},
    };
  } catch {
    // Unreadable storage must not block the chat; the queue simply starts empty.
    return empty;
  }
}

function writeQueueStorage(state: QueueStorage): void {
  if (typeof window === "undefined") return;
  try {
    // Drop empty entries so the stored value does not grow with finished threads.
    const queues = Object.fromEntries(Object.entries(state.queues).filter(([, items]) => items.length));
    const paused = Object.fromEntries(Object.entries(state.paused).filter(([id, on]) => on && queues[id]));
    window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify({ queues, paused }));
  } catch {
    /* quota or private mode: the queue still works for this session */
  }
}

interface Props {
  visible: boolean;
  onClose: () => void;
  projectId: string;
}

export function ChatPanel({ visible, onClose, projectId }: Props) {
  const { threads, loading, error, refresh, createThread, deleteThread } = useChatThreads(projectId);
  const { providers, refresh: refreshProviders } = useChatProviders();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [providersOpen, setProvidersOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ThreadSummary | null>(null);
  const [creating, setCreating] = useState(false);
  /**
   * Messages typed while a run is active, per thread id.
   *
   * Held here, not in `ChatSurface`, because the surface is keyed by thread id
   * and remounts on every switch: a queue that vanished because the user glanced
   * at another conversation would be worse than no queue at all.
   */
  // The queue survives a reload: it is the user's own unsent work. It is read on
  // first render; the panel shows no conversation until one is picked, so no
  // server-rendered markup can differ from this.
  const [queueState, setQueueState] = useState<QueueStorage>(() => readQueueStorage());
  const { queues, paused: pausedQueues } = queueState;
  useEffect(() => {
    writeQueueStorage(queueState);
  }, [queueState]);
  const enqueue = useCallback((threadId: string, text: string) => {
    setQueueState((prev) => ({
      ...prev,
      queues: { ...prev.queues, [threadId]: [...(prev.queues[threadId] ?? []), { id: crypto.randomUUID(), text }] },
    }));
  }, []);
  const removeQueued = useCallback((threadId: string, id: string) => {
    setQueueState((prev) => ({
      ...prev,
      queues: { ...prev.queues, [threadId]: (prev.queues[threadId] ?? []).filter((q) => q.id !== id) },
    }));
  }, []);
  /** Messages a run did not take in go back to the FRONT of the queue, in order. */
  const restoreQueued = useCallback((threadId: string, texts: string[]) => {
    setQueueState((prev) => ({
      ...prev,
      queues: {
        ...prev.queues,
        [threadId]: [...texts.map((text) => ({ id: crypto.randomUUID(), text })), ...(prev.queues[threadId] ?? [])],
      },
    }));
  }, []);
  /** Moves one queued message to the front, so it is the next thing sent. */
  const promoteQueued = useCallback((threadId: string, id: string) => {
    setQueueState((prev) => {
      const items = prev.queues[threadId] ?? [];
      const item = items.find((q) => q.id === id);
      if (!item) return prev;
      return { ...prev, queues: { ...prev.queues, [threadId]: [item, ...items.filter((q) => q.id !== id)] } };
    });
  }, []);
  const setQueuePaused = useCallback((threadId: string, paused: boolean) => {
    setQueueState((prev) => ({ ...prev, paused: { ...prev.paused, [threadId]: paused } }));
  }, []);
  const { width, dragging, handleProps: resizeHandleProps } = usePanelResize({
    min: MIN_WIDTH,
    max: MAX_WIDTH,
    initial: DEFAULT_WIDTH,
    storageKey: "chat-panel-width",
  });

  const { detail, loading: detailLoading, refresh: refreshDetail } = useChatThread(activeId);

  // NO auto-select on open (changed 2026-09-18, UJI-MANUAL C10). It used to jump
  // straight into the most recently updated thread, so reopening the app
  // dropped the user back into yesterday's conversation when what they wanted
  // was an empty chat. Now the panel starts on the start state (new conversation
  // button + the three most recent threads) and the active thread is only ever
  // set by an explicit choice. Within one app session, closing and reopening the
  // panel keeps whatever was chosen, because the panel stays mounted (`hidden`).

  // The selection must not outlive its thread: after a delete, or after
  // switching to another project (whose thread list does not contain it), the
  // panel goes back to the start state instead of showing a stale thread.
  useEffect(() => {
    if (activeId && !loading && !threads.some((t) => t.id === activeId)) setActiveId(null);
  }, [threads, activeId, loading]);

  const active = useMemo(() => threads.find((t) => t.id === activeId) ?? null, [threads, activeId]);

  async function handleNew() {
    setCreating(true);
    try {
      const t = await createThread({ permissionMode: "ask" });
      setActiveId(t.id);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={visible ? "flex shrink-0 h-full min-h-0" : "hidden"} style={{ width }}>
      {/* Resize edge. Pointer events with capture (see usePanelResize): the drag
          must not select the transcript text it travels over. */}
      <div
        {...resizeHandleProps}
        className={`w-1 shrink-0 cursor-col-resize ${dragging ? "bg-kumo-brand" : "hover:bg-kumo-brand/40"}`}
        title="Geser untuk mengubah lebar"
      />

      <div className="flex-1 min-w-0 flex flex-col min-h-0 app-card ml-1">
        {/* Control row. This panel is narrow, so the conversation list uses
            a picker, not its own column. */}
        <header className="flex items-center gap-2 px-3 py-2 border-b border-kumo-line shrink-0">
          <Button variant="ghost" onClick={handleNew} disabled={creating} title="Percakapan baru">
            <Plus size={14} />
          </Button>
          <ThreadPicker threads={threads} activeId={activeId} onSelect={setActiveId} projectId={projectId} panelVisible={visible} />
          {active ? (
            <Button variant="ghost" onClick={() => setPendingDelete(active)} title="Hapus percakapan">
              <X size={13} />
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => setProvidersOpen(true)} title="Pengaturan provider">
            <Gear size={14} />
          </Button>
          <Button variant="ghost" onClick={onClose} title="Tutup panel">
            <X size={14} />
          </Button>
        </header>

        {error ? (
          <div className="px-3 py-2">
            <InlineAlert>{error}</InlineAlert>
          </div>
        ) : null}

        <div className="flex-1 min-h-0">
          {!activeId ? (
            <ThreadStartState threads={threads} loading={loading} creating={creating} onNew={handleNew} onPick={setActiveId} />
          ) : detailLoading && !detail ? (
            <p className="text-sm text-kumo-subtle px-4 py-3">Memuat percakapan…</p>
          ) : detail ? (
            <ProjectIdProvider projectId={projectId}>
              <ChatSurface
                key={detail.thread.id}
                threadId={detail.thread.id}
                detail={detail}
                providers={providers}
                queued={queues[detail.thread.id] ?? []}
                onEnqueue={(text) => enqueue(detail.thread.id, text)}
                onRemoveQueued={(id) => removeQueued(detail.thread.id, id)}
                onRefresh={() => {
                  void refreshDetail();
                  void refresh();
                }}
                onOpenProviders={() => setProvidersOpen(true)}
                queuePaused={!!pausedQueues[detail.thread.id]}
                onPauseQueue={() => setQueuePaused(detail.thread.id, true)}
                onResumeQueue={() => setQueuePaused(detail.thread.id, false)}
                onRestoreQueued={(texts) => restoreQueued(detail.thread.id, texts)}
                onPromoteQueued={(id) => promoteQueued(detail.thread.id, id)}
              />
            </ProjectIdProvider>
          ) : null}
        </div>
      </div>

      <ProviderSettings
        open={providersOpen}
        onClose={() => {
          setProvidersOpen(false);
          void refreshProviders();
          void refreshDetail();
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus percakapan?"
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteThread(pendingDelete.id);
          if (activeId === pendingDelete.id) setActiveId(null);
          setPendingDelete(null);
        }}
        confirmLabel="Hapus"
      >
        Riwayat pesan dan daftar berkas yang berubah pada percakapan ini akan dihapus. Berkas di workspace project tidak ikut terhapus.
      </ConfirmDialog>
    </div>
  );
}

/** Start state of the panel: no conversation is active yet.
 *
 *  This is how the panel OPENS (see the note above the removed auto-select), so
 *  it is not an error state and must not look like one: the way back into the
 *  work is one click away in both directions — start a new conversation, or
 *  continue one of the three most recent. The full list stays in the picker in
 *  the header; three is how many fit before this stops being scannable. */
function ThreadStartState({
  threads,
  loading,
  creating,
  onNew,
  onPick,
}: {
  threads: ThreadSummary[];
  loading: boolean;
  creating: boolean;
  onNew: () => void;
  onPick: (id: string) => void;
}) {
  if (loading && !threads.length) {
    return <p className="text-sm text-kumo-subtle px-4 py-3">Memuat percakapan…</p>;
  }

  const recent = threads.slice(0, 3);

  // One column, one width, and spacing that groups what belongs together: the
  // description sits with the action (gap-2), the "lanjutkan" list is a separate
  // block with a wider gap (kumo `related-text-spacing`). The previous version
  // used a single gap-3 for everything and a 320px list under a centered
  // paragraph, so the block read as three unrelated things.
  return (
    <div className="h-full flex flex-col items-center justify-center px-6">
      {/* Flex, NOT grid. With `justify-items-center` every child took its
          max-content width and was allowed to overflow the column, so the intro
          line never rewrapped: measured 2026-09-27, the inner box stayed 392.5px
          wide while the panel went 460 → 320, pushing the text up to 94px past
          the card's right edge, where `overflow-hidden` clipped it. A flex
          column caps each item at the available width, so the sentence wraps
          instead of escaping. */}
      <div className="w-full max-w-sm flex flex-col items-center gap-6 text-center">
        <div className="flex w-full flex-col items-center gap-2">
          <p className="text-sm text-kumo-subtle text-pretty">
            {threads.length
              ? "Pilih percakapan lama untuk dilanjutkan, atau mulai yang baru."
              : "Belum ada percakapan di project ini."}
          </p>
          <Button variant="secondary" onClick={onNew} disabled={creating}>
            Mulai percakapan
          </Button>
        </div>

        {recent.length ? (
          <div className="w-full flex flex-col gap-0.5 text-left">
            {/* Sentence case, no tracking, 12px: a section label is not a heading
                (kumo `heading-case` / `font-tracking`). */}
            <p className="px-3 pb-1 text-xs text-kumo-subtle">Lanjutkan</p>
            {recent.map((t) => (
              <button
                key={t.id}
                onClick={() => onPick(t.id)}
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-kumo-elevated"
              >
                <span className="text-sm text-kumo-default truncate min-w-0 flex-1">{t.title || "Percakapan baru"}</span>
                <span className="text-xs text-kumo-subtle shrink-0 tabular-nums">{relTime(t.updatedAt)}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Conversation picker: a chip that opens the list, not a `<select>` — the
 *  system menu cannot hold subtext (mode, permission, tokens, compacted-context
 *  marker), and a plain form control cannot carry a second result set either.
 *
 *  Built on Kumo's `Popover` (Base UI): portaled, anchored to the chip, closes
 *  on outside click and Escape, and free of the panel's `overflow-hidden`. The
 *  app has no shadcn: its design system is Kumo, so the primitives come from
 *  there (`Popover`, `Select`, `Combobox`, `DropdownMenu`) rather than a second
 *  set of tokens and Radix dependencies.
 *
 *  The popover also carries cross-thread message search (FR-B17): the panel is
 *  too narrow for a second search surface, and "which conversation was that in"
 *  is exactly the question this popover already answers. */
function ThreadPicker({
  threads,
  activeId,
  onSelect,
  projectId,
  panelVisible,
}: {
  threads: ThreadSummary[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  projectId: string;
  /** The panel stays mounted when it is hidden, and the popover renders in a
   *  portal — so hiding the panel would leave the list floating over the app. */
  panelVisible: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { hits, loading: searching } = useChatSearch(open ? projectId : undefined, query);

  /**
   * Kumo's Popover owns the anchoring, the outside-click and the Escape key that
   * this used to hand-roll, and it renders in a portal — so the panel's
   * `overflow-hidden` can no longer clip the list.
   *
   * A closed popover must not keep a stale query: reopening it with last week's
   * results still on screen is worse than an empty field.
   */
  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setQuery("");
  }

  useEffect(() => {
    if (!panelVisible) setOpen(false);
  }, [panelVisible]);

  const active = threads.find((t) => t.id === activeId) ?? null;
  const searchingNow = query.trim().length >= 2;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {/* The chip keeps `flex-1 min-w-0` from the wrapper it replaced, so a long
          thread name still truncates instead of pushing the header buttons. */}
      <Popover.Trigger
        className="flex-1 min-w-0 flex items-center gap-2 rounded-lg px-2 py-1 ring ring-kumo-line hover:bg-kumo-elevated text-sm text-kumo-default"
        title="Ganti percakapan"
      >
        <span className="truncate min-w-0 flex-1 text-left">{active?.title || (threads.length ? "Pilih percakapan" : "Belum ada percakapan")}</span>
        <CaretUpDown size={12} className="text-kumo-subtle shrink-0" />
      </Popover.Trigger>
      <Popover.Content
        side="bottom"
        align="start"
        sideOffset={6}
        // Size and scrolling only: Kumo's popup already carries the elevation,
        // the hairline (outline + tip shadow, never a border with a shadow) and
        // the open animation. `p-1` keeps the inner rows' `rounded-lg`
        // concentric with the popup's `rounded-xl`.
        className="z-30 w-[var(--anchor-width)] min-w-[16rem] max-h-[70vh] overflow-y-auto overscroll-contain rounded-xl shadow-lg p-1"
      >
        <div className="sticky top-0 z-10 bg-kumo-elevated pb-1">
          <div className="flex items-center gap-1.5 rounded-lg px-2 h-8 ring ring-kumo-line">
            <MagnifyingGlass size={13} className="text-kumo-subtle shrink-0" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari pesan di semua percakapan"
              className="w-full bg-transparent text-sm text-kumo-default focus:outline-none placeholder:text-kumo-subtle"
            />
            {searching ? <span className="text-xs text-kumo-subtle shrink-0">…</span> : null}
          </div>
        </div>

        {searchingNow ? (
          <div className="pb-1">
            {hits.map((h) => (
              <button
                key={`${h.messageId}`}
                onClick={() => {
                  onSelect(h.threadId);
                  setOpen(false);
                }}
                className="w-full flex flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-kumo-tint"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-xs text-kumo-subtle shrink-0">{h.role === "user" ? "Anda" : "Agent"}</span>
                  <span className="text-xs text-kumo-subtle truncate">{h.threadTitle || "Percakapan baru"}</span>
                </span>
                <span className="text-sm leading-snug">
                  <Snippet text={h.snippet} />
                </span>
              </button>
            ))}
            {!hits.length && !searching ? <p className="px-2.5 py-2 text-sm text-kumo-subtle">Tidak ada pesan yang cocok.</p> : null}
          </div>
        ) : null}

        {searchingNow ? <div className="mx-2.5 border-t border-kumo-line/60 mb-1" /> : null}

        {threads.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              onSelect(t.id);
              setOpen(false);
            }}
            className={`w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left ${t.id === activeId ? "bg-kumo-tint" : "hover:bg-kumo-tint"}`}
          >
            <span className="w-4 shrink-0 text-kumo-brand">{t.id === activeId ? <Check size={13} weight="bold" /> : null}</span>
            <span className="grid gap-0.5 min-w-0">
              <span className="text-sm text-kumo-default truncate">{t.title || "Percakapan baru"}</span>
              <span className="text-xs text-kumo-subtle">
                {t.mode === "ask" ? "Menjawab" : t.mode === "plan" ? "Merencanakan" : "Mengerjakan"}
                {t.permissionMode === "readonly"
                  ? " · hanya baca"
                  : t.permissionMode === "no-shell"
                    ? " · tanpa shell"
                    : t.permissionMode === "auto"
                      ? " · otomatis"
                      : " · tanya dulu"}
                {t.tokensUsed ? ` · ${t.tokensUsed.toLocaleString("id-ID")} token` : ""}
                {t.hasSummary ? " · diringkas" : ""}
              </span>
            </span>
          </button>
        ))}
        {!threads.length ? <p className="px-2.5 py-3 text-sm text-kumo-subtle">Belum ada percakapan di project ini.</p> : null}
      </Popover.Content>
    </Popover>
  );
}

/** A search excerpt with its matched terms highlighted. The server wraps hits
 *  in char(1)/char(2) — control characters that cannot occur in message text —
 *  so no re-matching is needed on the client, and the split alternates
 *  plain / match / plain / match… */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/[\u0001\u0002]/);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className="text-kumo-brand">
            {part}
          </span>
        ) : (
          <span key={i} className="text-kumo-subtle">
            {part}
          </span>
        ),
      )}
    </>
  );
}
