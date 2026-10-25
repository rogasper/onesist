import { createFileRoute, Link, Outlet, useNavigate, useLocation, useSearch } from "@tanstack/react-router";
import { Badge } from "@cloudflare/kumo";
import { ArrowSquareOut, Cube, Terminal as TerminalIcon, ChatCircle as ChatIcon, FileText, FolderOpen, X, CaretLeft, PencilSimple, Columns, Eye, FloppyDisk, XCircle, CheckCircle, MagnifyingGlass } from "@phosphor-icons/react";
import { openPaneWindow } from "~/lib/window";
import { windowErrorText } from "~/lib/window-error";
import { InlineAlert } from "~/components/ui/InlineAlert";
import { loadProjectRouteData } from "~/lib/project-queries";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
// NOTE: AgentTerminal is imported EAGERLY (not lazy + Suspense). xterm is
// ~700KB, but mounting the terminal panel through <Suspense> on first open
// inserts a large subtree into a DOM whose React bookkeeping can desync —
// deterministically crashing with "insertBefore not a child". Eager import puts
// the panel in the initial tree (display:none when closed) so opening it is a
// style toggle, not a subtree insert. createXterm is still deferred until open.
import { AgentTermPanel } from "~/components/agent/AgentTerminal";
import { ChatPanel } from "~/components/chat/ChatPanel";
import { RightDock } from "~/components/layout/RightDock";
import { SplitWorkspace } from "~/components/layout/SplitWorkspace";
import {
  MAX_EXTRA_PANES,
  SPLIT_TABS,
  SPLIT_TAB_LABELS,
  addPane,
  isSplitTab,
  parseSplitSearch,
  readStoredSplit,
  removePane,
  serializeSplit,
  setPaneTab,
  shiftDirtyAfterRemove,
  splitStorageKey,
  clearDirty,
  type SplitState,
  type SplitTab,
} from "~/lib/split-layout";
import { subscribeQuotes } from "~/lib/chat-quote";
import { subscribeChatTasks } from "~/lib/chat-task";
import { subscribeTerminalLaunch } from "~/lib/terminal-launch";
import { foldSidebarForChat, restoreSidebarAfterChat } from "~/lib/sidebar-state";
import { TerminalErrorBoundary } from "~/components/agent/TerminalErrorBoundary";
import { useFileContent, useFileList, type FileEntry } from "~/lib/use-file-data";
import { useFileContextMenu } from "~/lib/use-file-context-menu";
import { useSkillInstall, skillNotice } from "~/lib/use-skill-install";
import { ProjectIdProvider } from "~/components/markdown/workspace-image";
import { FsdEditor, type EditorMode } from "~/components/fsd/FsdEditor";
import { AppButton } from "~/components/ui/AppButton";
import { ContextMenu } from "~/components/ui/ContextMenu";
import { EmptyState } from "~/components/ui/EmptyState";
import { ErrorState } from "~/components/ui/ErrorState";
import { ListSkeleton } from "~/components/ui/Skeleton";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { ExplorerShell } from "~/components/ui/ExplorerShell";
import { FileTree, type FileTreeHandle } from "~/components/ui/FileTree";
import { FilePreview, previewKindOf } from "~/components/ui/FilePreview";
import { ProjectNotFound } from "~/components/ui/ProjectNotFound";
import { PageHelpButton } from "~/components/ui/PageHelpButton";

export const Route = createFileRoute("/projects/$id")({
  loader: async ({ params }) => loadProjectRouteData(params.id),
  component: ProjectLayout,
});

const TAB_ITEMS = [
  { value: "overview", label: "Overview" },
  { value: "erd", label: "ERD" },
  { value: "canvas", label: "Canvas" },
  { value: "spec", label: "API Spec" },
  { value: "tasks", label: "Tasks" },
  { value: "fsd", label: "FSD Analyzer" },
  { value: "rtm", label: "Traceability" },
  { value: "sit", label: "SIT" },
  { value: "docs", label: "Docs" },
  { value: "wiki", label: "Wiki" },
  { value: "settings", label: "Settings" },
];

function ProjectLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { project } = Route.useLoaderData() as any;
  const [terminalOpen, setTerminalOpen] = useState(false);
  const chatStorageKey = project?.id ? `onesist:project:${project.id}:chat-open` : null;
  const [chatOpen, setChatOpen] = useState(() => {
    if (typeof window === "undefined" || !project?.id) return false;
    try {
      return window.localStorage.getItem(`onesist:project:${project.id}:chat-open`) === "true";
    } catch {
      return false;
    }
  });

  // Keep chatOpen in sync when switching projects
  useEffect(() => {
    if (!project?.id) return;
    try {
      const saved = window.localStorage.getItem(`onesist:project:${project.id}:chat-open`);
      if (saved !== null) {
        setChatOpen(saved === "true");
      }
    } catch {}
  }, [project?.id]);

  // Persist chatOpen state
  useEffect(() => {
    if (!chatStorageKey) return;
    try {
      window.localStorage.setItem(chatStorageKey, chatOpen ? "true" : "false");
    } catch {}
  }, [chatOpen, chatStorageKey]);
  useEffect(() => subscribeQuotes(() => setChatOpen(true)), []);
  useEffect(() => subscribeChatTasks(() => setChatOpen(true)), []);
  // The chat folds the app sidebar on a narrow window and gives it back when it closes (P3.2).
  useEffect(() => {
    if (chatOpen) foldSidebarForChat(window.innerWidth);
    else restoreSidebarAfterChat();
  }, [chatOpen]);
  const [termRetryKey, setTermRetryKey] = useState(0);
  const [terminalRunning, setTerminalRunning] = useState(false);
  // "Lanjutkan di terminal" from the chat: a running terminal session is ended only after the user agrees.
  const [terminalLaunch, setTerminalLaunch] = useState<{ command: string; nonce: number } | null>(null);
  const [launchToConfirm, setLaunchToConfirm] = useState<string | null>(null);
  const terminalRunningRef = useRef(false);
  terminalRunningRef.current = terminalRunning;
  const startTerminalLaunch = useCallback((command: string) => {
    setTerminalOpen(true);
    setTerminalLaunch({ command, nonce: Date.now() });
  }, []);
  useEffect(
    () =>
      subscribeTerminalLaunch((command) => {
        if (terminalRunningRef.current) setLaunchToConfirm(command);
        else startTerminalLaunch(command);
      }),
    [startTerminalLaunch],
  );
  const [openTabs, setOpenTabs] = useState<{ path: string; name: string }[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  /** Why the last "Window baru" did not open a window (for example the window limit). */
  const [windowError, setWindowError] = useState<string | null>(null);
  const skill = useSkillInstall();
  // Live defaultAgent — the route loader is cached/stale; refresh via the
  // "project-updated" event fired by Settings after saving.
  const [freshAgent, setFreshAgent] = useState<string | null>(null);
  const agent = freshAgent || project?.defaultAgent || "opencode";

  useEffect(() => {
    if (project?.id) skill.check(project.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);


  // Listen for project updates (e.g. defaultAgent changed in Settings) so the
  // terminal picks up the new agent without a manual refresh.
  useEffect(() => {
    const pid = project?.id;
    if (!pid) return;
    const refresh = () => {
      fetch(`/api/projects/${pid}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((d) => {
        if (d?.defaultAgent) setFreshAgent(d.defaultAgent);
      }).catch(() => {});
    };
    window.addEventListener("project-updated", refresh);
    return () => window.removeEventListener("project-updated", refresh);
  }, [project?.id]);

  const activeTab = location.pathname.includes("/erd") ? "erd"
    : location.pathname.includes("/canvas") ? "canvas"
    : location.pathname.includes("/spec") ? "spec"
    : location.pathname.includes("/wiki") ? "wiki"
    : location.pathname.includes("/tasks") ? "tasks"
    : location.pathname.includes("/fsd") ? "fsd"
    : location.pathname.includes("/rtm") ? "rtm"
    : location.pathname.includes("/sit") ? "sit"
    : location.pathname.includes("/docs") ? "docs"
    : location.pathname.includes("/settings") ? "settings"
    : "overview";

  // ── Split view: extra panes live in the URL (`panes`, `pdir`, `pr`) ──
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const split = useMemo(() => parseSplitSearch(search), [search]);
  const setSplit = useCallback((next: SplitState) => {
    navigate({ to: location.pathname, search: (prev: any) => ({ ...prev, ...serializeSplit(next) }), replace: true } as any);
  }, [navigate, location.pathname]);

  // Remember the layout per project; restore it when the URL brings none.
  const restoredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!project?.id) return;
    const key = splitStorageKey(project.id);
    if (restoredFor.current !== project.id) {
      restoredFor.current = project.id;
      if (split.panes.length === 0) {
        let stored = null as string | null;
        try { stored = window.localStorage.getItem(key); } catch {}
        const restored = readStoredSplit(stored);
        if (restored.panes.length > 0) {
          setSplit(restored);
          return;
        }
      }
    }
    try { window.localStorage.setItem(key, JSON.stringify(serializeSplit(split))); } catch {}
  }, [project?.id, split, setSplit]);

  // ── Persist and restore last active tab per project ──
  const lastTabKey = project?.id ? `onesist:project:${project.id}:last-tab` : null;
  useEffect(() => {
    if (!lastTabKey || !activeTab) return;
    try {
      window.localStorage.setItem(lastTabKey, activeTab);
    } catch {}
  }, [activeTab, lastTabKey]);

  const restoredTabFor = useRef<string | null>(null);
  useEffect(() => {
    if (!project?.id || !lastTabKey) return;
    if (restoredTabFor.current === project.id) return;
    restoredTabFor.current = project.id;

    // Only redirect if user landed on the base /projects/$id route without child tab in pathname
    const isBaseProjectRoute = !location.pathname.includes("/erd")
      && !location.pathname.includes("/canvas")
      && !location.pathname.includes("/spec")
      && !location.pathname.includes("/wiki")
      && !location.pathname.includes("/tasks")
      && !location.pathname.includes("/fsd")
      && !location.pathname.includes("/rtm")
      && !location.pathname.includes("/sit")
      && !location.pathname.includes("/docs")
      && !location.pathname.includes("/settings");

    if (isBaseProjectRoute) {
      try {
        const savedTab = window.localStorage.getItem(lastTabKey);
        if (savedTab && savedTab !== "overview" && TAB_ITEMS.some((t) => t.value === savedTab)) {
          navigate({
            to: `/projects/$id/${savedTab}` as any,
            params: { id: project.id },
            from: "/",
            search: (prev: any) => prev,
            replace: true,
          });
        }
      } catch {}
    }
  }, [project?.id, lastTabKey, location.pathname, navigate]);

  const [paneDirty, setPaneDirty] = useState<Record<number, boolean>>({});
  const handlePaneDirtyChange = useCallback((index: number, dirty: boolean) => {
    setPaneDirty((prev) => (Boolean(prev[index]) === dirty ? prev : { ...prev, [index]: dirty }));
  }, []);
  const [closeTarget, setCloseTarget] = useState<number | null>(null);
  // `swap` = the pane trades places with the main tab (the same loss as a tab change).
  const [tabTarget, setTabTarget] = useState<{ index: number; tab: SplitTab; swap?: boolean } | null>(null);
  // Changing a pane's tab replaces its content, so unsaved edits there are lost like on close.
  const applyPaneTab = useCallback((index: number, tab: SplitTab) => {
    setPaneDirty((prev) => clearDirty(prev, index));
    setSplit(setPaneTab(split, index, tab));
  }, [split, setSplit]);
  const requestPaneTab = useCallback((index: number, tab: SplitTab) => {
    if (paneDirty[index]) setTabTarget({ index, tab });
    else applyPaneTab(index, tab);
  }, [paneDirty, applyPaneTab]);
  const closePane = useCallback((index: number) => {
    setPaneDirty((prev) => shiftDirtyAfterRemove(prev, index));
    setSplit(removePane(split, index));
  }, [split, setSplit]);
  const requestClosePane = useCallback((index: number) => {
    if (paneDirty[index]) setCloseTarget(index);
    else closePane(index);
  }, [paneDirty, closePane]);
  const applySwap = useCallback((index: number) => {
    if (!isSplitTab(activeTab)) return;
    const paneTab = split.panes[index];
    const next = setPaneTab(split, index, activeTab);
    setPaneDirty((prev) => clearDirty(prev, index));
    navigate({ to: `/projects/$id/${paneTab}`, params: { id: project.id }, from: "/", search: (prev: any) => ({ ...prev, ...serializeSplit(next) }) } as any);
  }, [activeTab, split, navigate, project?.id]);
  // Swapping replaces the pane's content, so unsaved edits there are lost like on a tab change: ask first.
  const swapPane = useCallback((index: number) => {
    if (paneDirty[index]) {
      if (isSplitTab(activeTab)) setTabTarget({ index, tab: activeTab, swap: true });
    } else applySwap(index);
  }, [paneDirty, activeTab, applySwap]);
  const [splitMenu, setSplitMenu] = useState<{ x: number; y: number } | null>(null);

  const rootPath = project?.rootPath || "";

  // Reset file tabs when switching to a different project
  useEffect(() => {
    setOpenTabs([]);
    setActiveTabPath(null);
  }, [project?.id]);

  useEffect(() => {
    const handleOpenFileEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ path: string; name: string }>;
      if (customEvent.detail?.path) {
        const { path, name } = customEvent.detail;
        setOpenTabs((prev) => {
          if (prev.some((t) => t.path === path)) return prev;
          return [...prev, { path, name: name || path.split("/").pop() || path }];
        });
        setActiveTabPath(path);
      }
    };
    window.addEventListener("open-project-file", handleOpenFileEvent);
    return () => window.removeEventListener("open-project-file", handleOpenFileEvent);
  }, []);

  const handleFileClick = (file: { name: string; path: string }) => {
    // Markdown opens in the editor; PDFs and pictures open in their viewer (V3). Other text is
    // not opened here, as before.
    if (previewKindOf(file.path) === "text" && !file.path.endsWith(".md")) return;
    setOpenTabs((prev) => {
      if (prev.some((t) => t.path === file.path)) return prev;
      return [...prev, { path: file.path, name: file.name }];
    });
    setActiveTabPath(file.path);
  };

  const handleTabClose = (path: string) => {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path);
      if (idx === -1) return prev;
      const next = prev.filter((t) => t.path !== path);
      if (activeTabPath === path) {
        const neighbor = next[idx] ?? next[idx - 1] ?? null;
        setActiveTabPath(neighbor ? neighbor.path : null);
      }
      return next;
    });
  };

  if (!project) {
    return <ProjectNotFound />;
  }

  const notice = skillNotice(skill.state);

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="mb-3">
          <div className="text-xs text-kumo-subtle mb-1">
            <Link to="/" className="text-kumo-subtle hover:text-kumo-default no-underline">Projects</Link>
            <span className="mx-1.5 text-kumo-subtle">/</span>
            <span className="text-kumo-default font-medium">{project.name}</span>
            {rootPath && <span className="text-[10px] text-kumo-subtle ml-2">{rootPath}</span>}
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="rounded bg-kumo-elevated p-1 shrink-0"><Cube size={14} className="text-kumo-brand" /></div>
            <h1 className="text-xl font-semibold tracking-tight text-kumo-default truncate min-w-0">{project.name}</h1>
            <div className="ml-auto flex items-center gap-2">
              <AppButton
                onClick={() => window.dispatchEvent(new CustomEvent("open-quick-search"))}
                variant="secondary"
                size="sm"
                icon={<MagnifyingGlass size={12} />}
                className="rounded-full px-2.5 text-xs"
                title="Quick Open & Content Search (Cmd+P or Ctrl+P)"
              >
                Search
                <kbd className="text-[10px] font-mono px-1 py-0.2 rounded bg-kumo-elevated text-kumo-subtle border border-kumo-line/60 ml-1">⌘P</kbd>
              </AppButton>
              <AppButton
                onClick={() => setChatOpen((p) => !p)}
                variant="chip"
                size="sm"
                active={chatOpen}
                activeColor="brand"
                icon={<ChatIcon size={12} />}
                className="px-3"
              >
                Chat
              </AppButton>
              <AppButton
                onClick={() => setTerminalOpen((p) => !p)}
                variant="chip"
                size="sm"
                active={terminalOpen}
                activeColor="success"
                icon={<TerminalIcon size={12} />}
                className="px-3"
              >
                <span className="flex items-center gap-1.5">
                  {/* Always-rendered indicator — the running state toggles a class,
                      NOT a conditional child. React inserting/removing a span inside
                      a kumo Button while the terminal connects raced with its async
                      work and crashed with "insertBefore not a child". */}
                  <span
                    className={`w-1.5 h-1.5 rounded-full transition-opacity ${terminalRunning ? "bg-green-400 animate-pulse opacity-100" : "opacity-0"}`}
                    title="Agent session running"
                  />
                  Terminal
                </span>
              </AppButton>
              <PageHelpButton help="overview" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3 min-w-0">
        <div className="flex flex-1 items-center gap-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TAB_ITEMS.map((t) => (
            <AppButton
              key={t.value}
              variant="chip"
              size="sm"
              active={activeTab === t.value}
              onClick={() => {
                // Keep the split panes open while the main tab changes.
                if (t.value === "overview") navigate({ to: "/projects/$id", params: { id: project.id }, from: "/", search: (prev: any) => prev } as any);
                else navigate({ to: `/projects/$id/${t.value}` as any, params: { id: project.id }, from: "/", search: (prev: any) => prev } as any);
              }}
              className="px-3 shrink-0 whitespace-nowrap"
            >
              {t.label}
            </AppButton>
          ))}
        </div>
          <AppButton
            variant="chip"
            size="sm"
            active={split.panes.length > 0}
            icon={<Columns size={12} />}
            onClick={(e: any) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setSplitMenu({ x: r.left, y: r.bottom + 4 });
            }}
            className="px-3 shrink-0"
            title="Buka tab lain berdampingan"
          >
            Pisah{split.panes.length > 0 ? ` (${split.panes.length + 1})` : ""}
          </AppButton>
          {isSplitTab(activeTab) ? (
            <AppButton
              variant="chip"
              size="sm"
              icon={<ArrowSquareOut size={12} />}
              onClick={() => {
                setWindowError(null);
                openPaneWindow(project.id, activeTab).catch((e) => setWindowError(windowErrorText(e)));
              }}
              className="px-3 shrink-0"
              title="Buka tab ini di window baru"
            >
              Window baru
            </AppButton>
          ) : null}
        </div>

        {windowError ? <InlineAlert className="mb-3">{windowError}</InlineAlert> : null}
        {notice && (
          <div className={`mb-4 px-3 py-2 rounded border text-xs flex items-center gap-2 ${
            notice.tone === "red"
              ? "border-red-500/30 bg-red-500/10 text-red-400"
              : notice.tone === "blue"
                ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
                : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          }`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${
              notice.pulse
                ? "animate-pulse bg-amber-400"
                : notice.tone === "red"
                  ? "bg-red-400"
                  : notice.tone === "blue"
                    ? "bg-blue-400"
                    : "bg-amber-400"
            }`} />
            <span>{notice.text} </span>
            {notice.action && (
              <button
                onClick={() => skill.start(project.id)}
                className="ml-auto px-2 py-1 text-[10px] rounded border border-kumo-line text-kumo-default hover:bg-kumo-elevated transition-colors"
              >
                {notice.action}
              </button>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0">
          {/* Markdown rendered in any tab resolves workspace-relative image
              paths (`input/assets/…`) through this project id. */}
          <ProjectIdProvider projectId={project.id}>
            <SplitWorkspace
              projectId={project.id}
              state={split}
              onChange={setSplit}
              onRequestClose={requestClosePane}
              onSwap={isSplitTab(activeTab) ? swapPane : undefined}
              onPaneDirtyChange={handlePaneDirtyChange}
              onRequestTabChange={requestPaneTab}
              main={activeTab === "overview" ? (
                <OverviewContent project={project} openTabs={openTabs} setOpenTabs={setOpenTabs} activeTabPath={activeTabPath} setActiveTabPath={setActiveTabPath} onFileClick={handleFileClick} onTabClose={handleTabClose} />
              ) : (
                <Outlet />
              )}
            />
          </ProjectIdProvider>
        </div>
      </div>

      {/* Docked at the window's right edge (not inside the page), so the React tree and the
          streams stay in this route while the DOM sits in the app's right dock. */}
      <RightDock>
        <ChatPanel visible={chatOpen} onClose={() => setChatOpen(false)} projectId={project.id} />

        <TerminalErrorBoundary onRetry={() => setTermRetryKey((k) => k + 1)}>
          <AgentTermPanel key={termRetryKey} visible={terminalOpen} onClose={() => setTerminalOpen(false)} onRunningChange={setTerminalRunning} launch={terminalLaunch} projectId={project.id} defaultAgent={agent} />
        </TerminalErrorBoundary>
      </RightDock>

      {splitMenu && (
        <ContextMenu
          x={splitMenu.x}
          y={splitMenu.y}
          onClose={() => setSplitMenu(null)}
          items={[
            ...SPLIT_TABS.map((t) => ({
              label: `Buka ${SPLIT_TAB_LABELS[t]} di samping`,
              disabled: split.panes.length >= MAX_EXTRA_PANES,
              onClick: () => { setSplit(addPane(split, t, "h")); setSplitMenu(null); },
            })),
            ...(split.panes.length === 1
              ? [{
                  label: split.dir === "h" ? "Ubah jadi atas–bawah" : "Ubah jadi kiri–kanan",
                  onClick: () => { setSplit({ ...split, dir: split.dir === "h" ? "v" : "h" }); setSplitMenu(null); },
                }]
              : []),
            ...(split.panes.length > 0
              ? [{
                  label: "Tutup semua pane",
                  danger: true,
                  onClick: () => {
                    setSplitMenu(null);
                    if (Object.values(paneDirty).some(Boolean)) setCloseTarget(-1);
                    else { setPaneDirty({}); setSplit({ ...split, panes: [] }); }
                  },
                }]
              : []),
          ]}
        />
      )}
      <ConfirmDialog
        open={launchToConfirm !== null}
        title="Hentikan sesi terminal?"
        onOpenChange={(open) => { if (!open) setLaunchToConfirm(null); }}
        onConfirm={() => {
          if (launchToConfirm) startTerminalLaunch(launchToConfirm);
          setLaunchToConfirm(null);
        }}
        confirmLabel="Hentikan & lanjutkan"
        destructive
      >
        Terminal sedang menjalankan sesi lain. Sesi itu akan dihentikan, lalu thread ini dibuka di OpenCode.
      </ConfirmDialog>
      <ConfirmDialog
        open={closeTarget !== null}
        title="Tutup pane?"
        onOpenChange={(open) => { if (!open) setCloseTarget(null); }}
        onConfirm={() => {
          if (closeTarget === -1) { setPaneDirty({}); setSplit({ ...split, panes: [] }); }
          else if (closeTarget !== null) closePane(closeTarget);
          setCloseTarget(null);
        }}
        confirmLabel="Tutup"
        destructive
      >
        Ada perubahan FSD yang belum disimpan di pane ini. Perubahan itu akan hilang.
      </ConfirmDialog>
      <ConfirmDialog
        open={tabTarget !== null}
        title="Ganti tab di pane ini?"
        onOpenChange={(open) => { if (!open) setTabTarget(null); }}
        onConfirm={() => {
          if (tabTarget) {
            if (tabTarget.swap) applySwap(tabTarget.index);
            else applyPaneTab(tabTarget.index, tabTarget.tab);
          }
          setTabTarget(null);
        }}
        confirmLabel="Ganti"
        destructive
      >
        Ada perubahan FSD yang belum disimpan di pane ini. Perubahan itu akan hilang.
      </ConfirmDialog>
    </div>
  );
}

function OverviewContent({ project, openTabs, setOpenTabs, activeTabPath, setActiveTabPath, onFileClick, onTabClose }: {
  project: any;
  openTabs: { path: string; name: string }[];
  setOpenTabs: React.Dispatch<React.SetStateAction<{ path: string; name: string }[]>>;
  activeTabPath: string | null;
  setActiveTabPath: React.Dispatch<React.SetStateAction<string | null>>;
  onFileClick: (file: { name: string; path: string }) => void;
  onTabClose: (path: string) => void;
}) {
  const [fileSummary, setFileSummary] = useState<Record<string, number>>({});
  const [fileExplorerCollapsed, setFileExplorerCollapsed] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);
  const fileTreeRef = useRef<FileTreeHandle>(null);

  const inputList = useFileList("input", project?.id);
  const outputList = useFileList("output", project?.id);

  // Show EVERYTHING under input/ and output/ (all subfolders + files) — not a
  // hardcoded subset. scanDirectory walks recursively.
  const dirs = useMemo<Record<string, FileEntry[]>>(() => ({
    input: inputList.files,
    output: outputList.files,
  }), [inputList.files, outputList.files]);

  useEffect(() => {
    const pid = project?.id;
    fetch(`/api/files/summary${pid ? `?projectId=${pid}` : ""}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : {}).then(setFileSummary).catch(() => {});
  }, [project?.id]);

  const refreshAll = useCallback(() => {
    inputList.refresh();
    outputList.refresh();
    fetch(`/api/files/summary${project?.id ? `?projectId=${project.id}` : ""}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : {}).then(setFileSummary).catch(() => {});
  }, [inputList.refresh, outputList.refresh, project?.id]);

  const handleRename = async (path: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === path.split("/").pop()) return;
    try {
      const res = await fetch("/api/files/rename", {
        cache: "no-store",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, path, newName: trimmed }),
      });
      if (res.ok && (await res.json()).renamed) {
        const newPath = path.slice(0, path.lastIndexOf("/") + 1) + trimmed;
        setOpenTabs((prev) => prev.map((t) => (t.path === path ? { path: newPath, name: trimmed } : t)));
        if (activeTabPath === path) setActiveTabPath(newPath);
        refreshAll();
      }
    } catch {}
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/files/delete?projectId=${project.id}&path=${encodeURIComponent(deleteTarget.path)}`, { method: "DELETE" });
      onTabClose(deleteTarget.path);
    } catch {}
    setDeleteTarget(null);
    refreshAll();
  };

  const { ctxMenu, menuItems, openMenu, closeMenu } = useFileContextMenu({
    projectId: project.id,
    onRefresh: refreshAll,
    onRename: (file) => fileTreeRef.current?.requestRename(file.path),
    onDelete: (file) => setDeleteTarget({ path: file.path, name: file.name }),
  });


  // Only text files are read as text. A PDF or a picture is shown by FilePreview, from its own URL.
  const isTextFile = !activeTabPath || previewKindOf(activeTabPath) === "text";
  const { content: activeContent, loading: contentLoading, refresh: refreshContent } = useFileContent(isTextFile ? activeTabPath : null, project?.id);

  // FSD-style editor for the open markdown file. Save goes through the generic
  // /api/files/write (creates the file if missing). Switching away with unsaved
  // edits is guarded by a confirm dialog (pendingSwitch).
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [draftContent, setDraftContent] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingSwitch, setPendingSwitch] = useState<{ kind: "tab" | "file" | "close" | "close-others" | "close-all"; path: string; file?: { name: string; path: string } } | null>(null);
  // Right-click menu on an open tab pill.
  const [tabMenu, setTabMenu] = useState<{ x: number; y: number; path: string } | null>(null);
  const editorContent = draftContent ?? activeContent ?? "";

  // Clear the draft whenever the active file changes (covers confirmed
  // switches, tab-close auto-select, and external changes like project switch).
  useEffect(() => {
    setDraftContent(null);
    setDirty(false);
  }, [activeTabPath]);

  const handleSave = useCallback(async () => {
    if (!activeTabPath) return;
    setSaving(true);
    try {
      const res = await fetch("/api/files/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: activeTabPath, projectId: project?.id, content: editorContent }),
      });
      if (res.ok) {
        setDirty(false);
        refreshContent();
      }
    } catch {}
    setSaving(false);
  }, [activeTabPath, project?.id, editorContent, refreshContent]);

  // Run a navigation action, guarding against losing unsaved edits: switching
  // to another tab/file, closing the ACTIVE tab, or bulk-closing tabs that
  // include the active one while dirty asks first.
  const requestLeave = useCallback((action: { kind: "tab" | "file" | "close" | "close-others" | "close-all"; path: string; file?: { name: string; path: string } }) => {
    const switchingAway = action.kind === "close"
      ? action.path === activeTabPath
      : action.kind === "close-others"
        ? action.path !== activeTabPath
        : action.kind === "close-all"
          ? activeTabPath !== null
          : action.path !== activeTabPath;
    if (dirty && switchingAway) {
      setPendingSwitch(action);
      return;
    }
    setDraftContent(null);
    setDirty(false);
    if (action.kind === "tab") setActiveTabPath(action.path);
    else if (action.kind === "file") onFileClick(action.file!);
    else if (action.kind === "close") onTabClose(action.path);
    else if (action.kind === "close-others") {
      setOpenTabs((prev) => prev.filter((t) => t.path === action.path));
      setActiveTabPath(action.path);
    } else {
      setOpenTabs([]);
      setActiveTabPath(null);
    }
  }, [dirty, activeTabPath, onFileClick, onTabClose, setActiveTabPath, setOpenTabs]);

  const totalFiles = Object.values(dirs).flat().length;
  const DIR_ORDER = ["input", "output"];

  if (totalFiles === 0) {
    return (
      <EmptyState
        icon={<FolderOpen size={32} />}
        title="No project files found yet"
        description={
          <>
            Use the terminal to run an FSD analysis or add files to{" "}
            <code className="text-[11px] text-kumo-default font-mono bg-kumo-elevated px-1 rounded">input/</code> and{" "}
            <code className="text-[11px] text-kumo-default font-mono bg-kumo-elevated px-1 rounded">output/</code> directories.
          </>
        }
        className="rounded-lg border border-kumo-line"
      />
    );
  }

  return (
    <>
    <div className="flex flex-col h-full">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-3 mb-3 shrink-0">
        <StatCard label="FSD Files" value={fileSummary.fsd ? String(fileSummary.fsd) : null} />
        <StatCard label="Spec Files" value={fileSummary.spec ? String(fileSummary.spec) : null} />
        <StatCard label="ERD Files" value={fileSummary.erd ? String(fileSummary.erd) : null} />
        <StatCard label="Tasks" value={fileSummary.task ? String(fileSummary.task) : null} />
      </div>

      {/* Split: file browser (left) + content (right) */}
      <div className="flex flex-1 min-h-0 glass-container overflow-hidden">
        {/* Left: file browser */}
        <ExplorerShell
          collapsed={fileExplorerCollapsed}
          onToggle={() => setFileExplorerCollapsed(false)}
          label="Files"
          header={
            <div className="px-3 py-2 border-b border-kumo-line shrink-0 flex items-center gap-1">
              <span className="text-[10px] text-kumo-subtle uppercase tracking-wider flex-1">Files</span>
              <button
                type="button"
                onClick={() => setFileExplorerCollapsed(true)}
                className="text-kumo-subtle hover:text-kumo-default p-0.5 shrink-0"
                title="Hide file explorer"
              >
                <CaretLeft size={12} />
              </button>
            </div>
          }
        >
          <FileTree
            // Keyed by project: the tree's open folders belong to one project, and the route stays
            // mounted when the user switches projects.
            key={project.id}
            ref={fileTreeRef}
            sections={DIR_ORDER.map((dir) => ({ dir, files: dirs[dir] ?? [] }))}
            defaultCollapsed
            activePath={activeTabPath}
            emptyText="(empty)"
            onFileClick={(file) => requestLeave({ kind: "file", path: file.path, file })}
            onFileContextMenu={(e, file) => openMenu(e, { kind: "file", file })}
            onDirContextMenu={(e, dir) => openMenu(e, { kind: "dir", dir })}
            onRename={handleRename}
          />
        </ExplorerShell>

        {/* Right: tab bar + content viewer */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Tab bar */}
          {openTabs.length > 0 ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-kumo-line/50 bg-kumo-elevated/20 shrink-0">
              <div className="flex items-center gap-1.5 overflow-x-auto min-w-0 flex-1 no-scrollbar">
                {openTabs.map((t) => (
                  <div key={t.path}
                    className={`group flex items-center gap-1.5 px-3 py-1 text-xs rounded-full cursor-pointer shrink-0 transition-all ${
                      activeTabPath === t.path
                        ? "liquid-wash font-medium"
                        : "border border-kumo-line/40 text-kumo-subtle hover:text-kumo-default hover:bg-kumo-tint"
                    }`}
                    onClick={() => requestLeave({ kind: "tab", path: t.path })}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setTabMenu({ x: e.clientX, y: e.clientY, path: t.path });
                    }}>
                    <span className="max-w-40 truncate">{t.name}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); requestLeave({ kind: "close", path: t.path }); }}
                      className={activeTabPath === t.path ? "text-white/80 hover:text-white opacity-70 group-hover:opacity-100" : "text-kumo-subtle hover:text-kumo-default opacity-60 group-hover:opacity-100"}
                    >
                      <X size={10} weight="bold" />
                    </button>
                  </div>
                ))}
              </div>
              {activeTabPath && isTextFile && (
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <AppButton variant="chip" size="xs" active={editorMode === "edit"} onClick={() => setEditorMode("edit")} icon={<PencilSimple size={11} />} className="px-2" title="Edit" />
                  <AppButton variant="chip" size="xs" active={editorMode === "split"} onClick={() => setEditorMode("split")} icon={<Columns size={11} />} className="px-2" title="Split view" />
                  <AppButton variant="chip" size="xs" active={editorMode === "preview"} onClick={() => setEditorMode("preview")} icon={<Eye size={11} />} className="px-2" title="Preview" />
                  {dirty && (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400 shrink-0"><XCircle size={10} /> Unsaved</span>
                  )}
                  {saving && (
                    <span className="flex items-center gap-1 text-[10px] text-kumo-subtle animate-pulse shrink-0"><CheckCircle size={10} /> Saving…</span>
                  )}
                  <AppButton onClick={() => void handleSave()} disabled={saving || !dirty} variant="chip" size="xs" icon={<FloppyDisk size={11} />} className="px-2" title="Save (Ctrl/Cmd+S)">Save</AppButton>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-kumo-line bg-kumo-elevated/30 shrink-0">
              <FileText size={12} className="text-kumo-subtle" />
              <span className="text-xs text-kumo-subtle">No file selected</span>
            </div>
          )}

          {/* Content viewer */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {!activeTabPath ? (
              <EmptyState
                icon={<FileText size={24} />}
                title="No file selected"
                description="Select a markdown file from the browser to view its content."
              />
            ) : (
              <FilePreview
                path={activeTabPath}
                projectId={project?.id ?? ""}
                root={project?.rootPath ?? null}
                text={
                  contentLoading ? (
                    <div className="p-4"><ListSkeleton rows={6} /></div>
                  ) : activeContent === null ? (
                    <ErrorState
                      message="Unable to read this file"
                      detail="Check that the project root path is set in settings"
                      retry={refreshContent}
                    />
                  ) : (
                    <div className="h-full flex flex-col">
                      <FsdEditor
                        content={editorContent}
                        mode={editorMode}
                        onChange={(v) => { setDraftContent(v); setDirty(true); }}
                        onSave={() => void handleSave()}
                        projectId={project?.id ?? ""}
                      />
                    </div>
                  )
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>

    {ctxMenu && (
      <ContextMenu
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={menuItems}
        onClose={closeMenu}
      />
    )}

    <ConfirmDialog
      open={deleteTarget !== null}
      title="Delete File"
      onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      onConfirm={confirmDelete}
    >
      Are you sure you want to delete <code className="text-[11px] text-kumo-default">{deleteTarget?.name}</code>? This cannot be undone.
    </ConfirmDialog>

    <ConfirmDialog
      open={pendingSwitch !== null}
      title="Discard unsaved changes?"
      onOpenChange={(open) => { if (!open) setPendingSwitch(null); }}
      onConfirm={() => {
        const action = pendingSwitch;
        setPendingSwitch(null);
        if (!action) return;
        setDraftContent(null);
        setDirty(false);
        if (action.kind === "tab") setActiveTabPath(action.path);
        else if (action.kind === "file") onFileClick(action.file!);
        else if (action.kind === "close") onTabClose(action.path);
        else if (action.kind === "close-others") {
          setOpenTabs((prev) => prev.filter((t) => t.path === action.path));
          setActiveTabPath(action.path);
        } else {
          setOpenTabs([]);
          setActiveTabPath(null);
        }
      }}
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      destructive={false}
    >
      You have unsaved changes in <code className="text-[11px] text-kumo-default">{activeTabPath}</code>. Discard them and switch files?
    </ConfirmDialog>

    {tabMenu && (
      <ContextMenu
        x={tabMenu.x}
        y={tabMenu.y}
        items={[
          { label: "Close tab", onClick: () => requestLeave({ kind: "close", path: tabMenu.path }) },
          { label: "Close other tabs", onClick: () => requestLeave({ kind: "close-others", path: tabMenu.path }) },
          { label: "Close all tabs", onClick: () => requestLeave({ kind: "close-all", path: tabMenu.path }) },
        ]}
        onClose={() => setTabMenu(null)}
      />
    )}
    </>
  );
}

function StatCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="glass-panel rounded-2xl px-4 py-3">
      <span className="text-xs text-kumo-subtle">{label}</span>
      <span className={`block mt-0.5 text-base font-semibold ${value ? "text-kumo-default" : "text-kumo-subtle"}`}>{value || "—"}</span>
    </div>
  );
}
