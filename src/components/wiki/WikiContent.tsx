import { useState, useEffect } from "react";
import { PencilSimple, Check, X } from "@phosphor-icons/react";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import { MdxEditorClient } from "~/components/mdx/MdxEditorClient";
import type { WikiPage } from "~/shared/types";

interface WikiContentProps {
  page: WikiPage;
  projectId: string;
  onSave: (id: string, title: string, contentMd: string) => Promise<void>;
}

export function WikiContent({ page, projectId, onSave }: WikiContentProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(page.title);
  const [contentMd, setContentMd] = useState(page.contentMd ?? "");

  useEffect(() => {
    setTitle(page.title);
    setContentMd(page.contentMd ?? "");
    setEditing(false);
  }, [page.id]);

  const handleSave = async () => {
    await onSave(page.id, title, contentMd);
    setEditing(false);
  };

  const handleCancel = () => {
    setTitle(page.title);
    setContentMd(page.contentMd ?? "");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-kumo-line shrink-0">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            className="flex-1 bg-kumo-elevated border border-kumo-line rounded px-2 py-1 text-sm text-kumo-default outline-none focus:border-kumo-brand" placeholder="Page title" />
          <button onClick={handleSave} className="text-green-400 hover:text-green-300 transition-colors" title="Save"><Check size={16} /></button>
          <button onClick={handleCancel} className="text-kumo-subtle hover:text-kumo-default transition-colors" title="Cancel"><X size={16} /></button>
        </div>
        <div className="flex-1 min-h-0">
          <MdxEditorClient content={contentMd} onChange={setContentMd} projectId={projectId} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-kumo-line shrink-0">
        <div className="flex-1 overflow-hidden">
          <h2 className="text-sm font-medium text-kumo-default truncate">{page.title}</h2>
        </div>
        <button onClick={() => setEditing(true)} className="text-kumo-subtle hover:text-kumo-default transition-colors" title="Edit">
          <PencilSimple size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-8 py-6 min-h-full spec-markdown">
          {page.contentMd ? (
            <MarkdownViewer content={page.contentMd} />
          ) : (
            <div className="text-sm text-kumo-subtle italic">Empty page — click edit to add content.</div>
          )}
        </div>
      </div>
    </div>
  );
}
