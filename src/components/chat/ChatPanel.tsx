import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@cloudflare/kumo";
import { Check, Gear, MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import { ChatSurface } from "~/components/chat/ChatSurface";
import { ProviderSettings } from "~/components/providers/ProviderSettings";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { InlineAlert } from "~/components/ui/InlineAlert";
import { useChatProviders, useChatSearch, useChatThread, useChatThreads, type ThreadSummary } from "~/lib/use-chat";

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
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);

  const { detail, loading: detailLoading, refresh: refreshDetail } = useChatThread(activeId);

  useEffect(() => {
    if (!visible) return;
    if (activeId) return;
    if (threads.length) setActiveId(threads[0].id);
  }, [visible, threads, activeId]);

  useEffect(() => {
    if (activeId && !loading && !threads.some((t) => t.id === activeId)) setActiveId(null);
  }, [threads, activeId, loading]);

  const active = useMemo(() => threads.find((t) => t.id === activeId) ?? null, [threads, activeId]);

  // Drag the panel's left edge to resize, same as the terminal panel.
  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent) => {
      const next = window.innerWidth - e.clientX;
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)));
    };
    const up = () => setDragging(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [dragging]);

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
      {/* Resize edge */}
      <div
        onMouseDown={() => setDragging(true)}
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
          <ThreadPicker threads={threads} activeId={activeId} onSelect={setActiveId} projectId={projectId} />
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
            <div className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm text-kumo-subtle">Belum ada percakapan di project ini.</p>
              <Button variant="secondary" onClick={handleNew} disabled={creating}>
                Mulai percakapan
              </Button>
            </div>
          ) : detailLoading && !detail ? (
            <p className="text-sm text-kumo-subtle px-4 py-3">Memuat percakapan…</p>
          ) : detail ? (
            <ChatSurface
              key={detail.thread.id}
              threadId={detail.thread.id}
              detail={detail}
              providers={providers}
              onRefresh={() => {
                void refreshDetail();
                void refresh();
              }}
              onOpenProviders={() => setProvidersOpen(true)}
            />
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

/** Conversation picker: a chip that opens the list, not a native `<select>` —
 *  the system menu falls outside the app's design language and cannot hold
 *  subtext (changed-file count, compacted-context marker).
 *
 *  The popover also carries cross-thread message search (FR-B17): the panel is
 *  too narrow for a second search surface, and "which conversation was that in"
 *  is exactly the question this popover already answers. */
function ThreadPicker({
  threads,
  activeId,
  onSelect,
  projectId,
}: {
  threads: ThreadSummary[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const { hits, loading: searching } = useChatSearch(open ? projectId : undefined, query);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // A closed popover should not keep a stale query around: reopening it with
  // last week's results still on screen is worse than an empty field.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const active = threads.find((t) => t.id === activeId) ?? null;
  const searchingNow = query.trim().length >= 2;

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 rounded-lg px-2 py-1 ring ring-kumo-line hover:bg-kumo-elevated text-sm text-kumo-default"
        title="Ganti percakapan"
      >
        <span className="truncate min-w-0 flex-1 text-left">{active?.title || (threads.length ? "Pilih percakapan" : "Belum ada percakapan")}</span>
        <span className="text-kumo-subtle text-xs shrink-0">{open ? "⌄" : "⌃"}</span>
      </button>
      {open ? (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 max-h-80 overflow-y-auto rounded-xl bg-kumo-base ring ring-kumo-line shadow-lg p-1.5">
          <div className="sticky top-0 z-10 bg-kumo-base pb-1">
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
                  className="w-full flex flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-kumo-elevated"
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
              className={`w-full flex items-start gap-2 rounded-lg px-2.5 py-2 text-left ${t.id === activeId ? "bg-kumo-elevated" : "hover:bg-kumo-elevated"}`}
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
        </div>
      ) : null}
    </div>
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
