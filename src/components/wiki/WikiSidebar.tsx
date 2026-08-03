import { FileText, Plus, TrashSimple } from "@phosphor-icons/react";
import type { WikiPage } from "~/shared/types";

interface WikiSidebarProps {
  pages: WikiPage[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
}

export function WikiSidebar({ pages, activeId, onSelect, onAdd, onDelete }: WikiSidebarProps) {
  const topLevel = pages.filter((p) => !p.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 flex items-center justify-between border-b border-kumo-line shrink-0">
        <span className="text-xs font-medium text-kumo-default">Pages</span>
        <button onClick={onAdd} className="text-kumo-subtle hover:text-kumo-default transition-colors" title="New page">
          <Plus size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {pages.length === 0 && (
          <div className="px-3 py-4 text-[11px] text-kumo-subtle text-center">No pages yet</div>
        )}
        {topLevel.map((page) => (
          <PageItem
            key={page.id}
            page={page}
            pages={pages}
            activeId={activeId}
            depth={0}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

function PageItem({
  page, pages, activeId, depth, onSelect, onDelete,
}: {
  page: WikiPage;
  pages: WikiPage[];
  activeId: string | null;
  depth: number;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const children = pages
    .filter((p) => p.parentId === page.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div>
      <div
        className={`group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-l-2 transition-colors ${
          activeId === page.id
            ? "border-kumo-brand bg-kumo-brand/25 text-white"
            : "border-transparent text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated/60"
        }`}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
        onClick={() => onSelect(page.id)}
      >
        <FileText size={12} className="shrink-0 opacity-50" />
        <span className="truncate flex-1">{page.title}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(page.id); }}
          className="opacity-0 group-hover:opacity-100 text-kumo-subtle hover:text-red-400 transition-all shrink-0"
          title="Delete page"
        >
          <TrashSimple size={11} />
        </button>
      </div>
      {children.map((child) => (
        <PageItem
          key={child.id}
          page={child}
          pages={pages}
          activeId={activeId}
          depth={depth + 1}
          onSelect={onSelect}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}
