import { Scan, FileText, Clock, Plus, UploadSimple, MagnifyingGlass, CheckCircle } from "@phosphor-icons/react";

interface FsdSession {
  id: string;
  fsdInputPath: string | null;
  title: string | null;
  mode: string;
  status: string;
  sourceType: string | null;
  conversionStatus: string | null;
  createdAt: string;
}

interface FsdSidebarProps {
  sessions: FsdSession[];
  activeId: string | null;
  search: string;
  onSearchChange: (q: string) => void;
  onSelect: (id: string) => void;
  onScan: () => void;
  onCreate: () => void;
  onUpload: () => void;
  scanning: boolean;
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function statusBadge(status: string) {
  if (status === "ready") return <span className="text-[9px] px-1 py-0.5 rounded text-green-400/80 bg-green-500/10">ready</span>;
  if (status === "completed") return <span className="text-[9px] px-1 py-0.5 rounded text-green-400/80 bg-green-500/10">analyzed</span>;
  if (status === "analyzing") return <span className="text-[9px] px-1 py-0.5 rounded text-amber-400/80 bg-amber-500/10">analyzing</span>;
  return <span className="text-[9px] px-1 py-0.5 rounded text-kumo-subtle bg-kumo-elevated/60">draft</span>;
}

export function FsdSidebar({ sessions, activeId, search, onSearchChange, onSelect, onScan, onCreate, onUpload, scanning }: FsdSidebarProps) {
  const filtered = sessions.filter((s) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (s.title ?? s.fsdInputPath ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-kumo-line shrink-0 space-y-1.5">
        <button onClick={onCreate}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-kumo-brand rounded hover:opacity-90 transition-opacity">
          <Plus size={12} />
          New FSD
        </button>
        <button onClick={onUpload}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded border border-kumo-line text-kumo-subtle hover:text-kumo-default transition-colors">
          <UploadSimple size={12} />
          Upload document
        </button>
        <div className="relative">
          <input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search FSDs…"
            className="w-full h-7 pl-6 pr-2 text-[11px] rounded border border-kumo-line bg-kumo-elevated/50 text-kumo-default placeholder:text-kumo-subtle outline-none focus:border-kumo-brand"
          />
          <MagnifyingGlass size={10} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-kumo-subtle pointer-events-none" />
        </div>
        <button onClick={onScan} disabled={scanning}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1 text-[11px] rounded border border-kumo-line text-kumo-subtle hover:text-kumo-default transition-colors disabled:opacity-50">
          <Scan size={11} className={scanning ? "animate-spin" : ""} />
          {scanning ? "Scanning…" : "Rescan files"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <div className="px-3 py-4 text-[11px] text-kumo-subtle text-center">No documents</div>
        )}
        {filtered.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 border-l-2 transition-colors ${
              activeId === s.id
                ? "border-kumo-brand bg-kumo-brand/15 text-kumo-default"
                : "border-transparent text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated/60"
            }`}
          >
            <FileText size={12} className="shrink-0 opacity-50" />
            <div className="flex-1 min-w-0">
              <div className="truncate">{s.title ?? s.fsdInputPath ?? "FSD"}</div>
              <div className="flex items-center gap-1 mt-0.5">
                {statusBadge(s.status)}
                {s.sourceType && s.sourceType !== "manual" && (
                  <span className="text-[9px] text-kumo-subtle">{s.sourceType}</span>
                )}
                <span className="flex items-center gap-0.5 text-[9px] text-kumo-subtle ml-auto">
                  <Clock size={8} />{timeAgo(s.createdAt)}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
