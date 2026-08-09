import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback } from "react";
import { Badge } from "@cloudflare/kumo";
import { Notepad, FileText } from "@phosphor-icons/react";
import { loadAllData } from "~/lib/project-queries";
import { WikiSidebar } from "~/components/wiki/WikiSidebar";
import { WikiContent } from "~/components/wiki/WikiContent";

interface WikiPage {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  slug: string;
  contentMd: string | null;
  contentHtml: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export const Route = createFileRoute("/projects/$id/wiki")({
  loader: async ({ params }) => {
    const data = await loadAllData();
    const project = ((data.projects as any[]) || []).find((p: any) => p.id === params.id) ?? null;
    const wikiPages = ((data.wikiPages as any[]) || []).filter((w: any) => w.projectId === params.id);
    return { project, wikiPages: wikiPages as WikiPage[] };
  },
  component: WikiPage,
});

function WikiPage() {
  const { id } = Route.useParams();
  const loaderData = Route.useLoaderData() as { wikiPages: WikiPage[] };
  const [pages, setPages] = useState<WikiPage[]>(loaderData?.wikiPages ?? []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activePage = pages.find((p) => p.id === activeId) ?? null;

  const handleAdd = useCallback(async () => {
    const now = new Date().toISOString();
    const newPage: WikiPage = {
      id: crypto.randomUUID(),
      projectId: id,
      parentId: null,
      title: `Page ${pages.length + 1}`,
      slug: `page-${pages.length + 1}`,
      contentMd: "",
      contentHtml: null,
      sortOrder: pages.length,
      createdAt: now,
      updatedAt: now,
    };
    try {
      const res = await fetch(`/api/projects/${id}/wiki`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newPage.title, contentMd: "" }),
      });
      if (!res.ok) return;
      const saved = await res.json();
      setPages((prev) => [...prev, saved]);
      setActiveId(saved.id);
    } catch (e) {
      console.error("[Wiki] create failed:", e);
    }
  }, [id, pages.length]);

  const handleSave = useCallback(async (pageId: string, title: string, contentMd: string) => {
    try {
      const res = await fetch(`/api/projects/${id}/wiki/${pageId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, contentMd }),
      });
      if (!res.ok) return;
      const updated = await res.json();
      setPages((prev) => prev.map((p) => (p.id === pageId ? updated : p)));
    } catch (e) {
      console.error("[Wiki] save failed:", e);
    }
  }, [id]);

  const handleDelete = useCallback(async (pageId: string) => {
    try {
      const res = await fetch(`/api/projects/${id}/wiki/${pageId}`, { method: "DELETE" });
      if (!res.ok) return;
      setPages((prev) => prev.filter((p) => p.id !== pageId));
      if (activeId === pageId) setActiveId(null);
    } catch (e) {
      console.error("[Wiki] delete failed:", e);
    }
  }, [id, activeId]);

  const handleGenerateDocs = useCallback(async () => {
    setError(null);
    try {
      const detectRes = await fetch("/api/agent/detect", { cache: "no-store" });
      const agents = await detectRes.json();
      const found = agents.find((a: any) => a.found);
      if (!found) { setError("No agent CLI found — run Analysis from FSD tab first"); return; }

      // Read all spec files and combine into one wiki page
      const specRes = await fetch("/api/files/list?dir=output/spec", { cache: "no-store" });
      const specFiles = await specRes.json();
      let combinedContent = "# Technical Documentation\n\nAuto-generated from artifacts.\n\n";

      for (const file of specFiles.slice(0, 10)) {
        const contentRes = await fetch(`/api/files/read?path=${encodeURIComponent(file.path)}`, { cache: "no-store" });
        const { content } = await contentRes.json();
        if (content) {
          combinedContent += `\n---\n\n## ${file.name.replace(/\.md$/, "")}\n\n${content.slice(0, 3000)}\n`;
        }
      }

      // Save as wiki page
      const saveRes = await fetch(`/api/projects/${id}/wiki`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Technical Documentation (auto-generated)",
          contentMd: combinedContent,
        }),
      });
      if (saveRes.ok) {
        const saved = await saveRes.json();
        setPages((prev) => [...prev, saved]);
        setActiveId(saved.id);
      }
    } catch (e) {
      console.error("[Wiki] generate docs failed:", e);
    }
  }, [id]);

  return (
    <div className="app-page-height flex flex-col">
      <div className="mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="rounded bg-kumo-elevated p-1"><Notepad size={14} className="text-kumo-brand" /></div>
          <h1 className="text-xl font-semibold tracking-tight text-kumo-default">Wiki / Docs</h1>
          {pages.length > 0 && <Badge variant="neutral" className="text-[11px]">{pages.length} pages</Badge>}
          <button onClick={handleGenerateDocs}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-white bg-kumo-brand rounded-full hover:opacity-90 transition-opacity">
            <FileText size={12} /> Generate from artifacts
          </button>
        </div>
        {error && (
          <div className="mt-2 text-xs text-red-400 p-2 bg-red-400/10 rounded">{error}</div>
        )}
      </div>

      <div className="flex flex-1 min-h-0 glass-container overflow-hidden">
        <div className="w-52 shrink-0 border-r border-kumo-line overflow-y-auto bg-kumo-elevated/30">
          <WikiSidebar
            pages={pages}
            activeId={activeId}
            onSelect={setActiveId}
            onAdd={handleAdd}
            onDelete={handleDelete}
          />
        </div>
        <div className="flex-1 min-w-0">
          {activePage ? (
            <WikiContent key={activePage.id} page={activePage} onSave={handleSave} />
          ) : (
            <div className="flex items-center justify-center h-full text-xs text-kumo-subtle">
              Select a page from the sidebar or create a new one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
