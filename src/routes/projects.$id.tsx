import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { Badge, Button, DialogRoot, Dialog, DialogTitle, DialogDescription } from "@cloudflare/kumo";
import { Cube, Terminal as TerminalIcon, FileText, File, FolderOpen, X, CaretDown, CaretRight, CaretLeft, ArrowCounterClockwise, Folder, ArrowDownLeft, ArrowUpRight, MagnifyingGlass, PencilSimple, Trash, CopySimple, ClipboardText } from "@phosphor-icons/react";
import { loadAllData } from "~/lib/project-queries";
import { lazy, Suspense, useState, useEffect, useCallback, useRef, useMemo } from "react";
// xterm is ~700KB min — keep it out of the project layout chunk; the panel is
// hidden until the user opens the terminal anyway.
const AgentTermPanel = lazy(() =>
  import("~/components/agent/AgentTerminal").then((m) => ({ default: m.AgentTermPanel }))
);
import { useFileContent } from "~/lib/use-file-data";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import { AppButton } from "~/components/ui/AppButton";
import { FileRow } from "~/components/ui/FileRow";
import { ContextMenu } from "~/components/ui/ContextMenu";
import type { ContextMenuItem } from "~/components/ui/ContextMenu";
import { EmptyState } from "~/components/ui/EmptyState";
import { ErrorState } from "~/components/ui/ErrorState";
import { ListSkeleton } from "~/components/ui/Skeleton";

export const Route = createFileRoute("/projects/$id")({
  loader: async ({ params }) => {
    const data = await loadAllData();
    const project = ((data.projects as any[]) || []).find((p: any) => p.id === params.id) ?? null;
    return { project };
  },
  component: ProjectLayout,
});

const TAB_ITEMS = [
  { value: "overview", label: "Overview" },
  { value: "erd", label: "ERD" },
  { value: "spec", label: "API Spec" },
  { value: "tasks", label: "Tasks" },
  { value: "fsd", label: "FSD Analyzer" },
  { value: "docs", label: "Docs" },
  { value: "wiki", label: "Wiki" },
  { value: "settings", label: "Settings" },
];

function ProjectLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { project } = Route.useLoaderData() as any;
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [openTabs, setOpenTabs] = useState<{ path: string; name: string }[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [skillsState, setSkillsState] = useState<{ status: string; error: string | null } | null>(null);
  // Live defaultAgent — the route loader is cached/stale; refresh via the
  // "project-updated" event fired by Settings after saving.
  const [freshAgent, setFreshAgent] = useState<string | null>(null);
  const agent = freshAgent || project?.defaultAgent || "opencode";

  useEffect(() => {
    if (!project?.id) return;
    fetch(`/api/projects/${project.id}/skills`, { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) setSkillsState({ status: d.status, error: d.skills?.find((s: any) => s.status === "failed")?.error ?? null });
    }).catch(() => {});
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
    : location.pathname.includes("/spec") ? "spec"
    : location.pathname.includes("/wiki") ? "wiki"
    : location.pathname.includes("/tasks") ? "tasks"
    : location.pathname.includes("/fsd") ? "fsd"
    : location.pathname.includes("/docs") ? "docs"
    : location.pathname.includes("/settings") ? "settings"
    : "overview";

  const rootPath = project?.rootPath || "";

  // Reset file tabs when switching to a different project
  useEffect(() => {
    setOpenTabs([]);
    setActiveTabPath(null);
  }, [project?.id]);

  const handleFileClick = (file: { name: string; path: string }) => {
    if (!file.path.endsWith(".md")) return;
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
    return <div className="flex items-center justify-center h-48 text-kumo-subtle text-sm">Project not found</div>;
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="mb-5">
          <div className="text-xs text-kumo-subtle mb-1">
            <Link to="/" className="text-kumo-subtle hover:text-kumo-default no-underline">Projects</Link>
            <span className="mx-1.5 text-kumo-subtle">/</span>
            <span className="text-kumo-default font-medium">{project.name}</span>
            {rootPath && <span className="text-[10px] text-kumo-subtle ml-2">{rootPath}</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded bg-kumo-elevated p-1"><Cube size={14} className="text-kumo-brand" /></div>
            <h1 className="text-xl font-semibold tracking-tight text-kumo-default">{project.name}</h1>
            {project.company && <Badge variant="neutral" className="text-[11px]">{project.company}</Badge>}
            <AppButton
              onClick={() => setTerminalOpen((p) => !p)}
              variant="chip"
              size="sm"
              active={terminalOpen}
              activeColor="success"
              icon={<TerminalIcon size={12} />}
              className="ml-auto px-3"
            >
              <span className="flex items-center gap-1.5">
                {terminalRunning && <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" title="Agent session running" />}
                Terminal
              </span>
            </AppButton>
          </div>
        </div>

        <div className="flex items-center gap-1 mb-5 flex-wrap">
          {TAB_ITEMS.map((t) => (
            <AppButton
              key={t.value}
              variant="chip"
              size="sm"
              active={activeTab === t.value}
              onClick={() => {
                if (t.value === "overview") navigate({ to: "/projects/$id", params: { id: project.id } });
                else navigate({ to: `/projects/$id/${t.value}` as any, params: { id: project.id } } as any);
              }}
              className="px-3"
            >
              {t.label}
            </AppButton>
          ))}
        </div>

        {skillsState && skillsState.status !== "ready" && (
          <div className={`mb-4 px-3 py-2 rounded border text-xs flex items-center gap-2 ${
            skillsState.status === "failed"
              ? "border-red-500/30 bg-red-500/10 text-red-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          }`}>
            <span className="w-2 h-2 rounded-full shrink-0 animate-pulse bg-amber-400" />
            <span>
              {skillsState.status === "failed"
                ? "Project skills failed to install — AI analysis is unavailable. "
                : "Installing required project skills (fsd-analyzer, markitdown)… "}
            </span>
            {skillsState.status === "failed" && (
              <button
                onClick={async () => {
                  await fetch(`/api/projects/${project.id}/skills/install`, { method: "POST" });
                  setSkillsState({ status: "installing", error: null });
                  const t = setInterval(async () => {
                    const d = await (await fetch(`/api/projects/${project.id}/skills`, { cache: "no-store" })).json();
                    if (d.status === "ready" || d.status === "failed") {
                      clearInterval(t);
                      setSkillsState({ status: d.status, error: d.skills?.find((s: any) => s.status === "failed")?.error ?? null });
                    }
                  }, 1500);
                }}
                className="ml-auto px-2 py-1 text-[10px] rounded border border-kumo-line text-kumo-default hover:bg-kumo-elevated transition-colors"
              >
                Retry install
              </button>
            )}
          </div>
        )}

        <div className="flex-1 min-h-0">
          {activeTab === "overview" ? (
            <OverviewContent project={project} openTabs={openTabs} setOpenTabs={setOpenTabs} activeTabPath={activeTabPath} setActiveTabPath={setActiveTabPath} onFileClick={handleFileClick} onTabClose={handleTabClose} />
          ) : (
            <Outlet />
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        <AgentTermPanel visible={terminalOpen} onClose={() => setTerminalOpen(false)} onRunningChange={setTerminalRunning} projectId={project.id} defaultAgent={agent} />
      </Suspense>
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
  const [dirs, setDirs] = useState<Record<string, { name: string; path: string; size: number }[]>>({});
  const [collapsedDirs, setCollapsedDirs] = useState<Set<string>>(new Set());
  const [fileExplorerCollapsed, setFileExplorerCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; target: { kind: "file"; file: any } | { kind: "dir"; dir: string } } | null>(null);
  const [clipboard, setClipboard] = useState<{ path: string; name: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ path: string; name: string } | null>(null);

  useEffect(() => {
    const pid = project?.id;
    fetch(`/api/files/summary${pid ? `?projectId=${pid}` : ""}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : {}).then(setFileSummary).catch(() => {});
  }, [project?.id]);

  const loadDirs = useCallback(async () => {
    const pid = project?.id;
    if (!pid) return;
    const result: Record<string, any[]> = {};
    for (const dir of ["input/fsd", "output/spec", "output/erd", "output/task"]) {
      try {
        const res = await fetch(`/api/files/list?projectId=${pid}&dir=${dir}`, { cache: "no-store" });
        if (res.ok) result[dir] = await res.json();
      } catch {}
    }
    setDirs(result);
  }, [project?.id]);

  useEffect(() => { loadDirs(); }, [loadDirs]);

  const refreshAll = useCallback(() => {
    loadDirs();
    fetch(`/api/files/summary${project?.id ? `?projectId=${project.id}` : ""}`, { cache: "no-store" }).then((r) => r.ok ? r.json() : {}).then(setFileSummary).catch(() => {});
  }, [loadDirs, project?.id]);

  const handleRename = async (path: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === path.split("/").pop()) { setRenaming(null); return; }
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
    setRenaming(null);
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

  const handleCopy = (file: any) => setClipboard({ path: file.path, name: file.name });

  const handlePaste = async (targetDir: string) => {
    if (!clipboard) return;
    const sameDir = clipboard.path.startsWith(targetDir.replace(/\/$/, "") + "/");
    try {
      const res = await fetch(`/api/files/${sameDir ? "copy" : "move"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, source: clipboard.path, destination: targetDir }),
      });
      if (res.ok) setClipboard(null);
    } catch {}
    refreshAll();
  };

  const openMenu = (e: React.MouseEvent, target: { kind: "file"; file: any } | { kind: "dir"; dir: string }) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, target });
  };

  const menuItems: ContextMenuItem[] = ctxMenu ? (() => {
    const t = ctxMenu.target;
    const items: ContextMenuItem[] = [];
    if (t.kind === "file") {
      items.push({ label: "Rename", icon: <PencilSimple size={12} />, onClick: () => setRenaming(t.file.path) });
      items.push({ label: "Delete", icon: <Trash size={12} />, danger: true, onClick: () => setDeleteTarget({ path: t.file.path, name: t.file.name }) });
      items.push({ label: "Copy", icon: <CopySimple size={12} />, onClick: () => handleCopy(t.file) });
    }
    const pasteDir = t.kind === "file" ? t.file.path.slice(0, t.file.path.lastIndexOf("/") + 1) : t.dir;
    items.push({ label: "Paste", icon: <ClipboardText size={12} />, disabled: !clipboard, onClick: () => handlePaste(pasteDir) });
    return items;
  })() : [];

  const { content: activeContent, loading: contentLoading, refresh: refreshContent } = useFileContent(activeTabPath, project?.id);

  const toggleCollapse = (dir: string) => {
    setCollapsedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  const totalFiles = Object.values(dirs).flat().length;
  const DIR_ORDER = ["input/fsd", "output/spec", "output/erd", "output/task"];

  const query = searchQuery.trim().toLowerCase();
  const searchResults = query
    ? Object.entries(dirs).flatMap(([dir, files]) => (files ?? []).map((f) => ({ dir, ...f })))
        .filter((f) => f.name.toLowerCase().includes(query) || f.path.toLowerCase().includes(query))
    : [];

  const trees = useMemo(() => {
    const t: Record<string, TreeNode[]> = {};
    for (const dir of DIR_ORDER) t[dir] = buildFileTree(dir, dirs[dir] ?? []);
    return t;
  }, [dirs]);

  const countFiles = (node: TreeNode): number =>
    node.type === "file" ? 1 : (node.children ?? []).reduce((n, c) => n + countFiles(c), 0);

  const renderTreeNodes = (nodes: TreeNode[], depth: number): React.ReactNode[] =>
    nodes.map((node) => {
      if (node.type === "folder") {
        const isCollapsed = collapsedDirs.has(node.path);
        return (
          <div key={node.path}>
            <button
              type="button"
              onClick={() => toggleCollapse(node.path)}
              onContextMenu={(e) => openMenu(e, { kind: "dir", dir: node.path })}
              className="flex items-center gap-1.5 px-2 py-1 w-full text-left text-kumo-subtle hover:bg-kumo-elevated/50 cursor-pointer whitespace-nowrap"
              style={{ paddingLeft: `${8 + depth * 14}px` }}
            >
              {isCollapsed ? <CaretRight size={10} /> : <CaretDown size={10} />}
              <Folder size={11} className="opacity-60" />
              <span className="text-xs truncate">{node.name}</span>
              <span className="text-[10px] text-kumo-subtle ml-auto">{countFiles(node)}</span>
            </button>
            {!isCollapsed && (
              <div className="ml-[9px] pl-1.5 border-l border-kumo-line/25">{renderTreeNodes(node.children ?? [], depth + 1)}</div>
            )}
          </div>
        );
      }
      const f = node.file!;
      const isMarkdown = f.path.endsWith(".md");
      const isActive = activeTabPath === f.path;
      return (
        <div key={f.path}>
          {renaming === f.path ? (
            <div className="my-0.5 mx-1.5" style={{ paddingLeft: `${12 + depth * 12}px` }}>
              <RenameInput initial={f.name} onCommit={(name) => handleRename(f.path, name)} />
            </div>
          ) : (
            <FileRow
              depth={depth}
              noTruncate
              icon={<File size={11} />}
              active={isActive}
              disabled={!isMarkdown}
              onClick={() => onFileClick(f)}
              onContextMenu={(e) => openMenu(e, { kind: "file", file: f })}
            >
              <span className="whitespace-nowrap">{f.name}</span>
            </FileRow>
          )}
        </div>
      );
    });

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
        <div className={`flex overflow-hidden transition-[width] duration-300 ease-in-out shrink-0 border-r border-kumo-line bg-kumo-elevated/30 ${fileExplorerCollapsed ? "w-7" : "w-56"}`}>
          <button
            type="button"
            onClick={() => setFileExplorerCollapsed(false)}
            className={`shrink-0 flex flex-col items-center pt-3 gap-1 overflow-hidden transition-opacity duration-200 cursor-pointer hover:bg-kumo-elevated/50 text-kumo-subtle hover:text-kumo-default ${fileExplorerCollapsed ? "w-7 opacity-100" : "w-0 opacity-0"}`}
            title="Show file explorer"
          >
            <CaretRight size={12} />
            <span className="text-[9px] -rotate-90 whitespace-nowrap text-kumo-subtle mt-1 select-none">Files</span>
          </button>
          <div className={`flex flex-col flex-1 min-w-0 transition-opacity duration-200 ${fileExplorerCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"}`} aria-hidden={fileExplorerCollapsed}>
          <div className="px-2 py-1.5 border-b border-kumo-line shrink-0 flex items-center gap-1">
            <div className="relative flex-1">
              <MagnifyingGlass size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-kumo-subtle" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search files…"
                className="w-full bg-kumo-elevated/60 border border-kumo-line rounded pl-6 pr-6 py-1 text-xs text-kumo-default placeholder:text-kumo-subtle focus:border-kumo-brand focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 text-kumo-subtle hover:text-kumo-default"
                >
                  <X size={10} />
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setFileExplorerCollapsed(true)}
              className="text-kumo-subtle hover:text-kumo-default p-0.5 shrink-0"
              title="Hide file explorer"
            >
              <CaretLeft size={12} />
            </button>
          </div>
          <div className="flex-1 overflow-x-auto overflow-y-auto text-xs" onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }}>
            {query ? (
              searchResults.length === 0 ? (
                <div className="px-3 py-2 text-[10px] text-kumo-subtle">No files match</div>
              ) : (
                searchResults.map((f) => {
                  const isMarkdown = f.path.endsWith(".md");
                  const isActive = activeTabPath === f.path;
                  return (
                    <div key={f.path}>
                      {renaming === f.path ? (
                        <div className="px-3 py-0.5 my-0.5 mx-1.5">
                          <RenameInput initial={f.name} onCommit={(name) => handleRename(f.path, name)} />
                        </div>
                      ) : (
                        <FileRow
                          icon={<File size={10} />}
                          active={isActive}
                          disabled={!isMarkdown}
                          onClick={() => onFileClick(f)}
                          onContextMenu={(e) => openMenu(e, { kind: "file", file: f })}
                        >
                          <span className="truncate">{f.name}</span>
                        </FileRow>
                      )}
                      <div className="pl-6 pr-2 -mt-0.5 text-[10px] text-kumo-subtle truncate">{dirLabel(f.dir)}</div>
                    </div>
                  );
                })
              )
            ) : (
              DIR_ORDER.map((dir) => {
                const nodes = trees[dir] ?? [];
                if (nodes.length === 0) {
                  return (
                    <div key={dir}>
                      <button
                        type="button"
                        onClick={() => toggleCollapse(dir)}
                        onContextMenu={(e) => openMenu(e, { kind: "dir", dir })}
                  className="flex items-center gap-1.5 px-2 py-1 w-full text-left text-kumo-subtle hover:bg-kumo-elevated/50 cursor-pointer whitespace-nowrap"
                    >
                      {collapsedDirs.has(dir) ? <CaretRight size={10} /> : <CaretDown size={10} />}
                      <span className="text-xs truncate">{dirLabel(dir)}</span>
                    </button>
                    {!collapsedDirs.has(dir) && (
                      <div className="pl-4 py-1 text-[11px] text-kumo-subtle">(empty)</div>
                    )}
                    </div>
                  );
                }
                const isCollapsed = collapsedDirs.has(dir);
                return (
                  <div key={dir}>
                    <button
                      type="button"
                      onClick={() => toggleCollapse(dir)}
                      onContextMenu={(e) => openMenu(e, { kind: "dir", dir })}
                      className="flex items-center gap-1.5 px-2 py-1 w-full text-left text-kumo-subtle hover:bg-kumo-elevated/50 cursor-pointer whitespace-nowrap"
                    >
                      {isCollapsed ? <CaretRight size={10} /> : <CaretDown size={10} />}
                      <span className="text-xs truncate">{dirLabel(dir)}</span>
                      <span className="text-[10px] text-kumo-subtle ml-auto">{nodes.reduce((n, c) => n + countFiles(c), 0)}</span>
                    </button>
                    {!isCollapsed && <div>{renderTreeNodes(nodes, 0)}</div>}
                  </div>
                );
              })
            )}
          </div>
          </div>
        </div>

        {/* Right: tab bar + content viewer */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Tab bar */}
          {openTabs.length > 0 ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-kumo-line/50 bg-kumo-elevated/20 overflow-x-auto shrink-0">
              {openTabs.map((t) => (
                <div key={t.path}
                  className={`group flex items-center gap-1.5 px-3 py-1 text-xs rounded-full cursor-pointer shrink-0 transition-all ${
                    activeTabPath === t.path
                      ? "liquid-wash font-medium"
                      : "border border-kumo-line/40 text-kumo-subtle hover:text-kumo-default hover:bg-kumo-tint"
                  }`}
                  onClick={() => setActiveTabPath(t.path)}>
                  <span className="max-w-40 truncate">{t.name}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onTabClose(t.path); }}
                    className={activeTabPath === t.path ? "text-white/80 hover:text-white opacity-70 group-hover:opacity-100" : "text-kumo-subtle hover:text-kumo-default opacity-60 group-hover:opacity-100"}
                  >
                    <X size={10} weight="bold" />
                  </button>
                </div>
              ))}
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
            ) : contentLoading ? (
              <div className="p-4"><ListSkeleton rows={6} /></div>
            ) : activeContent === null ? (
              <ErrorState
                message="Unable to read this file"
                detail="Check that the project root path is set in settings"
                retry={refreshContent}
              />
            ) : activeContent === "" ? (
              <EmptyState icon={<FileText size={24} />} title="File is empty" />
            ) : (
              <div className="px-4 py-3 spec-markdown">
                <MarkdownViewer content={activeContent ?? ""} />
              </div>
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
        onClose={() => setCtxMenu(null)}
      />
    )}

    <DialogRoot open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
      <Dialog>
        <div className="p-5">
          <DialogTitle>Delete File</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <code className="text-[11px] text-kumo-default">{deleteTarget?.name}</code>? This cannot be undone.
          </DialogDescription>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete}>Delete</Button>
          </div>
        </div>
      </Dialog>
    </DialogRoot>
    </>
  );
}

function RenameInput({ initial, onCommit }: { initial: string; onCommit: (name: string) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.focus();
      const dot = initial.lastIndexOf(".");
      el.setSelectionRange(0, dot === -1 ? initial.length : dot);
    }
  }, [initial]);

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onCommit(value);
        if (e.key === "Escape") onCommit(initial);
      }}
      className="w-full bg-kumo-elevated border border-kumo-brand rounded px-1.5 py-0.5 text-xs text-kumo-default focus:outline-none"
    />
  );
}

interface TreeNode {
  name: string;
  path: string;
  type: "folder" | "file";
  children?: TreeNode[];
  file?: { name: string; path: string; size: number };
}

function buildFileTree(rootDir: string, entries: { name: string; path: string; size: number }[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folderMap = new Map<string, TreeNode>();

  const ensureFolder = (parts: string[]): TreeNode[] => {
    let level = root;
    let acc = rootDir;
    for (const part of parts) {
      acc += "/" + part;
      let node = folderMap.get(acc);
      if (!node) {
        node = { name: part, path: acc, type: "folder", children: [] };
        folderMap.set(acc, node);
        level.push(node);
      }
      level = node.children ?? [];
    }
    return level;
  };

  for (const f of entries) {
    const rel = f.path.slice(rootDir.length + 1);
    const parts = rel.split("/");
    const folder = ensureFolder(parts.slice(0, -1));
    folder.push({ name: parts[parts.length - 1], path: f.path, type: "file", file: f });
  }

  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) if (n.children) sortNodes(n.children);
    return nodes;
  };
  return sortNodes(root);
}

function dirLabel(dir: string): React.ReactNode {
  if (dir.startsWith("input/")) {
    return (
      <span className="inline-flex items-center gap-1">
        <ArrowDownLeft size={12} weight="bold" />
        {dir.slice(6)}
      </span>
    );
  }
  if (dir.startsWith("output/")) {
    return (
      <span className="inline-flex items-center gap-1">
        <ArrowUpRight size={12} weight="bold" />
        {dir.slice(7)}
      </span>
    );
  }
  return dir;
}

function StatCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="glass-panel rounded-2xl px-4 py-3">
      <span className="text-xs text-kumo-subtle">{label}</span>
      <span className={`block mt-0.5 text-base font-semibold ${value ? "text-kumo-default" : "text-kumo-subtle"}`}>{value || "—"}</span>
    </div>
  );
}
