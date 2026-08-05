import { createFileRoute, Link, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { Badge } from "@cloudflare/kumo";
import { Cube, Terminal as TerminalIcon, FileText, File, FolderOpen, X, CaretDown, CaretRight, ArrowCounterClockwise } from "@phosphor-icons/react";
import { loadAllData } from "~/lib/project-queries";
import { useState, useEffect } from "react";
import { AgentTermPanel } from "~/components/agent/AgentTerminal";
import { useFileContent } from "~/lib/use-file-data";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import { AppButton } from "~/components/ui/AppButton";
import { FileRow } from "~/components/ui/FileRow";

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
  { value: "wiki", label: "Wiki" },
  { value: "tasks", label: "Tasks" },
  { value: "fsd", label: "FSD Analyzer" },
  { value: "settings", label: "Settings" },
];

function ProjectLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { project } = Route.useLoaderData() as any;
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [openTabs, setOpenTabs] = useState<{ path: string; name: string }[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const [skillsState, setSkillsState] = useState<{ status: string; error: string | null } | null>(null);

  useEffect(() => {
    if (!project?.id) return;
    fetch(`/api/projects/${project.id}/skills`).then((r) => r.ok ? r.json() : null).then((d) => {
      if (d) setSkillsState({ status: d.status, error: d.skills?.find((s: any) => s.status === "failed")?.error ?? null });
    }).catch(() => {});
  }, [project?.id]);

  const activeTab = location.pathname.includes("/erd") ? "erd"
    : location.pathname.includes("/spec") ? "spec"
    : location.pathname.includes("/wiki") ? "wiki"
    : location.pathname.includes("/tasks") ? "tasks"
    : location.pathname.includes("/fsd") ? "fsd"
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
            <h1 className="text-lg font-semibold text-kumo-default">{project.name}</h1>
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
              Terminal
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
                    const d = await (await fetch(`/api/projects/${project.id}/skills`)).json();
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

      <AgentTermPanel visible={terminalOpen} onClose={() => setTerminalOpen(false)} projectId={project.id} defaultAgent={project.defaultAgent} />
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

  useEffect(() => {
    const pid = project?.id;
    fetch(`/api/files/summary${pid ? `?projectId=${pid}` : ""}`).then((r) => r.ok ? r.json() : {}).then(setFileSummary).catch(() => {});
  }, [project?.id]);

  useEffect(() => {
    const pid = project?.id;
    if (!pid) return;
    const loadDirs = async () => {
      const result: Record<string, any[]> = {};
      for (const dir of ["input/fsd", "output/spec", "output/erd", "output/task"]) {
        try {
          const res = await fetch(`/api/files/list?projectId=${pid}&dir=${dir}`);
          if (res.ok) result[dir] = await res.json();
        } catch {}
      }
      setDirs(result);
    };
    loadDirs();
  }, [project?.id]);

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

  if (totalFiles === 0) {
    return (
      <div className="rounded-lg border border-kumo-line p-6 text-center">
        <FolderOpen size={32} className="text-kumo-subtle mb-2 mx-auto" />
        <p className="text-sm text-kumo-subtle mb-1">No project files found yet</p>
        <p className="text-xs text-kumo-subtle">Use the terminal to run an FSD analysis or add files to <code className="text-[11px] text-kumo-default font-mono bg-kumo-elevated px-1 rounded">input/</code> and <code className="text-[11px] text-kumo-default font-mono bg-kumo-elevated px-1 rounded">output/</code> directories.</p>
      </div>
    );
  }

  return (
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
        <div className="w-56 shrink-0 border-r border-kumo-line bg-kumo-elevated/30 flex flex-col">
          <div className="px-3 py-1.5 border-b border-kumo-line text-[10px] font-medium text-kumo-subtle uppercase tracking-wider shrink-0">
            Files
          </div>
          <div className="flex-1 overflow-y-auto text-xs">
            {DIR_ORDER.map((dir) => {
              const files = dirs[dir];
              if (!files || files.length === 0) {
                return (
                  <div key={dir}>
                    <button
                      type="button"
                      onClick={() => toggleCollapse(dir)}
                      className="flex items-center gap-1.5 px-2 py-1 w-full text-left text-kumo-subtle hover:bg-kumo-elevated/50 cursor-pointer"
                    >
                      {collapsedDirs.has(dir) ? <CaretRight size={10} /> : <CaretDown size={10} />}
                      <span className="text-[10px] truncate">{dirLabel(dir)}</span>
                    </button>
                    {!collapsedDirs.has(dir) && (
                      <div className="pl-4 py-1 text-[10px] text-kumo-subtle italic">(empty)</div>
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
                    className="flex items-center gap-1.5 px-2 py-1 w-full text-left text-kumo-subtle hover:bg-kumo-elevated/50 cursor-pointer"
                  >
                    {isCollapsed ? <CaretRight size={10} /> : <CaretDown size={10} />}
                    <span className="text-[10px] truncate">{dirLabel(dir)}</span>
                    <span className="text-[9px] text-kumo-subtle ml-auto">{files.length}</span>
                  </button>
                  {!isCollapsed && (
                    <div>
                      {files.map((f) => {
                        const isMarkdown = f.path.endsWith(".md");
                        const isActive = activeTabPath === f.path;
                        return (
                          <FileRow
                            key={f.path}
                            icon={<File size={10} />}
                            active={isActive}
                            disabled={!isMarkdown}
                            onClick={() => onFileClick(f)}
                          >
                            <span className="truncate">{f.name}</span>
                          </FileRow>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
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
              <div className="flex items-center justify-center h-full px-4 py-8 text-center text-xs text-kumo-subtle">
                <div>
                  <FileText size={24} className="text-kumo-subtle mb-2 mx-auto opacity-40" />
                  <p>Select a markdown file from the browser to view its content</p>
                </div>
              </div>
            ) : contentLoading ? (
              <div className="flex items-center justify-center h-full text-xs text-kumo-subtle">Loading...</div>
            ) : activeContent === null ? (
              <div className="flex items-center justify-center h-full px-4 py-8 text-center text-xs text-kumo-subtle">
                <div>
                  <p className="mb-1">Unable to read this file</p>
                  <p className="text-[10px] text-kumo-subtle mb-3">Check that the project root path is set in settings</p>
                  <button
                    type="button"
                    onClick={refreshContent}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border border-kumo-line hover:bg-kumo-elevated hover:text-kumo-default transition-colors"
                  >
                    <ArrowCounterClockwise size={12} />
                    Retry
                  </button>
                </div>
              </div>
            ) : activeContent === "" ? (
              <div className="flex items-center justify-center h-full text-xs text-kumo-subtle">File is empty</div>
            ) : (
              <div className="px-4 py-3 spec-markdown">
                <MarkdownViewer content={activeContent ?? ""} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function dirLabel(dir: string): string {
  return dir.replace("input/", "📥 ").replace("output/", "📤 ");
}

function StatCard({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="glass-panel rounded-2xl px-4 py-3">
      <span className="text-xs text-kumo-subtle">{label}</span>
      <span className={`block mt-0.5 text-base font-semibold ${value ? "text-kumo-default" : "text-kumo-subtle"}`}>{value || "—"}</span>
    </div>
  );
}
