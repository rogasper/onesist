import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, DownloadSimple, FileText, PencilSimple, Note, ArrowCounterClockwise, ArrowClockwise, Check, Warning, Trash } from "@phosphor-icons/react";
import { loadProjectRouteData } from "~/lib/project-queries";
import { buildDocPrompt, REQUIRED_DOC_ARTIFACTS, type DocArtifact } from "~/lib/doc-prompt";
import { DOC_TEMPLATE_PATH, fillTemplatePlaceholders } from "~/lib/doc-template";
import type { DocMeta } from "~/shared/types";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import { AppButton } from "~/components/ui/AppButton";
import { MentionTextarea, type MentionFile } from "~/components/docs/MentionTextarea";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { PageHeader } from "~/components/ui/PageHeader";
import { InlineAlert } from "~/components/ui/InlineAlert";

export const Route = createFileRoute("/projects/$id/docs")({
  loader: async ({ params }) => loadProjectRouteData(params.id),
  component: DocsPage,
});

const INPUT_CLS =
  "w-full bg-kumo-elevated/60 border border-kumo-line rounded px-2.5 py-1.5 text-sm text-kumo-default placeholder:text-kumo-subtle focus:border-kumo-brand focus:outline-none";

const META_FIELDS: { key: keyof DocMeta; label: string; placeholder?: string }[] = [
  { key: "customerName", label: "Customer Name", placeholder: "e.g. PT Maju Bersama" },
  { key: "projectName", label: "Project Name" },
  { key: "projectId", label: "Project ID" },
  { key: "version", label: "Version", placeholder: "1.0.0" },
  { key: "author", label: "Author", placeholder: "e.g. SA Team" },
];

function DocsPage() {
  const { id } = Route.useParams();
  const loaderData = Route.useLoaderData() as { project: any };
  const project = loaderData?.project ?? null;
  const rootPath = project?.rootPath ?? "";

  const [meta, setMeta] = useState<DocMeta>({
    customerName: "", projectName: project?.name ?? "", projectId: id, version: "1.0.0", author: "",
  });
  const [metaSaved, setMetaSaved] = useState(false);
  const [artifacts, setArtifacts] = useState<DocArtifact[]>([]);
  const [prompt, setPrompt] = useState("");
  const [mentionFiles, setMentionFiles] = useState<MentionFile[]>([]);
  const [copied, setCopied] = useState<"prompt" | "command" | null>(null);

  const [template, setTemplate] = useState("");
  const [templateDirty, setTemplateDirty] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);

  const [tdFiles, setTdFiles] = useState<{ name: string; path: string }[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<string>("");
  const [selectedLoading, setSelectedLoading] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ name: string; path: string } | null>(null);

  const [leftWidth, setLeftWidth] = useState(300);
  const [promptHeight, setPromptHeight] = useState(170);

  const startColDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = leftWidth;
    const move = (ev: PointerEvent) => {
      const next = Math.min(Math.max(startWidth + (ev.clientX - startX), 220), Math.round(window.innerWidth * 0.5));
      setLeftWidth(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startRowDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = promptHeight;
    const move = (ev: PointerEvent) => {
      const next = Math.min(Math.max(startHeight + (ev.clientY - startY), 90), Math.round(window.innerHeight * 0.6));
      setPromptHeight(next);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/files/delete?projectId=${id}&path=${encodeURIComponent(deleteTarget.path)}`, { method: "DELETE" });
      if (res.ok) {
        setTdFiles((prev) => prev.filter((f) => f.path !== deleteTarget.path));
        if (selectedPath === deleteTarget.path) {
          setSelectedPath(null);
          setSelectedContent("");
        }
        setInfo(`Deleted ${deleteTarget.name}`);
      }
    } catch {}
    setDeleteTarget(null);
  };

  useEffect(() => { void loadMeta(); void loadTemplate(); void loadTdFiles(); void loadMentionFiles(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMentionFiles = async () => {
    try {
      const res = await fetch(`/api/projects/${id}/docs/files`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMentionFiles((data.files ?? []) as MentionFile[]);
      }
    } catch {}
  };

  const loadMeta = async () => {
    try {
      const res = await fetch(`/api/projects/${id}/docs/meta`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMeta((prev) => ({ ...prev, ...data, projectName: data.projectName || prev.projectName, projectId: data.projectId || prev.projectId }));
      }
    } catch {}
    void loadArtifacts();
  };

  const loadArtifacts = async () => {
    const entries = await Promise.all(
      REQUIRED_DOC_ARTIFACTS.map(async (a) => {
        let present = false;
        try {
          if (a.path.includes("/")) {
            const res = await fetch(`/api/files/list?projectId=${id}&dir=${encodeURIComponent(a.path)}`, { cache: "no-store" });
            const list = res.ok ? ((await res.json()) as any[]) : [];
            present = list.length > 0;
          } else {
            const res = await fetch(`/api/files/read?projectId=${id}&path=${encodeURIComponent(a.path)}`, { cache: "no-store" });
            present = res.ok;
          }
        } catch {}
        return { ...a, present };
      }),
    );
    setArtifacts(entries);
  };

  const loadTemplate = async () => {
    try {
      const res = await fetch(`/api/projects/${id}/docs/template`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTemplate(data.content ?? "");
        setTemplateDirty(false);
      }
    } catch {}
  };

  const loadTdFiles = async () => {
    try {
      const res = await fetch(`/api/files/list?projectId=${id}&dir=${encodeURIComponent("output/td")}`, { cache: "no-store" });
      const list = res.ok ? ((await res.json()) as any[]) : [];
      setTdFiles(list.filter((f) => f.name.endsWith(".md")));
    } catch {}
  };

  const refreshAll = () => {
    void loadMeta();
    void loadTemplate();
    void loadTdFiles();
    void loadMentionFiles();
  };

  const saveMeta = async () => {
    setMetaSaved(false);
    try {
      const res = await fetch(`/api/projects/${id}/docs/meta`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: meta.customerName, version: meta.version, author: meta.author }),
      });
      if (res.ok) { setMetaSaved(true); setTimeout(() => setMetaSaved(false), 2000); }
    } catch {}
  };

  const generatedPrompt = useMemo(() => buildDocPrompt(meta, artifacts), [meta, artifacts]);

  const promptInitialized = useRef(false);
  useEffect(() => {
    if (promptInitialized.current || artifacts.length === 0) return;
    promptInitialized.current = true;
    setPrompt(generatedPrompt);
  }, [generatedPrompt, artifacts]);

  const regeneratePrompt = () => {
    promptInitialized.current = true;
    setPrompt(generatedPrompt);
  };

  const copy = async (kind: "prompt" | "command") => {
    const text = kind === "prompt"
      ? prompt
      : `opencode run "${prompt.replace(/"/g, '\\"')}" --auto --dir "${rootPath}"`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  const saveTemplate = async () => {
    try {
      const res = await fetch(`/api/projects/${id}/docs/template`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: template }),
      });
      if (res.ok) {
        setTemplateDirty(false);
        setTemplateSaved(true);
        setTimeout(() => setTemplateSaved(false), 2000);
      }
    } catch {}
  };

  const restoreTemplate = async () => {
    try {
      await fetch(`/api/projects/${id}/docs/template/reset`, { method: "POST" });
      await loadTemplate();
    } catch {}
  };

  const openTdFile = async (path: string) => {
    setSelectedPath(path);
    setSelectedLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/files/read?projectId=${id}&path=${encodeURIComponent(path)}`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setSelectedContent(data.content ?? "");
      } else {
        setError("Failed to read file");
        setSelectedContent("");
      }
    } catch {
      setError("Failed to read file");
      setSelectedContent("");
    } finally {
      setSelectedLoading(false);
    }
  };

  const exportDocx = async () => {
    if (!selectedContent) return;
    setExporting(true);
    setError(null);
    setInfo(null);
    let mermaid: any = null;
    let prevConfig: any = null;
    try {
      const mermaidMod = await import("mermaid");
      mermaid = mermaidMod.default;
      // htmlLabels:false renders labels as SVG <text>/<tspan> instead of HTML
      // <foreignObject> — foreignObject is NOT rendered by browsers when an SVG
      // is loaded through <img>, so diagrams with <br/> labels would come out
      // blank/undecodable. neutral theme = light fills, readable on white.
      try { prevConfig = mermaid.getConfig(); } catch {}
      mermaid.initialize({ theme: "default", htmlLabels: false, startOnLoad: false, securityLevel: "strict" });

      const re = /```mermaid\s*\n([\s\S]*?)\n```/g;
      const jobs: string[] = [];
      let mm: RegExpExecArray | null;
      while ((mm = re.exec(selectedContent)) !== null) jobs.push(mm[1]);

      const pngs: (string | null)[] = [];
      for (let i = 0; i < jobs.length; i++) {
        pngs.push(await renderMermaidToPng(mermaid, jobs[i], i));
      }

      let processed = selectedContent;
      let offset = 0;
      let pidx = 0;
      let m2: RegExpExecArray | null;
      const re2 = /```mermaid\s*\n([\s\S]*?)\n```/g;
      while ((m2 = re2.exec(selectedContent)) !== null) {
        const png = pngs[pidx];
        if (png) {
          const marker = `<!-- MERMAID:${pidx} -->`;
          processed = processed.slice(0, m2.index + offset) + marker + processed.slice(m2.index + m2[0].length + offset);
          offset += marker.length - m2[0].length;
        }
        pidx++;
      }

      const res = await fetch(`/api/projects/${id}/docs/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contentMd: processed, diagramPngs: pngs.filter(Boolean), meta }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as any;
        throw new Error(err?.error || "Export failed");
      }
      const blob = await res.blob();
      const safeName = (meta.projectName || "project").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40) || "project";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Technical-Documentation-${safeName}-${meta.version || "1.0.0"}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      const renderedCount = pngs.filter((p) => p !== null).length;
      const failedBlocks = pngs.map((p, i) => (p === null ? i : -1)).filter((i) => i !== -1);
      setInfo(jobs.length > 0
        ? `Exported ${a.download} (${renderedCount}/${jobs.length} diagrams embedded${failedBlocks.length ? ` — failed: block ${failedBlocks.join(", ")}` : ""})`
        : `Exported ${a.download} (no diagrams)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      // Restore the app's mermaid config exactly (preview theme stays dark).
      try { if (mermaid && prevConfig) mermaid.initialize(prevConfig); } catch {}
      setExporting(false);
    }
  };

  const presentCount = artifacts.filter((a) => a.present).length;
  const preview = selectedContent ? fillTemplatePlaceholders(selectedContent, meta) : "";

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        icon={<FileText size={14} className="text-kumo-brand" />}
        title="Technical Documentation"
        help="docs"
        actions={<AppButton onClick={refreshAll} variant="chip" size="sm" icon={<ArrowClockwise size={12} />} className="px-3">Refresh</AppButton>}
        below={
          <>
            {error && <InlineAlert kind="error" className="flex items-center gap-1.5"><Warning size={12} />{error}</InlineAlert>}
            {info && <InlineAlert kind="success">{info}</InlineAlert>}
            <p className="text-xs text-kumo-subtle max-w-3xl">
              SRS/Technical Documentation generated from project artifacts. Fill the metadata, copy the prompt, and run it in the
              terminal with <code className="text-kumo-default">opencode run</code> — the agent reads the editable template at{" "}
              <code className="text-kumo-default">{DOC_TEMPLATE_PATH}</code> and writes the result to <code className="text-kumo-default">output/td/</code>.
            </p>
          </>
        }
      />

      <div className="flex flex-1 min-h-0 gap-3">
        {/* Left column: metadata + artifacts + template */}
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-0.5 shrink-0" style={{ width: leftWidth }}>
          <div className="glass-panel rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-kumo-default uppercase tracking-wide">Document Metadata</h2>
              <AppButton onClick={saveMeta} variant="chip" size="sm" active={metaSaved} activeColor="success" icon={metaSaved ? <Check size={12} /> : <PencilSimple size={12} />} className="px-2.5">
                {metaSaved ? "Saved" : "Save"}
              </AppButton>
            </div>
            <div className="space-y-2.5">
              {META_FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="block text-[11px] text-kumo-subtle mb-1">{f.label}</span>
                  <input
                    className={INPUT_CLS}
                    value={meta[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => setMeta((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="glass-panel rounded-2xl p-4">
            <h2 className="text-xs font-semibold text-kumo-default uppercase tracking-wide mb-3">
              Required Artifacts <span className="text-kumo-subtle normal-case font-normal">({presentCount}/{artifacts.length})</span>
            </h2>
            {artifacts.length === 0 ? (
              <div className="text-[11px] text-kumo-subtle py-2">Checking artifacts…</div>
            ) : (
              <ul className="space-y-1.5">
                {artifacts.map((a) => (
                  <li key={a.path} className="flex items-start gap-1.5 text-[11px]">
                    <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${a.present ? "bg-green-400" : "bg-amber-400"}`} />
                    <span className={a.present ? "text-kumo-default" : "text-kumo-subtle"}>
                      {a.label}
                      {!a.present && <span className="text-amber-400/80"> (missing)</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="glass-panel rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-kumo-default uppercase tracking-wide">Template</h2>
              <AppButton onClick={() => setShowTemplate((p) => !p)} variant="chip" size="sm" icon={<Note size={12} />} className="px-2.5">
                {showTemplate ? "Hide" : "Edit"}
              </AppButton>
            </div>
            <p className="text-[11px] text-kumo-subtle leading-relaxed">
              Editable skeleton used by the agent. Stored at <code className="text-kumo-default">{DOC_TEMPLATE_PATH}</code>.
            </p>
            {showTemplate && (
              <div className="mt-3 space-y-2">
                <textarea
                  value={template}
                  onChange={(e) => { setTemplate(e.target.value); setTemplateDirty(true); }}
                  rows={14}
                  className="w-full bg-kumo-elevated/60 border border-kumo-line rounded p-2 text-[11px] font-mono text-kumo-default focus:border-kumo-brand focus:outline-none resize-y"
                />
                <div className="flex gap-2">
                  <AppButton onClick={saveTemplate} variant="chip" size="sm" active={templateSaved} activeColor="success" icon={templateSaved ? <Check size={12} /> : undefined} className="px-2.5" disabled={!templateDirty}>
                    {templateSaved ? "Saved" : "Save template"}
                  </AppButton>
                  <AppButton onClick={restoreTemplate} variant="chip" size="sm" icon={<ArrowCounterClockwise size={12} />} className="px-2.5">Restore default</AppButton>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Vertical divider (resize left/right columns) */}
        <div
          onPointerDown={startColDrag}
          className="w-1 shrink-0 cursor-col-resize rounded bg-kumo-line/40 hover:bg-kumo-brand/50 transition-colors"
          title="Drag to resize width"
        />

        {/* Right column: prompt + td files + preview */}
        <div className="flex flex-col min-h-0 gap-3 flex-1 min-w-0">
          <div className="glass-panel rounded-2xl p-4 shrink-0 flex flex-col" style={{ height: promptHeight }}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-xs font-semibold text-kumo-default uppercase tracking-wide">Agent Prompt</h2>
              <AppButton onClick={regeneratePrompt} variant="chip" size="sm" icon={<ArrowCounterClockwise size={12} />} className="px-2.5">Regenerate</AppButton>
            </div>
            <p className="text-[11px] text-kumo-subtle mb-2">
              Editable — type <code className="text-kumo-default">@</code> to mention a project file. Run in the terminal (the embedded
              terminal works too): <code className="text-kumo-default">opencode run "&lt;prompt&gt;" --auto --dir "{rootPath || "&lt;projectRoot&gt;"}"</code>
            </p>
            <div className="flex gap-2 mb-2">
              <AppButton onClick={() => copy("prompt")} variant="chip" size="sm" active={copied === "prompt"} activeColor="success" icon={<Copy size={12} />} className="px-3">
                {copied === "prompt" ? "Copied" : "Copy prompt"}
              </AppButton>
              <AppButton onClick={() => copy("command")} variant="chip" size="sm" active={copied === "command"} activeColor="success" icon={<Copy size={12} />} className="px-3">
                {copied === "command" ? "Copied" : "Copy command"}
              </AppButton>
            </div>
            <div className="flex-1 min-h-0">
              <MentionTextarea
                value={prompt}
                onChange={setPrompt}
                files={mentionFiles}
                className="w-full h-full resize-none bg-kumo-elevated/40 border border-kumo-line rounded p-2.5 text-[11px] font-mono text-kumo-subtle focus:outline-none"
                placeholder="Type @ to mention a project file…"
              />
            </div>
          </div>

          {/* Horizontal divider (resize prompt height) */}
          <div
            onPointerDown={startRowDrag}
            className="h-1 shrink-0 cursor-row-resize rounded bg-kumo-line/40 hover:bg-kumo-brand/50 transition-colors"
            title="Drag to resize height"
          />

          <div className="glass-panel rounded-2xl p-4 flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="text-xs font-semibold text-kumo-default uppercase tracking-wide">
                Generated Documents <span className="text-kumo-subtle normal-case font-normal">({tdFiles.length})</span>
              </h2>
              <AppButton onClick={loadTdFiles} variant="chip" size="sm" icon={<ArrowClockwise size={12} />} className="px-2.5">Reload</AppButton>
            </div>

            {tdFiles.length === 0 ? (
              <div className="text-[11px] text-kumo-subtle py-3">
                No documents in <code className="text-kumo-default">output/td/</code> yet. Run the prompt above to generate one.
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex gap-1.5 flex-wrap mb-2 shrink-0">
                  {tdFiles.map((f) => (
                    <span
                      key={f.path}
                      className={`group inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-full border transition-colors ${
                        selectedPath === f.path
                          ? "liquid-wash font-medium border-transparent"
                          : "border-kumo-line/40 text-kumo-subtle hover:text-kumo-default hover:bg-kumo-tint"
                      }`}
                    >
                      <button type="button" onClick={() => openTdFile(f.path)} className="truncate max-w-40">
                        {f.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget({ name: f.name, path: f.path })}
                        className="opacity-0 group-hover:opacity-100 text-kumo-subtle hover:text-red-400 transition-all shrink-0"
                        title="Delete"
                      >
                        <Trash size={11} />
                      </button>
                    </span>
                  ))}
                </div>

                <div className="flex-1 min-h-0 flex flex-col">
                  {selectedLoading ? (
                    <div className="text-[11px] text-kumo-subtle py-3">Loading…</div>
                  ) : selectedContent ? (
                    <div className="flex-1 min-h-0 flex flex-col gap-2">
                      <div className="shrink-0 flex items-center gap-2">
                        <span className="text-[11px] text-kumo-subtle truncate">{selectedPath}</span>
                        <AppButton onClick={exportDocx} variant="chip" size="sm" active={exporting} activeColor="brand" icon={<DownloadSimple size={12} />} className="ml-auto px-3" disabled={exporting}>
                          {exporting ? "Exporting…" : "Export DOCX"}
                        </AppButton>
                      </div>
                      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden glass-container rounded-lg p-4 spec-markdown docs-preview">
                        <MarkdownViewer content={preview} />
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-kumo-subtle py-3">Select a document to preview, then export to DOCX.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Document"
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
      >
        Are you sure you want to delete <code className="text-[11px] text-kumo-default">{deleteTarget?.name}</code> from{" "}
        <code className="text-[11px] text-kumo-default">output/td/</code>? This cannot be undone.
      </ConfirmDialog>
    </div>
  );
}

async function renderMermaidToPng(mermaid: any, code: string, index: number): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await renderOnce(mermaid, code, index, attempt);
    if (result) return result;
  }
  return null;
}

async function renderOnce(mermaid: any, code: string, index: number, attempt: number): Promise<string | null> {
  const id = `docx-mermaid-${index}-${Math.random().toString(36).slice(2, 7)}`;
  let svg: string;
  try {
    ({ svg } = await mermaid.render(id, code));
  } catch (e) {
    console.error(`[Docs] mermaid render failed (block ${index}${attempt ? ", retry" : ""}):`, e);
    return null;
  }

  // mermaid sets width="100%" on the SVG root, so naturalWidth is unreliable
  // when loading into an <img>. Derive the real size from the viewBox instead.
  const vb = svg.match(/viewBox="\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*"/);
  let w = vb ? parseFloat(vb[3]) : 0;
  let h = vb ? parseFloat(vb[4]) : 0;
  if (!w || !h) {
    const mw = svg.match(/width="([\d.]+)/);
    const mh = svg.match(/height="([\d.]+)/);
    w = mw ? parseFloat(mw[1]) : 800;
    h = mh ? parseFloat(mh[1]) : 600;
  }
  if (w < 10 || h < 10) {
    console.error(`[Docs] mermaid diagram too small (${w}x${h}) — skipping image for block ${index}`);
    return null;
  }

  const scale = 2;
  const cw = Math.round(w * scale);
  const ch = Math.round(h * scale);
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("svg decode failed"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } catch (e) {
    console.error(`[Docs] mermaid png decode failed (block ${index}${attempt ? ", retry" : ""}):`, e);
    return null;
  }
}
