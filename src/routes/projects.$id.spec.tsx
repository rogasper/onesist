import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Badge } from "@cloudflare/kumo";
import { BookOpen, MagnifyingGlass, X, ArrowsClockwise } from "@phosphor-icons/react";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import { parseMarkdownToModules } from "~/lib/spec-parser";
import { SpecSidebar } from "~/components/spec/SpecSidebar";
import { SpecViewer } from "~/components/spec/SpecViewer";
import { useFileList, useFileContent, useFileWatch } from "~/lib/use-file-data";

export const Route = createFileRoute("/projects/$id/spec")({
  component: SpecPage,
});

function SpecPage() {
  const { id } = Route.useParams();
  const [viewMode, setViewMode] = useState<"cards" | "document">("cards");
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncedStats, setSyncedStats] = useState<{ specs: number; endpoints: number } | null>(null);

  // Try MASTER_SPEC_API.md first, then output/spec/ files
  const { files } = useFileList("output", id);
  const { content: masterContent } = useFileContent("MASTER_SPEC_API.md", id);
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null);
  const { content: specContent, refresh: refreshSpec } = useFileContent(selectedSpec, id);

  const activeContent = selectedSpec ? specContent : masterContent;

  const mdFiles = useMemo(() => files.filter((f) => f.ext === ".md" && f.type === "spec"), [files]);

  const autoSelectedRef = useRef(false);

  // Auto-select first spec file (one-shot, does not re-fire on Master click)
  useEffect(() => {
    if (!autoSelectedRef.current && mdFiles.length > 0) {
      setSelectedSpec(mdFiles[0].path);
      autoSelectedRef.current = true;
    }
  }, [mdFiles]);

  // Live watch
  useFileWatch("spec", (path) => {
    if (path === selectedSpec) refreshSpec();
  });

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const modules = useMemo(() => {
    if (!activeContent) return [];
    try { return parseMarkdownToModules(activeContent); } catch { return []; }
  }, [activeContent]);

  const filteredModules = useMemo(() => {
    if (!debouncedSearch.trim()) return modules;
    const q = debouncedSearch.toLowerCase();
    return modules
      .map((m) => ({
        ...m,
        endpoints: m.endpoints.filter(
          (e) => e.path.toLowerCase().includes(q) || e.title.toLowerCase().includes(q)
        ),
      }))
      .filter((m) => m.endpoints.length > 0);
  }, [modules, debouncedSearch]);

  const totalEndpoints = modules.reduce((sum, m) => sum + m.endpoints.length, 0);
  const epWithMethod = modules.reduce((sum, m) => sum + m.endpoints.filter((e) => e.method).length, 0);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch(`/api/projects/${id}/specs/import`, { method: "POST" });
      if (res.ok) {
        const d = await res.json();
        setSyncedStats(d.imported);
      }
    } catch (e) {
      console.error("Sync failed", e);
    }
    setSyncing(false);
  }, [id]);

  const handleNavigateDetail = useCallback((path: string) => {
    setSelectedSpec(path);
  }, []);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 70px)" }}>
      <div className="mb-3 shrink-0 space-y-2">
        {/* Row 1: Breadcrumb */}
        <div className="text-xs text-kumo-subtle">
          <Link to="/projects/$id" params={{ id }} className="text-kumo-subtle hover:text-kumo-default no-underline">Projects</Link>
          <span className="mx-1.5 text-kumo-subtle">/</span>
          <span className="text-kumo-default font-medium">API Spec</span>
        </div>

        {/* Row 2: Title + badges + Sync */}
        <div className="flex items-center gap-2">
          <div className="rounded bg-kumo-elevated p-1"><BookOpen size={14} className="text-kumo-brand" /></div>
          <h1 className="text-lg text-kumo-default">API Spec</h1>
          {totalEndpoints > 0 && (
            <><Badge variant="neutral" className="text-[11px]">{modules.length} modules</Badge>
              <Badge variant="neutral" className="text-[11px]">{totalEndpoints} items</Badge>
              <Badge variant="neutral" className="text-[11px]">{epWithMethod} endpoints</Badge></>
          )}
          {debouncedSearch && (
            <Badge variant="neutral" className="text-[11px]">
              {filteredModules.reduce((s, m) => s + m.endpoints.length, 0)} results
            </Badge>
          )}
          {syncedStats && (
            <Badge variant="neutral" className="text-[11px]">
              {syncedStats.specs} specs · {syncedStats.endpoints} eps in DB
            </Badge>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="ml-auto flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border border-kumo-line/50 bg-kumo-elevated/40 text-kumo-subtle hover:text-kumo-default disabled:opacity-50 transition-all"
            title="Parse all spec files and save endpoints to SQLite"
          >
            <ArrowsClockwise size={12} className={syncing ? "animate-spin" : ""} />
            <span>{syncing ? "Syncing…" : "Sync to DB"}</span>
          </button>
        </div>

        {/* Row 3: File selector */}
        <div className="flex items-center gap-1.5 text-[11px] overflow-x-auto pb-0.5">
          <button onClick={() => { setSelectedSpec(null); setActiveModule(null); }}
            className={`px-3 py-1 rounded-full bg-kumo-elevated border shrink-0 transition-all ${!selectedSpec ? "border-kumo-brand bg-kumo-brand/20 text-kumo-brand font-medium" : "border-kumo-line/50 text-kumo-subtle hover:text-kumo-default hover:bg-white/5"}`}>Master</button>
          {mdFiles.map((f) => (
            <button key={f.path} onClick={() => { setSelectedSpec(f.path); setActiveModule(null); }}
              className={`px-3 py-1 rounded-full bg-kumo-elevated border shrink-0 transition-all ${selectedSpec === f.path ? "border-kumo-brand bg-kumo-brand/20 text-kumo-brand font-medium" : "border-kumo-line/50 text-kumo-subtle hover:text-kumo-default hover:bg-white/5"}`}>{f.path.replace(/^output\/(spec\/)?/, "").replace(/\.md$/, "").replace(/(^|\/)spec_api_/, "$1")}</button>
          ))}
        </div>

        {/* Row 4: Tabs + Search */}
        <div className="flex items-center gap-3 border-b border-kumo-line/50">
          {(["cards", "document"] as const).map((mode) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 text-xs rounded-t transition-all capitalize ${
                viewMode === mode
                  ? "liquid-tab-active font-medium"
                  : "text-kumo-subtle liquid-tab-hover"
              }`}>
              {mode}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1 mb-1">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search paths…"
                className="w-48 h-7 pl-7 pr-6 text-xs rounded-full border border-kumo-line/50 bg-kumo-elevated/40 text-kumo-default placeholder:text-kumo-subtle outline-none focus:border-kumo-brand"
              />
              <MagnifyingGlass size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-kumo-subtle pointer-events-none" />
              {search && (
                <button onClick={() => { setSearch(""); setDebouncedSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-kumo-subtle hover:text-kumo-default">
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {!activeContent ? (
        <div className="flex items-center justify-center flex-1 text-kumo-subtle text-sm">No spec files found</div>
      ) : viewMode === "document" ? (
        <div className="flex-1 min-h-0 glass-container overflow-hidden">
          <div className="h-full overflow-y-auto">
            <div className="spec-markdown">
              <MarkdownViewer content={activeContent ?? ""} />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 glass-container overflow-hidden">
          <div className="w-48 shrink-0 border-r border-kumo-line overflow-y-auto bg-kumo-elevated/30">
            <SpecSidebar modules={filteredModules} activeModule={activeModule} onModuleClick={(name) => setActiveModule((p) => p === name ? null : name)} />
          </div>
          <SpecViewer modules={filteredModules} activeModule={activeModule} totalEndpoints={totalEndpoints} onNavigateDetail={handleNavigateDetail} />
        </div>
      )}
    </div>
  );
}
