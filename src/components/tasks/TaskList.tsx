import type { Task } from "~/shared/types";

export type TaskViewMode = "list" | "cards";

interface TaskListProps {
  tasks: Task[];
  selectedId: string | null;
  viewMode: TaskViewMode;
  onSelect: (id: string) => void;
}

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  todo: { label: "To Do", color: "text-blue-400/80 bg-blue-500/10 border-blue-500/30" },
  in_progress: { label: "In Progress", color: "text-amber-400/80 bg-amber-500/10 border-amber-500/30" },
  done: { label: "Done", color: "text-green-400/80 bg-green-500/10 border-green-500/30" },
};

function statusBadge(status: string) {
  const opt = STATUS_STYLES[status] ?? STATUS_STYLES.todo;
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-medium border leading-none ${opt.color}`}>
      {opt.label}
    </span>
  );
}

function splitTask(task: Task) {
  const code = task.code ?? task.title.split(":")[0]?.trim() ?? "";
  const displayTitle = task.code
    ? task.title.replace(`${task.code}:`, "").trim()
    : task.title.includes(":")
      ? task.title.slice(task.title.indexOf(":") + 1).trim()
      : task.title;
  const deps: string[] = task.dependenciesJson ? (JSON.parse(task.dependenciesJson) as string[]) : [];
  const excerpt = (task.description ?? "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#*_`>\-|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
  return { code, displayTitle, deps, excerpt };
}

function EmptyState({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="flex items-center justify-center flex-1 text-kumo-subtle text-xs italic min-h-40">
      No tasks match the current filters
    </div>
  );
}

export function TaskList({ tasks, selectedId, viewMode, onSelect }: TaskListProps) {
  if (tasks.length === 0) return <EmptyState show />;

  if (viewMode === "cards") {
    return (
      <div className="flex-1 overflow-y-auto min-h-0 p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {tasks.map((task) => {
            const { code, displayTitle, deps, excerpt } = splitTask(task);
            const isSelected = selectedId === task.id;
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelect(task.id)}
                className={`text-left rounded-lg border p-3 transition-colors ${
                  isSelected
                    ? "border-kumo-brand bg-kumo-brand/15"
                    : "border-kumo-line bg-kumo-elevated/40 hover:bg-kumo-elevated/80"
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className={`font-mono text-[10px] ${isSelected ? "text-kumo-default" : "text-kumo-subtle"}`}>{code}</span>
                  {statusBadge(task.status)}
                </div>
                <div className="text-xs text-kumo-default leading-relaxed mb-2">{displayTitle}</div>
                {excerpt && <div className="text-[10px] text-kumo-subtle leading-relaxed mb-2 line-clamp-2">{excerpt}</div>}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-kumo-subtle truncate max-w-28">{task.assignee || "Unassigned"}</span>
                  {task.storyPoints != null && (
                    <span className="text-[10px] text-kumo-subtle font-mono">{task.storyPoints} SP</span>
                  )}
                  {deps.length > 0 && (
                    <span className="text-[9px] text-kumo-subtle font-mono" title={`Depends on: ${deps.join(", ")}`}>
                      ⛓ {deps.join(", ")}
                    </span>
                  )}
                  {task.phase && <span className="text-[9px] text-kumo-subtle bg-kumo-elevated/60 px-1 py-0.5 rounded">{task.phase}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {tasks.map((task) => {
        const { code, displayTitle, deps } = splitTask(task);
        const isSelected = selectedId === task.id;
        return (
          <button
            key={task.id}
            type="button"
            onClick={() => onSelect(task.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-left border-b border-kumo-line transition-colors ${
              isSelected ? "bg-kumo-brand/15" : "hover:bg-kumo-elevated/60"
            }`}
          >
            <span className={`shrink-0 w-24 truncate font-mono text-[10px] ${isSelected ? "text-kumo-default" : "text-kumo-subtle"}`}>
              {code}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-xs text-kumo-default truncate">{displayTitle}</span>
              {task.phase && (
                <span className="block text-[9px] text-kumo-subtle mt-0.5">{task.phase}{task.sourcePath ? ` · ${task.sourcePath.replace(/^output\/task\//, "")}` : ""}</span>
              )}
            </span>
            {deps.length > 0 && (
              <span className="shrink-0 text-[9px] text-kumo-subtle font-mono" title={`Depends on: ${deps.join(", ")}`}>
                ⛓ {deps.join(", ")}
              </span>
            )}
            <span className="shrink-0 w-20 truncate text-[10px] text-kumo-subtle text-right">{task.assignee || "—"}</span>
            <span className="shrink-0 w-14 text-right font-mono text-[10px] text-kumo-subtle">
              {task.storyPoints != null ? `${task.storyPoints} SP` : ""}
            </span>
            <span className="shrink-0 w-20 flex justify-end">{statusBadge(task.status)}</span>
          </button>
        );
      })}
    </div>
  );
}
