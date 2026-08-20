import { CaretDown, CaretRight, Archive, CheckSquare, Square } from "@phosphor-icons/react";
import type { Task } from "~/shared/types";

export type TaskViewMode = "list" | "cards";

export interface TaskGroup {
  phase: string | null;
  tasks: Task[];
  isArchived?: boolean;
}

interface TaskListProps {
  groups: TaskGroup[];
  selectedId: string | null;
  viewMode: TaskViewMode;
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  collapsedGroups?: Record<string, boolean>;
  onSelect: (id: string) => void;
  onToggleSelect?: (id: string, e: React.MouseEvent) => void;
  onToggleGroup?: (groupKey: string) => void;
  onArchivePhase?: (phase: string | null, archive: boolean) => void;
  onSelectPhase?: (phase: string | null) => void;
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

export function TaskList({
  groups,
  selectedId,
  viewMode,
  selectionMode = false,
  selectedIds = new Set(),
  collapsedGroups = {},
  onSelect,
  onToggleSelect,
  onToggleGroup,
  onArchivePhase,
  onSelectPhase,
}: TaskListProps) {
  const totalTasks = groups.reduce((acc, g) => acc + g.tasks.length, 0);
  if (totalTasks === 0) return <EmptyState show />;

  const isAnySelected = selectedIds.size > 0 || selectionMode;

  return (
    <div className="flex-1 overflow-y-auto min-h-0 space-y-3 p-3">
      {groups.map((group) => {
        const groupKey = group.phase ?? "__no_phase__";
        const isCollapsed = Boolean(collapsedGroups[groupKey]);
        const groupTasks = group.tasks;
        const doneCount = groupTasks.filter((t) => t.status === "done").length;
        const totalPoints = groupTasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0);
        const allArchived = groupTasks.length > 0 && groupTasks.every((t) => t.archived);
        const allPhaseSelected =
          groupTasks.length > 0 && groupTasks.every((t) => selectedIds.has(t.id));

        return (
          <div
            key={groupKey}
            className={`rounded-xl border transition-colors ${
              allArchived
                ? "border-kumo-line/40 bg-kumo-elevated/20 opacity-80"
                : "border-kumo-line bg-kumo-elevated/30"
            }`}
          >
            {/* Group Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-kumo-line/50 bg-kumo-elevated/40 rounded-t-xl gap-2 select-none">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {isAnySelected && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectPhase?.(group.phase);
                    }}
                    className="text-kumo-subtle hover:text-kumo-brand shrink-0"
                    title={allPhaseSelected ? "Deselect phase" : "Select all tasks in this phase"}
                  >
                    {allPhaseSelected ? (
                      <CheckSquare size={14} className="text-kumo-brand" weight="fill" />
                    ) : (
                      <Square size={14} className="opacity-60 hover:opacity-100" />
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onToggleGroup?.(groupKey)}
                  className="flex items-center gap-2 text-left min-w-0 flex-1 hover:text-kumo-brand transition-colors"
                >
                  {isCollapsed ? (
                    <CaretRight size={13} className="text-kumo-subtle shrink-0" />
                  ) : (
                    <CaretDown size={13} className="text-kumo-subtle shrink-0" />
                  )}
                  <span className="text-xs font-semibold text-kumo-default truncate">
                    {group.phase || "No Phase"}
                  </span>
                  <span className="text-[10px] text-kumo-subtle font-mono shrink-0">
                    ({doneCount}/{groupTasks.length} done{totalPoints > 0 ? ` · ${totalPoints} SP` : ""})
                  </span>
                  {allArchived && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded border border-amber-500/30 text-amber-400/90 bg-amber-500/10 uppercase tracking-wide font-medium shrink-0">
                      Archived
                    </span>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {onArchivePhase && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onArchivePhase(group.phase, !allArchived);
                    }}
                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded border border-kumo-line/60 text-kumo-subtle hover:text-kumo-default hover:bg-kumo-elevated transition-colors"
                    title={allArchived ? "Unarchive all tasks in this phase" : "Archive all tasks in this phase"}
                  >
                    <Archive size={11} />
                    <span>{allArchived ? "Unarchive Phase" : "Archive Phase"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Group Content */}
            {!isCollapsed && (
              <div className="p-2">
                {viewMode === "cards" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    {groupTasks.map((task) => {
                      const { code, displayTitle, deps, excerpt } = splitTask(task);
                      const isSelected = selectedId === task.id;
                      const isChecked = selectedIds.has(task.id);

                      return (
                        <div
                          key={task.id}
                          onClick={(e) => {
                            if (isAnySelected) {
                              onToggleSelect?.(task.id, e);
                            } else {
                              onSelect(task.id);
                            }
                          }}
                          className={`group relative text-left rounded-lg border p-3 cursor-pointer transition-all ${
                            task.archived ? "opacity-60" : ""
                          } ${
                            isChecked
                              ? "border-kumo-brand/60 bg-kumo-brand/10 shadow-sm"
                              : isSelected
                                ? "liquid-wash border-transparent"
                                : "border-kumo-line bg-kumo-elevated hover:bg-kumo-elevated/80"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onToggleSelect?.(task.id, e);
                                }}
                                className="text-kumo-subtle hover:text-kumo-brand shrink-0"
                              >
                                {isChecked ? (
                                  <CheckSquare size={15} className="text-kumo-brand" weight="fill" />
                                ) : (
                                  <Square size={15} className={isAnySelected ? "opacity-70" : "opacity-30 group-hover:opacity-70"} />
                                )}
                              </button>
                              <span className={`font-mono text-[10px] ${isSelected ? "text-kumo-default" : "text-kumo-subtle"}`}>
                                {code}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {task.archived && (
                                <span className="text-[8px] px-1 py-0.2 rounded border border-amber-500/30 text-amber-400 bg-amber-500/10">
                                  Archived
                                </span>
                              )}
                              {statusBadge(task.status)}
                            </div>
                          </div>
                          <div className="text-xs text-kumo-default leading-relaxed mb-2 line-clamp-2">
                            {displayTitle}
                          </div>
                          {excerpt && (
                            <div className="text-[10px] text-kumo-subtle leading-relaxed mb-2 line-clamp-2">
                              {excerpt}
                            </div>
                          )}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-kumo-subtle truncate max-w-28">
                              {task.assignee || "Unassigned"}
                            </span>
                            {task.storyPoints != null && (
                              <span className="text-[10px] text-kumo-subtle font-mono">{task.storyPoints} SP</span>
                            )}
                            {deps.length > 0 && (
                              <span className="text-[9px] text-kumo-subtle font-mono" title={`Depends on: ${deps.join(", ")}`}>
                                ⛓ {deps.join(", ")}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="divide-y divide-kumo-line/40">
                    {groupTasks.map((task) => {
                      const { code, displayTitle, deps } = splitTask(task);
                      const isSelected = selectedId === task.id;
                      const isChecked = selectedIds.has(task.id);

                      return (
                        <div
                          key={task.id}
                          onClick={(e) => {
                            if (isAnySelected) {
                              onToggleSelect?.(task.id, e);
                            } else {
                              onSelect(task.id);
                            }
                          }}
                          className={`w-full group flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer rounded-md ${
                            task.archived ? "opacity-60" : ""
                          } ${
                            isChecked
                              ? "bg-kumo-brand/10 border-l-2 border-kumo-brand"
                              : isSelected
                                ? "liquid-wash"
                                : "hover:bg-kumo-elevated/60"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleSelect?.(task.id, e);
                            }}
                            className="text-kumo-subtle hover:text-kumo-brand shrink-0"
                          >
                            {isChecked ? (
                              <CheckSquare size={15} className="text-kumo-brand" weight="fill" />
                            ) : (
                              <Square size={15} className={isAnySelected ? "opacity-70" : "opacity-30 group-hover:opacity-70"} />
                            )}
                          </button>

                          <span className={`shrink-0 w-24 truncate font-mono text-[10px] ${isSelected ? "text-kumo-default" : "text-kumo-subtle"}`}>
                            {code}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-xs text-kumo-default truncate">{displayTitle}</span>
                            {task.sourcePath && (
                              <span className="block text-[9px] text-kumo-subtle mt-0.5 font-mono">
                                {task.sourcePath.replace(/^output\/task\//, "")}
                              </span>
                            )}
                          </span>
                          {task.archived && (
                            <span className="shrink-0 text-[8px] px-1 py-0.2 rounded border border-amber-500/30 text-amber-400 bg-amber-500/10">
                              Archived
                            </span>
                          )}
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
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
