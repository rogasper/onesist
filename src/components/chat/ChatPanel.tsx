import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Popover } from "@cloudflare/kumo";
import { ArrowsInSimple, ArrowsOutSimple, Brain, GitBranch, CaretUpDown, Check, FolderOpen, Gear, MagnifyingGlass, Plus, TerminalWindow, X, type Icon } from "@phosphor-icons/react";
import { ChatSidePanel, type SidePanelView } from "~/components/chat/ChatSidePanel";
import { ChatSurface } from "~/components/chat/ChatSurface";
import { WorkspaceDialog } from "~/components/chat/WorkspaceDialog";
import { ThreadIdProvider } from "~/components/chat/thread-context";
import { splitChatTasks, subscribeChatTasks, takePendingChatTasks } from "~/lib/chat-task";
import { launchInTerminal } from "~/lib/terminal-launch";
import { lineageText } from "~/components/chat/chat-view";
import { ProjectIdProvider } from "~/components/markdown/workspace-image";
import { ProviderSettings } from "~/components/providers/ProviderSettings";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { InlineAlert } from "~/components/ui/InlineAlert";
import { fetchTerminalCommand, mergeBackThread, queueChatText, useChatActivityEvents, useChatProviders, useChatSearch, useChatThread, useChatThreads, useChatWorkspaceEvents, type ThreadSummary } from "~/lib/use-chat";
import { isDetailFor, threadBadges } from "~/components/chat/chat-state";
import { relTime } from "~/lib/rel-time";
import { usePanelResize } from "~/lib/use-panel-resize";
import { RIGHT_DOCK_ID } from "~/components/layout/RightDock";

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
/** Narrowest the project area may get next to the chat before the chat floats over it. */
const MIN_CONTENT_WIDTH = 560;
/** Expanded, the chat covers the project area and leaves this much on the left (the sidebar). */
const EXPANDED_OFFSET_PX = 232;
const EXPANDED_KEY = "chat-panel-expanded";

interface Props {
  visible: boolean;
  onClose: () => void;
  projectId: string;
}

export function ChatPanel({ visible, onClose, projectId }: Props) {
  const { threads, loading, error, refresh, createThread, deleteThread } = useChatThreads(projectId);
  // A run starting, finishing, or asking for approval changes the badges: re-read the list.
  useChatActivityEvents(() => void refresh());
  const { providers, refresh: refreshProviders } = useChatProviders();

  const [activeId, setActiveId] = useState<string | null>(null);
  const [providersOpen, setProvidersOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ThreadSummary | null>(null);
  const [creating, setCreating] = useState(false);
  /** The Berkas / Memori sheet over the transcript, or closed. */
  const [side, setSide] = useState<SidePanelView | null>(null);
  const { width, dragging, handleProps: resizeHandleProps } = usePanelResize({
    min: MIN_WIDTH,
    max: MAX_WIDTH,
    initial: DEFAULT_WIDTH,
    storageKey: "chat-panel-width",
  });

  const { detail, loading: detailLoading, refresh: refreshDetail } = useChatThread(activeId);

  // A sheet belongs to the thread it was opened on.
  useEffect(() => {
    setSide(null);
  }, [activeId]);

  // Persist and restore active thread per project:
  // When opening or switching to a project, restore the last opened thread
  // or automatically select the most recent thread if available.
  const threadStorageKey = `onesist:project:${projectId}:chat-thread`;
  const restoredProjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (loading || threads.length === 0) return;
    if (restoredProjectRef.current === projectId) return;
    restoredProjectRef.current = projectId;

    let savedId: string | null = null;
    try {
      savedId = window.localStorage.getItem(threadStorageKey);
    } catch {}

    if (savedId && threads.some((t) => t.id === savedId)) {
      setActiveId(savedId);
    } else if (!activeId && threads.length > 0) {
      // Select the latest thread of the project
      setActiveId(threads[0].id);
    }
  }, [projectId, threads, loading, threadStorageKey, activeId]);

  // Save activeId to localStorage whenever it changes
  useEffect(() => {
    if (!activeId) return;
    try {
      window.localStorage.setItem(threadStorageKey, activeId);
    } catch {}
  }, [activeId, threadStorageKey]);

  // The selection must not outlive its thread: after a delete, or after
  // switching to another project (whose thread list does not contain it),
  // clear activeId and stored reference.
  useEffect(() => {
    if (activeId && !loading && !threads.some((t) => t.id === activeId)) {
      setActiveId(null);
      try {
        window.localStorage.removeItem(threadStorageKey);
      } catch {}
    }
  }, [threads, activeId, loading, threadStorageKey]);
  const active = useMemo(() => threads.find((t) => t.id === activeId) ?? null, [threads, activeId]);

  // "Lanjutkan di terminal": only for a thread that runs in an OpenCode or Antigravity session, and not mid-run.
  const threadProvider = detail ? (providers.find((p) => p.id === detail.thread.providerId) ?? providers.find((p) => p.isDefault) ?? null) : null;
  const canContinueInTerminal =
    !!detail?.thread.cliSessionId && threadProvider?.apiStyle === "cli" && (threadProvider.cliAgent === "opencode" || threadProvider.cliAgent === "antigravity" || threadProvider.cliAgent === "codex" || threadProvider.cliAgent === "claude" || threadProvider.cliAgent === "pi");
  const threadBusy = !!detail?.activeRun || !!active?.activity?.running;
  const [terminalNote, setTerminalNote] = useState<string | null>(null);
  // Fase 4B: a branch shows where it came from and can bring its work back.
  const [merging, setMerging] = useState(false);
  // Fase 4C: where the thread's CLI agent works. After a move the transcript is mounted
  // again so the workspace divider shows (a move never happens during a run).
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [surfaceEpoch, setSurfaceEpoch] = useState(0);
  const showWorkspace = !!detail && (threadProvider?.apiStyle === "cli" || !!detail.workspace?.strategy);
  useChatWorkspaceEvents(activeId, () => void refreshDetail());
  async function workspaceChanged() {
    await refreshDetail();
    setSurfaceEpoch((e) => e + 1);
  }
  async function mergeBack() {
    if (!detail) return;
    setMerging(true);
    setTerminalNote(null);
    try {
      const result = await mergeBackThread(detail.thread.id);
      await refresh();
      setActiveId(result.parentThreadId);
    } catch (err) {
      setTerminalNote(err instanceof Error ? err.message : "Gagal membawa hasil cabang");
    } finally {
      setMerging(false);
    }
  }
  async function continueInTerminal() {
    if (!detail) return;
    setTerminalNote(null);
    try {
      launchInTerminal(await fetchTerminalCommand(detail.thread.id));
    } catch (err) {
      setTerminalNote(err instanceof Error ? err.message : "Gagal membuka terminal");
    }
  }

  // A task from another page opens its thread here; a task with a prompt sends it once.
  // The list is re-read first: the new thread is not in it yet, and the effect above would
  // otherwise drop the selection as a thread that no longer exists.
  const [autoSend, setAutoSend] = useState<{ threadId: string; text: string } | null>(null);
  useEffect(() => {
    const take = () => {
      const { open: next, queued } = splitChatTasks(takePendingChatTasks());
      // Earlier tasks of the same click are not dropped: their prompts wait in their own threads.
      for (const task of queued) void queueChatText(task.threadId, task.text ?? "").catch(() => {});
      if (!next) return;
      void refresh().then(() => {
        setActiveId(next.threadId);
        if (next.text) setAutoSend({ threadId: next.threadId, text: next.text });
      });
    };
    take();
    return subscribeChatTasks(take);
  }, [refresh]);

  async function handleNew() {
    setCreating(true);
    try {
      const t = await createThread({ permissionMode: "ask" });
      setActiveId(t.id);
    } finally {
      setCreating(false);
    }
  }

  // The project area must keep room (P3.2): below MIN_CONTENT_WIDTH the chat floats over it
  // instead of squeezing it. The width of the row the panel sits in decides, not the panel's own
  // mode, so the switch cannot flip back and forth.
  // The row is the page (`[data-app-main]`) plus the dock the panel sits in. Their widths add up to
  // the same total whether the panel is in the dock (main shrinks) or floating (the dock is empty),
  // so the switch cannot flip back and forth.
  const [rowWidth, setRowWidth] = useState<number | null>(null);
  useEffect(() => {
    const main = document.querySelector<HTMLElement>("[data-app-main]");
    const dock = document.getElementById(RIGHT_DOCK_ID);
    if (!main || !dock) return;
    // Measured again when the panel opens or changes width: opening it may fold the app
    // sidebar, which changes the row without any resize event on the row itself.
    const measure = () => setRowWidth(main.clientWidth + dock.clientWidth);
    // Measured at once, and again on the next frame (the sidebar may still be moving); the frame
    // callback alone never runs in a hidden page.
    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    observer.observe(dock);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [visible, width]);
  const [expanded, setExpanded] = useState<boolean>(() => {
    try {
      return typeof window !== "undefined" && window.localStorage.getItem(EXPANDED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(EXPANDED_KEY, next ? "1" : "0");
      } catch {
        /* storage blocked: the choice simply is not remembered */
      }
      return next;
    });
  };
  const floating = visible && (expanded || (rowWidth !== null && rowWidth - width < MIN_CONTENT_WIDTH));
  const panelWidth = expanded ? `calc(100vw - ${EXPANDED_OFFSET_PX}px)` : width;

  return (
    <div
      className={
        !visible
          ? "hidden"
          : floating
            ? "fixed top-0 bottom-0 right-0 z-40 flex min-h-0 shadow-2xl @container/chat"
            : "flex shrink-0 h-full min-h-0 @container/chat"
      }
      style={{ width: panelWidth }}
    >
      {/* Resize edge. Pointer events with capture (see usePanelResize): the drag
          must not select the transcript text it travels over. */}
      <div
        {...resizeHandleProps}
        className={`w-1 shrink-0 cursor-col-resize ${dragging ? "bg-kumo-brand" : "hover:bg-kumo-brand/40"}`}
        title="Geser untuk mengubah lebar"
      />

      <div className={`flex-1 min-w-0 flex flex-col min-h-0 ${floating ? "app-card" : "bg-kumo-elevated border-l border-kumo-line"}`}>
        {/* Control row. This panel is narrow, so the conversation list uses
            a picker, not its own column. */}
        <header className="flex items-center gap-2 px-3 h-[52px] border-b border-kumo-line shrink-0">
          <Button variant="ghost" onClick={handleNew} disabled={creating} title="Percakapan baru">
            <Plus size={14} />
          </Button>
          <ThreadPicker threads={threads} activeId={activeId} onSelect={setActiveId} projectId={projectId} panelVisible={visible} />
          {detail ? (
            <>
              <SideToggle
                view="files"
                current={side}
                onToggle={setSide}
                icon={FolderOpen}
                label="Berkas"
                count={detail.files.length}
                // Amber dot: the agent's context may be wrong (FR-C12), so the header says so
                // even while the sheet is closed.
                alert={(detail.staleReads?.length ?? 0) > 0 ? `${detail.staleReads.length} berkas berubah di luar agent` : null}
              />
              <SideToggle view="memory" current={side} onToggle={setSide} icon={Brain} label="Memori" />
            </>
          ) : null}
          {canContinueInTerminal ? (
            <Button
              variant="ghost"
              onClick={() => void continueInTerminal()}
              disabled={threadBusy}
              title={threadBusy ? "Tunggu sampai agent selesai" : "Lanjutkan di terminal"}
              aria-label="Lanjutkan di terminal"
            >
              <TerminalWindow size={14} />
            </Button>
          ) : null}
          {active ? (
            <Button variant="ghost" onClick={() => setPendingDelete(active)} title="Hapus percakapan">
              <X size={13} />
            </Button>
          ) : null}
          <Button variant="ghost" onClick={toggleExpanded} title={expanded ? "Kecilkan panel chat" : "Perluas panel chat"} aria-label={expanded ? "Kecilkan panel chat" : "Perluas panel chat"}>
            {expanded ? <ArrowsInSimple size={14} /> : <ArrowsOutSimple size={14} />}
          </Button>
          <Button variant="ghost" onClick={() => setProvidersOpen(true)} title="Pengaturan provider">
            <Gear size={14} />
          </Button>
          <Button variant="ghost" onClick={onClose} title="Tutup panel">
            <X size={14} />
          </Button>
        </header>

        {detail?.lineage ? (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-kumo-line text-xs text-kumo-subtle">
            <GitBranch size={12} className="shrink-0" />
            <span className="truncate">{lineageText(detail.lineage)}</span>
            {!detail.lineage.parentMissing ? (
              <button onClick={() => setActiveId(detail.lineage!.parentThreadId)} className="shrink-0 text-kumo-brand hover:underline">
                Buka induk
              </button>
            ) : null}
            {!detail.lineage.parentMissing && detail.lineage.unmerged > 0 ? (
              <button
                onClick={() => void mergeBack()}
                disabled={merging || threadBusy}
                title={threadBusy ? "Tunggu sampai agent selesai" : "Bawa hasil kerja cabang ini ke thread induk"}
                className="ml-auto shrink-0 rounded-md px-2 py-0.5 ring ring-kumo-line text-kumo-default hover:bg-kumo-elevated disabled:opacity-50"
              >
                {merging ? "Membawa…" : `Bawa hasil ke induk (${detail.lineage.unmerged})`}
              </button>
            ) : null}
          </div>
        ) : null}
        {showWorkspace && detail ? (
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-kumo-line text-xs text-kumo-subtle">
            <FolderOpen size={12} className="shrink-0" />
            <span className="truncate" title={detail.workspace?.path ?? detail.rootPath ?? undefined}>
              {detail.workspace?.label ?? "Root project"}
            </span>
            {detail.workspace?.missing ? <span className="shrink-0 text-red-400">· folder tidak ditemukan</span> : null}
            {detail.workspace?.setup?.state === "running" ? <span className="shrink-0">· setup berjalan…</span> : null}
            {detail.workspace?.setup?.state === "failed" ? (
              <span className="shrink-0 text-red-400" title={detail.workspace.setup.tail}>
                · setup gagal
              </span>
            ) : null}
            <button
              onClick={() => setWorkspaceOpen(true)}
              disabled={threadBusy}
              title={threadBusy ? "Tunggu sampai agent selesai" : "Pilih tempat agent CLI bekerja"}
              className="ml-auto shrink-0 rounded-md px-2 py-0.5 ring ring-kumo-line text-kumo-default hover:bg-kumo-elevated disabled:opacity-50"
            >
              Ganti workspace
            </button>
          </div>
        ) : null}
        {terminalNote ? (
          <div className="px-3 py-2 border-b border-kumo-line">
            <InlineAlert>{terminalNote}</InlineAlert>
          </div>
        ) : null}

        {error ? (
          <div className="px-3 py-2">
            <InlineAlert>{error}</InlineAlert>
          </div>
        ) : null}

        <div className="flex-1 min-h-0 relative">
          {!activeId ? (
            <ThreadStartState threads={threads} loading={loading} creating={creating} onNew={handleNew} onPick={setActiveId} />
          ) : detailLoading && !isDetailFor(detail, activeId) ? (
            <p className="text-sm text-kumo-subtle px-4 py-3">Memuat percakapan…</p>
          ) : isDetailFor(detail, activeId) && detail ? (
            <ProjectIdProvider projectId={projectId}>
              <ThreadIdProvider value={detail.thread.id}>
                <ChatSurface
                  key={`${detail.thread.id}:${surfaceEpoch}`}
                  threadId={detail.thread.id}
                  detail={detail}
                  providers={providers}
                  onRefresh={() => {
                    void refreshDetail();
                    void refresh();
                  }}
                  onOpenProviders={() => setProvidersOpen(true)}
                  onOpenThread={(id) => {
                    setActiveId(id);
                    void refresh();
                  }}
                  autoSend={autoSend?.threadId === detail.thread.id ? autoSend.text : null}
                  onAutoSent={() => setAutoSend(null)}
                />
              </ThreadIdProvider>
              <WorkspaceDialog
                open={workspaceOpen}
                threadId={detail.thread.id}
                projectId={projectId}
                onOpenChange={setWorkspaceOpen}
                onChanged={() => void workspaceChanged()}
              />
              {side ? <ChatSidePanel view={side} detail={detail} projectId={projectId} onClose={() => setSide(null)} /> : null}
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
/** Header button that opens one of the side sheets; pressing it again closes the sheet. */
function SideToggle({
  view,
  current,
  onToggle,
  icon: IconComponent,
  label,
  count,
  alert,
}: {
  view: SidePanelView;
  current: SidePanelView | null;
  onToggle: (next: SidePanelView | null) => void;
  icon: Icon;
  label: string;
  count?: number;
  /** Shown as an amber dot and in the tooltip, so a problem stays visible with the sheet closed. */
  alert?: string | null;
}) {
  const open = current === view;
  const title = alert ? `${label} · ${alert}` : label;
  return (
    <Button variant="ghost" onClick={() => onToggle(open ? null : view)} title={title} aria-label={title} aria-pressed={open}>
      <span className="relative inline-flex items-center gap-1">
        <IconComponent size={14} className={open ? "text-kumo-brand" : undefined} />
        {count ? <span className="text-[10px] tabular-nums text-kumo-subtle">{count}</span> : null}
        {alert ? <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-amber-400" /> : null}
      </span>
    </Button>
  );
}

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
              {threadBadges(t.activity).length ? (
                <span className="flex flex-wrap gap-x-2.5 text-xs">
                  {threadBadges(t.activity).map((b) => (
                    <span key={b.label} className={`inline-flex items-center gap-1 ${b.tone === "run" ? "text-blue-400" : "text-amber-400"}`}>
                      {b.tone === "run" ? <span className="h-1.5 w-1.5 rounded-full bg-blue-400 animate-pulse" /> : null}
                      {b.label}
                    </span>
                  ))}
                </span>
              ) : null}
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
