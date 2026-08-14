import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect, useMemo } from "react";
import { Badge } from "@cloudflare/kumo";
import { ListChecks, ListDashes, ArrowsClockwise, CalendarDots, SquaresFour, Rows } from "@phosphor-icons/react";
import { loadProjectRouteData } from "~/lib/project-queries";
import { usePageVisible } from "~/lib/use-file-data";
import { TaskList, type TaskViewMode } from "~/components/tasks/TaskList";
import { TaskDetail } from "~/components/tasks/TaskDetail";
import { TimelineViewer } from "~/components/tasks/TimelineViewer";
import type { Task } from "~/shared/types";
import { AppButton } from "~/components/ui/AppButton";
import { PageHeader } from "~/components/ui/PageHeader";
import { SearchInput } from "~/components/ui/SearchInput";

export const Route = createFileRoute("/projects/$id/tasks")({
  loader: async ({ params }) => {
    const { project, data } = await loadProjectRouteData(params.id);
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
  const [tasks, setTasks] = useState<Task[]>(loaderData?.tasks ?? []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ inserted: number; updated: number; removed: number; skipped: number } | null>(null);
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

  // Reconcile the tasks DB with the artifact files (output/task/*). Idempotent
  // upsert that preserves user-edited status/assignee, so it is safe to run
  // automatically. showResult controls whether the import badge is set (auto
  // syncs stay quiet; the manual button reports counts).
  const syncFromDisk = useCallback(async (showResult: boolean) => {
    setImporting(true);
    if (showResult) setImportResult(null);
    try {
      const res = await fetch(`/api/projects/${id}/tasks/import`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        if (showResult) setImportResult(result);
        const reloadRes = await fetch(`/api/projects/${id}/tasks`, { cache: "no-store" });
        if (reloadRes.ok) setTasks(await reloadRes.json());
      }
    } catch {}
    setImporting(false);
  }, [id]);

  // Auto-import on page open (like the SIT page) — no manual step needed.
  useEffect(() => { void syncFromDisk(false); }, [syncFromDisk]);

  // Live re-import via SSE file:changed (no polling — same pattern as the FSD
  // page). Filtered to output/task paths so unrelated project changes don't
  // trigger a pointless re-import. Debounced 400ms to coalesce bursts.
  const pageVisible = usePageVisible();
  useEffect(() => {
    if (!pageVisible) return;
    let es: EventSource | null = null;
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let errorCount = 0;
    const schedule = () => {
      if (!mounted) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (!mounted) return;
        void syncFromDisk(false);
      }, 400);
    };
    const init = async () => {
      try {
        const res = await fetch("/api/events/ticket", { method: "POST", cache: "no-store" });
        const d = await res.json();
        if (!mounted || !d.ticket) return;
        es = new EventSource(`/api/events?ticket=${d.ticket}`);
        es.addEventListener("file:changed", (e) => {
          try {
            const msg = JSON.parse((e as MessageEvent).data);
            const p: string = msg?.data?.path ?? "";
            if (!p.replace(/\\/g, "/").includes("output/task")) return;
            schedule();
          } catch {}
        });
        // Guard against infinite browser auto-reconnect loops: close the
        // stream after a few errors instead of leaking reconnect requests.
        es.onerror = () => {
          errorCount += 1;
          if (errorCount > 5) { es?.close(); es = null; }
        };
      } catch {}
    };
    void init();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [pageVisible, syncFromDisk]);

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        icon={<ListChecks size={14} className="text-kumo-brand" />}
        title="Tasks"
        help="tasks"
        badges={
          <>
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
                {importResult.skipped > 0 && ` · ${importResult.skipped} file kosong`}
              </Badge>
            )}
          </>
        }
        actions={
          <>
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
              onClick={() => void syncFromDisk(true)}
              disabled={importing}
              variant="primary"
              size="sm"
              icon={<ArrowsClockwise size={12} className={importing ? "animate-spin" : ""} />}
              className="rounded-full px-3"
            >
              {importing ? "Importing..." : "Import from artifacts"}
            </AppButton>
          </>
        }
        below={
          view === "tasks" && (
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
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Search code, title, assignee, content…"
                className="w-72"
              />
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
          )
        }
      />

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
