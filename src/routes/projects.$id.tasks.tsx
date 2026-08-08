import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useCallback, useMemo } from "react";
import { Badge } from "@cloudflare/kumo";
import { ListChecks, ListDashes, ArrowsClockwise, MagnifyingGlass, X, CalendarDots, SquaresFour, Rows } from "@phosphor-icons/react";
import { loadAllData } from "~/lib/project-queries";
import { TaskList, type TaskViewMode } from "~/components/tasks/TaskList";
import { TaskDetail } from "~/components/tasks/TaskDetail";
import { TimelineViewer } from "~/components/tasks/TimelineViewer";
import type { Task } from "~/shared/types";
import { AppButton } from "~/components/ui/AppButton";

export const Route = createFileRoute("/projects/$id/tasks")({
  loader: async ({ params }) => {
    const data = await loadAllData();
    const project = ((data.projects as any[]) || []).find((p: any) => p.id === params.id) ?? null;
    const tasks = ((data.tasks as any[]) || []).filter((t: any) => t.projectId === params.id);
    return { project, tasks: tasks as Task[] };
  },
  component: TasksPage,
});

const STATUS_FILTERS = [
  { value: "all", label: "All status" },
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
];

function TasksPage() {
  const { id } = Route.useParams();
  const loaderData = Route.useLoaderData() as { project: any; tasks: Task[] };
  const project = loaderData?.project;
  const [tasks, setTasks] = useState<Task[]>(loaderData?.tasks ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; removed: number } | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [phaseFilter, setPhaseFilter] = useState("all");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [view, setView] = useState<"tasks" | "timeline">("tasks");
  const [viewMode, setViewMode] = useState<TaskViewMode>("list");
  const selectedTask = tasks.find((t) => t.id === selectedId) ?? null;

  const totalPoints = useMemo(
    () => tasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0),
    [tasks],
  );

  const developers = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (!t.assignee) continue;
      for (const name of t.assignee.split(/\s*\+\s*/)) set.add(name.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const phases = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) {
      if (t.phase) set.add(t.phase);
      else if (t.module) set.add(t.module);
    }
    return [...set].sort();
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (phaseFilter !== "all" && t.phase !== phaseFilter && t.module !== phaseFilter) return false;
      const assignees = t.assignee ? t.assignee.split(/\s*\+\s*/).map((a) => a.trim().toLowerCase()) : [];
      if (assigneeFilter !== "all" && !assignees.includes(assigneeFilter.toLowerCase())) return false;
      if (unassignedOnly && t.assignee) return false;
      if (!q) return true;
      const haystack = [
        t.code ?? "",
        t.title,
        t.description ?? "",
        t.assignee ?? "",
        t.module ?? "",
        t.phase ?? "",
        t.sourcePath ?? "",
      ].join("\n").toLowerCase();
      return haystack.includes(q);
    });
  }, [tasks, search, statusFilter, assigneeFilter, phaseFilter, unassignedOnly]);

  const assignedCount = tasks.filter((t) => t.assignee).length;
  const unassignedCount = tasks.length - assignedCount;

  const handleStatusChange = useCallback(async (taskId: string, status: string) => {
    const res = await fetch(`/api/projects/${id}/tasks/${taskId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    }
  }, [id]);

  const handleSave = useCallback(async (taskId: string, data: Partial<Task>) => {
    const res = await fetch(`/api/projects/${id}/tasks/${taskId}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    }
  }, [id]);

  const handleDelete = useCallback(async (taskId: string) => {
    const res = await fetch(`/api/projects/${id}/tasks/${taskId}`, { method: "DELETE" });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setSelectedId(null);
    }
  }, [id]);

  const handleImport = useCallback(async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch(`/api/projects/${id}/tasks/import`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setImportResult(result);
        const reloadRes = await fetch(`/api/projects/${id}/tasks`, { cache: "no-store" });
        if (reloadRes.ok) setTasks(await reloadRes.json());
      }
    } catch {}
    setImporting(false);
  }, [id]);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 70px)" }}>
      <div className="mb-3 shrink-0 space-y-2">
        <div className="text-xs text-kumo-subtle">
          <Link to="/projects/$id" params={{ id }} className="text-kumo-subtle hover:text-kumo-default no-underline">Projects</Link>
          <span className="mx-1.5 text-kumo-subtle">/</span>
          <span className="text-kumo-subtle">{project?.name ?? "..."}</span>
          <span className="mx-1.5 text-kumo-subtle">/</span>
          <span className="text-kumo-default font-medium">Tasks</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded bg-kumo-elevated p-1"><ListChecks size={14} className="text-kumo-brand" /></div>
          <h1 className="text-lg text-kumo-default">Tasks</h1>
          {tasks.length > 0 && (
            <>
              <Badge variant="neutral" className="text-[11px]">{tasks.length} tasks</Badge>
              <Badge variant="neutral" className="text-[11px]">{totalPoints} SP</Badge>
              <Badge variant="neutral" className="text-[11px]">{assignedCount} assigned</Badge>
              <Badge variant="neutral" className="text-[11px]">{unassignedCount} unassigned</Badge>
            </>
          )}
          {importResult && (
            <Badge variant="neutral" className="text-[11px]">
              +{importResult.inserted} new · {importResult.updated} updated · {importResult.removed} removed
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <AppButton
              onClick={() => setView(view === "tasks" ? "timeline" : "tasks")}
              variant="chip"
              size="sm"
              active={view === "timeline"}
              icon={<CalendarDots size={12} />}
              className="px-3"
              title="Toggle AI-generated timeline view"
            >
              {view === "timeline" ? "Tasks" : "Timeline"}
            </AppButton>
            <AppButton
              onClick={handleImport}
              disabled={importing}
              variant="primary"
              size="sm"
              icon={<ArrowsClockwise size={12} className={importing ? "animate-spin" : ""} />}
              className="rounded-full px-3"
            >
              {importing ? "Importing..." : "Import from artifacts"}
            </AppButton>
          </div>
        </div>

        {view === "tasks" && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center p-0.5 rounded-full border border-kumo-line/50 bg-kumo-elevated/40">
              <AppButton
                onClick={() => setViewMode("list")}
                variant="chip"
                size="xs"
                active={viewMode === "list"}
                icon={<ListDashes size={11} />}
                className="px-2.5"
                title="List view"
              >
                List
              </AppButton>
              <AppButton
                onClick={() => setViewMode("cards")}
                variant="chip"
                size="xs"
                active={viewMode === "cards"}
                icon={<SquaresFour size={11} />}
                className="px-2.5"
                title="Card view"
              >
                Cards
              </AppButton>
            </div>
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search code, title, assignee, content…"
                className="app-input w-72 h-7 pl-7 pr-6 text-xs text-kumo-default placeholder:text-kumo-subtle"
              />
              <MagnifyingGlass size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-kumo-subtle pointer-events-none" />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-kumo-subtle hover:text-kumo-default">
                  <X size={12} />
                </button>
              )}
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="h-7 text-xs rounded-full border border-kumo-line/50 bg-kumo-elevated/40 text-kumo-default outline-none focus:border-kumo-brand px-2.5">
              {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}
              className="h-7 text-xs rounded-full border border-kumo-line/50 bg-kumo-elevated/40 text-kumo-default outline-none focus:border-kumo-brand px-2.5">
              <option value="all">All developers</option>
              {developers.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select value={phaseFilter} onChange={(e) => setPhaseFilter(e.target.value)}
              className="h-7 text-xs rounded-full border border-kumo-line/50 bg-kumo-elevated/40 text-kumo-default outline-none focus:border-kumo-brand px-2.5">
              <option value="all">All phases</option>
              {phases.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <AppButton
              onClick={() => setUnassignedOnly((p) => !p)}
              variant="chip"
              size="sm"
              active={unassignedOnly}
              className="px-3"
            >
              Unassigned only
            </AppButton>
            <span className="text-[10px] text-kumo-subtle ml-auto">
              {filteredTasks.length}/{tasks.length} tasks
            </span>
          </div>
        )}
      </div>

      {view === "timeline" ? (
        <TimelineViewer projectId={id} />
      ) : (
        <div className="flex flex-1 min-h-0 glass-container overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">
            <TaskList tasks={filteredTasks} selectedId={selectedId} viewMode={viewMode} onSelect={setSelectedId} />
          </div>
          {selectedTask && (
            <TaskDetail
              task={selectedTask}
              developers={developers}
              onSave={handleSave}
              onDelete={handleDelete}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
