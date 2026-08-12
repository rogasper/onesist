import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Badge } from "@cloudflare/kumo";
import { BookOpen, X, ArrowsClockwise, DownloadSimple } from "@phosphor-icons/react";
import { parse as parseYaml } from "yaml";
import "swagger-ui-react/swagger-ui.css";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import { parseMarkdownToModules } from "~/lib/spec-parser";
import { SpecSidebar } from "~/components/spec/SpecSidebar";
import { SpecViewer } from "~/components/spec/SpecViewer";
import { useFileList, useFileContent, useFileWatch } from "~/lib/use-file-data";
import { AppButton } from "~/components/ui/AppButton";
import { PageHeader } from "~/components/ui/PageHeader";
import { Placeholder } from "~/components/ui/Placeholder";
import { SearchInput } from "~/components/ui/SearchInput";
import { AgentStream } from "~/components/agent/AgentStream";

export const Route = createFileRoute("/projects/$id/spec")({
  component: SpecPage,
});

function SpecPage() {
  const { id } = Route.useParams();
  const [viewMode, setViewMode] = useState<"cards" | "document" | "openapi">("cards");
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncedStats, setSyncedStats] = useState<{ specs: number; endpoints: number } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genSessionId, setGenSessionId] = useState<string | null>(null);
  const [SwaggerUI, setSwaggerUI] = useState<React.ComponentType<any> | null>(null);

  // Swagger UI is browser-only (references DOM at module scope — would crash
  // SSR), so load it lazily on the client.
  useEffect(() => {
    let cancelled = false;
    void import("swagger-ui-react")
      .then((m) => { if (!cancelled) setSwaggerUI(() => m.default); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Try MASTER_SPEC_API.md first, then output/spec/ files
  const { files, refresh: refreshFiles } = useFileList("output", id);
  const { content: masterContent } = useFileContent("MASTER_SPEC_API.md", id);
  const [selectedSpec, setSelectedSpec] = useState<string | null>(null);
  const { content: specContent, refresh: refreshSpec } = useFileContent(selectedSpec, id);

  const openapiFiles = useMemo(() => files.filter((f) => f.ext === ".yaml" || f.ext === ".yml"), [files]);
  const [selectedOpenapi, setSelectedOpenapi] = useState<string | null>(null);
  const { content: openapiContent, refresh: refreshOpenapi } = useFileContent(selectedOpenapi, id);

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

  // Auto-select the master openapi file when present
  useEffect(() => {
    if (!selectedOpenapi && openapiFiles.length > 0) {
      const master = openapiFiles.find((f) => f.name.includes("openapi"));
      setSelectedOpenapi(master ? master.path : openapiFiles[0].path);
    }
  }, [openapiFiles, selectedOpenapi]);

  // Live watch
  useFileWatch("spec", (path) => {
    if (path === selectedSpec) refreshSpec();
    if (path === selectedOpenapi) refreshOpenapi();
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

  // Status legend parsed from x-status/x-phase in the openapi yaml
  const legend = useMemo(() => {
    if (!openapiContent) return { done: 0, inDevelop: 0, phases: {} as Record<string, number> };
    try {
      const doc = parseYaml(openapiContent) as any;
      let done = 0;
      let inDevelop = 0;
      const phases: Record<string, number> = {};
      for (const p of Object.values(doc?.paths ?? {})) {
        for (const op of Object.values((p ?? {}) as Record<string, any>)) {
          const s = op?.["x-status"] ?? "in-develop";
          if (s === "done") done++;
          else inDevelop++;
          const ph = op?.["x-phase"];
          if (ph != null) phases[`Phase ${ph}`] = (phases[`Phase ${ph}`] ?? 0) + 1;
        }
      }
      return { done, inDevelop, phases };
    } catch {
      return { done: 0, inDevelop: 0, phases: {} };
    }
  }, [openapiContent]);

  const handleGenerateOpenapi = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setGenSessionId(null);
    try {
      const detectRes = await fetch("/api/agent/detect", { cache: "no-store" });
      const agents = await detectRes.json();
      const found = (agents ?? []).find((a: any) => a.found);
      const command = found?.command ?? "opencode";
      const sid = crypto.randomUUID();
      const res = await fetch(`/api/agent/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: sid, command, agentName: found?.name ?? "opencode", mode: "openapi" }),
      });
      if (res.ok) setGenSessionId(sid);
      else setGenerating(false);
    } catch {
      setGenerating(false);
    }
  }, [generating]);

  const handleAgentDone = useCallback(() => {
    setGenerating(false);
    setGenSessionId(null);
    refreshFiles();
    refreshOpenapi();
  }, [refreshFiles, refreshOpenapi]);

  const handleAgentError = useCallback(() => {
    setGenerating(false);
    setGenSessionId(null);
  }, []);

  const handleDownloadOpenapi = useCallback(() => {
    if (!openapiContent || !selectedOpenapi) return;
    const blob = new Blob([openapiContent], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedOpenapi.split("/").pop() ?? "openapi.yaml";
    a.click();
    URL.revokeObjectURL(url);
  }, [openapiContent, selectedOpenapi]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        icon={<BookOpen size={14} className="text-kumo-brand" />}
        title="API Spec"
        badges={
          <>
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
          </>
        }
        actions={
          <>
            <AppButton
              onClick={handleGenerateOpenapi}
              disabled={generating}
              variant="primary"
              size="sm"
              icon={<ArrowsClockwise size={12} className={generating ? "animate-spin" : ""} />}
              className="rounded-full px-3"
              title="Generate openapi.yaml dari spec via AI"
            >
              {generating ? "Generating…" : "Generate OpenAPI"}
            </AppButton>
            <AppButton
              onClick={handleSync}
              disabled={syncing}
              variant="secondary"
              size="sm"
              icon={<ArrowsClockwise size={12} className={syncing ? "animate-spin" : ""} />}
              className="rounded-full px-3"
              title="Parse all spec files and save endpoints to SQLite"
            >
              {syncing ? "Syncing…" : "Sync to DB"}
            </AppButton>
          </>
        }
        below={
          <>
            {/* File selector */}
            <div className="flex items-center gap-1.5 overflow-x-auto py-2 px-1.5">
              <AppButton variant="chip" size="sm" active={!selectedSpec} onClick={() => { setSelectedSpec(null); setActiveModule(null); }} className="px-3 shrink-0">
                Master
              </AppButton>
              {mdFiles.map((f) => (
                <AppButton key={f.path} variant="chip" size="sm" active={selectedSpec === f.path} onClick={() => { setSelectedSpec(f.path); setActiveModule(null); }} className="px-3 shrink-0">
                  {f.path.replace(/^output\/(spec\/)?/, "").replace(/\.md$/, "").replace(/(^|\/)spec_api_/, "$1")}
                </AppButton>
              ))}
            </div>

            {/* Tabs + Search */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                {([["cards", "Cards"], ["document", "Document"], ["openapi", "OpenAPI"]] as const).map(([value, label]) => (
                  <AppButton
                    key={value}
                    variant="chip"
                    size="sm"
                    active={viewMode === value}
                    onClick={() => setViewMode(value)}
                    className="px-3"
                  >
                    {label}
                  </AppButton>
                ))}
              </div>
            <div className="ml-auto flex items-center gap-1 mb-1">
              <SearchInput
                value={search}
                onChange={(v) => { setSearch(v); if (!v) setDebouncedSearch(""); }}
                placeholder="Search paths…"
                className="w-48"
              />
            </div>
            </div>
          </>
        }
      />

      {!activeContent ? (
        <Placeholder className="flex-1 text-sm">No spec files found</Placeholder>
      ) : viewMode === "openapi" ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-kumo-recessed">
          <div className="flex items-center gap-3 px-4 py-2 border-b border-kumo-line shrink-0 bg-kumo-elevated/60 backdrop-blur flex-wrap">
            <AppButton
              variant="chip"
              size="sm"
              onClick={() => setViewMode("cards")}
              icon={<X size={12} />}
              className="px-2.5 shrink-0"
              title="Keluar fullscreen"
            >
              Back
            </AppButton>
            {openapiFiles.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-[40%]">
                {openapiFiles.map((f) => (
                  <AppButton key={f.path} variant="chip" size="sm" active={selectedOpenapi === f.path} onClick={() => setSelectedOpenapi(f.path)} className="px-3 shrink-0">
                    {f.path.replace(/^output\/spec\//, "")}
                  </AppButton>
                ))}
              </div>
            )}
            {openapiContent && (
              <>
                <span className="flex items-center gap-1.5 text-[11px] text-green-400 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-green-400" /> Done {legend.done}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-amber-400 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> In Develop {legend.inDevelop}
                </span>
                {Object.entries(legend.phases).map(([ph, n]) => (
                  <Badge key={ph} variant="neutral" className="text-[10px] shrink-0">{ph}: {n}</Badge>
                ))}
              </>
            )}
            <div className="ml-auto flex items-center gap-1.5 shrink-0">
              <AppButton
                onClick={handleGenerateOpenapi}
                disabled={generating}
                variant="primary"
                size="sm"
                icon={<ArrowsClockwise size={12} className={generating ? "animate-spin" : ""} />}
                className="rounded-full px-3"
                title="Generate openapi.yaml dari spec via AI"
              >
                {generating ? "Generating…" : "Generate OpenAPI"}
              </AppButton>
              <AppButton
                onClick={handleDownloadOpenapi}
                disabled={!openapiContent}
                variant="secondary"
                size="sm"
                icon={<DownloadSimple size={12} />}
                className="rounded-full px-3"
                title="Download file openapi.yaml"
              >
                Download
              </AppButton>
            </div>
          </div>

          {genSessionId && (
            <div className="shrink-0 border-b border-kumo-line">
              <AgentStream sessionId={genSessionId} onDone={handleAgentDone} onError={handleAgentError} />
            </div>
          )}

          {openapiFiles.length === 0 ? (
            <div className="flex items-center justify-center flex-1 text-kumo-subtle text-sm">
              Belum ada file openapi.yaml — klik "Generate OpenAPI" untuk membuatnya dari spec
            </div>
          ) : SwaggerUI ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <SwaggerUI
                spec={openapiContent ?? ""}
                deepLinking
                docExpansion="list"
                defaultModelsExpandDepth={1}
                tryItOutEnabled={false}
              />
            </div>
          ) : (
            <div className="flex items-center justify-center flex-1 text-kumo-subtle text-sm">Loading…</div>
          )}
        </div>
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
