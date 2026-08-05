import { useMemo, useState } from "react";
import type { Task } from "~/shared/types";

interface TaskBoardProps {
  tasks: Task[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: string) => Promise<void>;
}

const COLUMNS = [
  { key: "todo", label: "To Do", color: "border-t-blue-500/60" },
  { key: "in_progress", label: "In Progress", color: "border-t-amber-500/60" },
  { key: "done", label: "Done", color: "border-t-green-500/60" },
];

const MODULE_COLORS: Record<string, string> = {
  auth: "bg-blue-500/70", bonus: "bg-orange-500/70", tsl: "bg-purple-500/70",
  agent: "bg-cyan-500/70", sync: "bg-rose-500/70", email: "bg-teal-500/70",
  tracking: "bg-indigo-500/70", crm: "bg-pink-500/70", default: "bg-kumo-elevated",
};

function moduleBadge(mod: string | null) {
  if (!mod) return null;
  const key = Object.keys(MODULE_COLORS).find((k) => mod?.toLowerCase().includes(k)) ?? "default";
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium text-white leading-none ${MODULE_COLORS[key]}`}>
      {mod}
    </span>
  );
}

export function TaskBoard({ tasks, selectedId, onSelect, onStatusChange }: TaskBoardProps) {
  const [moving, setMoving] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const g: Record<string, Task[]> = { todo: [], in_progress: [], done: [] };
    for (const t of tasks) {
      const s = t.status || "todo";
      if (!g[s]) g[s] = [];
      g[s].push(t);
    }
    return g;
  }, [tasks]);

  const handleStatusClick = async (id: string, newStatus: string) => {
    setMoving(id);
    await onStatusChange(id, newStatus);
    setMoving(null);
  };

  return (
    <div className="flex-1 flex gap-3 overflow-x-auto min-h-0 p-3">
      {COLUMNS.map((col) => {
        const items = grouped[col.key] || [];
        return (
          <div key={col.key} className={`flex-1 flex flex-col rounded-lg border border-kumo-line border-t-2 ${col.color} min-w-0`}>
            <div className="flex items-center gap-2 px-3 py-2 border-b border-kumo-line shrink-0">
              <span className="text-xs font-medium text-kumo-default">{col.label}</span>
              <span className="text-[10px] text-kumo-subtle bg-kumo-elevated/60 px-1.5 py-0.5 rounded">{items.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {items.map((task) => {
                const code = task.title.split(":")[0]?.trim() ?? "";
                const displayTitle = task.title.includes(":")
                  ? task.title.slice(task.title.indexOf(":") + 1).trim()
                  : task.title;
                return (
                  <div
                    key={task.id}
                    onClick={() => onSelect(task.id)}
                    className={`rounded-lg border cursor-pointer transition-colors ${
                      selectedId === task.id
                        ? "liquid-wash border-transparent"
                        : "border-kumo-line bg-kumo-elevated hover:bg-kumo-elevated/80"
                    }`}
                  >
                    <div className="px-2.5 py-2">
                      {code && (
                        <div className="text-[9px] text-kumo-subtle font-mono mb-0.5">{code}</div>
                      )}
                      <div className="text-xs text-kumo-default leading-relaxed">{displayTitle}</div>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {moduleBadge(task.module)}
                        {task.storyPoints != null && (
                          <span className="text-[10px] text-kumo-subtle font-mono">{task.storyPoints}pt</span>
                        )}
                        {task.assignee && (
                          <span className="text-[10px] text-kumo-subtle truncate max-w-24">{task.assignee}</span>
                        )}
                      </div>
                      <div className="flex gap-1 mt-2">
                        {col.key !== "todo" && (
                          <button onClick={(e) => { e.stopPropagation(); handleStatusClick(task.id, "todo"); }}
                            className="text-[9px] text-blue-400/70 hover:text-blue-400 px-1 py-0.5 rounded border border-kumo-line/50 transition-colors"
                            disabled={moving === task.id}>◀ Todo</button>
                        )}
                        {col.key === "todo" && (
                          <button onClick={(e) => { e.stopPropagation(); handleStatusClick(task.id, "in_progress"); }}
                            className="text-[9px] text-amber-400/70 hover:text-amber-400 px-1 py-0.5 rounded border border-kumo-line/50 transition-colors"
                            disabled={moving === task.id}>In Progress ▶</button>
                        )}
                        {col.key === "in_progress" && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); handleStatusClick(task.id, "todo"); }}
                              className="text-[9px] text-blue-400/70 hover:text-blue-400 px-1 py-0.5 rounded border border-kumo-line/50 transition-colors"
                              disabled={moving === task.id}>◀ Todo</button>
                            <button onClick={(e) => { e.stopPropagation(); handleStatusClick(task.id, "done"); }}
                              className="text-[9px] text-green-400/70 hover:text-green-400 px-1 py-0.5 rounded border border-kumo-line/50 transition-colors"
                              disabled={moving === task.id}>Done ▶</button>
                          </>
                        )}
                        {col.key === "done" && (
                          <button onClick={(e) => { e.stopPropagation(); handleStatusClick(task.id, "in_progress"); }}
                            className="text-[9px] text-amber-400/70 hover:text-amber-400 px-1 py-0.5 rounded border border-kumo-line/50 transition-colors"
                            disabled={moving === task.id}>◀ In Progress</button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && (
                <div className="text-[11px] text-kumo-subtle text-center py-6 italic">No tasks</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
