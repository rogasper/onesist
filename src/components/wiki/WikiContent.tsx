import { useState, useEffect } from "react";
import { PencilSimple, Check, X, TextBolderIcon, TextItalic, TextH, ListBullets, ListNumbers, Code, Link } from "@phosphor-icons/react";
import { MarkdownViewer } from "~/components/mermaid/DiagramRenderer";
import type { WikiPage } from "~/shared/types";

interface WikiContentProps {
  page: WikiPage;
  onSave: (id: string, title: string, contentMd: string) => Promise<void>;
}

const TOOLS = [
  { icon: TextBolderIcon, label: "Bold", wrap: "**" },
  { icon: TextItalic, label: "Italic", wrap: "*" },
  { icon: Code, label: "Code", wrap: "`" },
  { icon: TextH, label: "Heading", prefix: "## " },
  { icon: ListBullets, label: "Bullet list", prefix: "- " },
  { icon: ListNumbers, label: "Numbered list", prefix: "1. " },
  { icon: Link, label: "Link", template: "[text](url)" },
] as const;

export function WikiContent({ page, onSave }: WikiContentProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(page.title);
  const [contentMd, setContentMd] = useState(page.contentMd ?? "");
  const textareaRef = useState<HTMLTextAreaElement | null>(null);

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

  const insertFormatting = (tool: typeof TOOLS[number]) => {
    const ta = (document.querySelector(".wiki-textarea") as HTMLTextAreaElement);
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = contentMd.slice(start, end);
    let before = contentMd.slice(0, start);
    let after = contentMd.slice(end);

    if ("wrap" in tool) {
      const wrap = tool.wrap as string;
      const insertion = selected ? `${wrap}${selected}${wrap}` : `${wrap}text${wrap}`;
      setContentMd(before + insertion + after);
    } else if ("prefix" in tool) {
      const prefix = tool.prefix as string;
      const insertion = selected ? selected.split("\n").map((l) => prefix + l).join("\n") : prefix;
      setContentMd(before + insertion + after);
    } else if ("template" in tool) {
      const insertion = selected ? `[${selected}](url)` : tool.template;
      setContentMd(before + insertion + after);
    }
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
        <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-kumo-line/50 bg-kumo-elevated/20 shrink-0">
          {TOOLS.map((tool) => (
            <button key={tool.label} onClick={() => insertFormatting(tool)}
              className="px-2 py-1 rounded text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated/80 transition-colors" title={tool.label}>
              <tool.icon size={14} />
            </button>
          ))}
          <span className="ml-auto text-[10px] text-kumo-subtle">Markdown</span>
        </div>
        <textarea value={contentMd} onChange={(e) => setContentMd(e.target.value)}
          className="wiki-textarea flex-1 bg-kumo-elevated/30 text-sm text-kumo-default font-mono p-4 resize-none outline-none border-none leading-relaxed"
          placeholder="Write your content here... Use the toolbar above for formatting." />
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
        <div className="px-8 py-6 max-w-3xl spec-markdown">
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
