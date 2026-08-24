import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Button, Badge } from "@cloudflare/kumo";
import { Folder, Cube, Plus, Trash, WindowsLogo, CalendarBlank, Buildings } from "@phosphor-icons/react";
import { CardGridSkeleton } from "~/components/ui/Skeleton";
import { EmptyState } from "~/components/ui/EmptyState";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { OpenProjectDialog } from "~/components/dashboard/OpenProjectDialog";
import { SkillSetupDialog } from "~/components/dashboard/SkillSetupDialog";
import { PageHeader } from "~/components/ui/PageHeader";
import { AppButton } from "~/components/ui/AppButton";
import { useSkillInstall } from "~/lib/use-skill-install";
import { openProjectWindow } from "~/lib/window";

export const Route = createFileRoute("/")({
  component: DashboardPage,
});

interface ProjectData {
  id: string;
  name: string;
  rootPath: string | null;
  company: string | null;
  description: string | null;
  createdAt: string | null;
}

function DashboardPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);
  const skill = useSkillInstall();

  const fetchProjects = useCallback(() => {
    fetch("/api/projects", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: ProjectData[]) => {
        if (Array.isArray(data)) {
          setProjects(data);
          window.dispatchEvent(new Event("projects-updated"));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const finishProjectOpen = useCallback((projectId: string) => {
    skill.reset();
    setModalOpen(false);
    fetchProjects();
    navigate({ to: "/projects/$id", params: { id: projectId } });
  }, [skill.reset, fetchProjects, navigate]);

  // Navigate to the project once skill setup completes.
  useEffect(() => {
    if (skill.state.status === "ready" && skill.state.projectId) {
      finishProjectOpen(skill.state.projectId);
    }
  }, [skill.state.status, skill.state.projectId, finishProjectOpen]);

  const handleCreated = useCallback(async (projectId: string) => {
    // Skip install if the project's skills are already in place.
    try {
      const res = await fetch(`/api/projects/${projectId}/skills`, { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        if (d.skills?.every((s: any) => s.status === "installed")) {
          finishProjectOpen(projectId);
          return;
        }
      }
    } catch {}
    skill.start(projectId);
  }, [finishProjectOpen, skill.start]);

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setProjectToDelete(id);
    setDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;
    try {
      await fetch(`/api/projects/${projectToDelete}`, { method: "DELETE" });
      fetchProjects();
    } catch {}
    setDeleteOpen(false);
    setProjectToDelete(null);
  };

  const handleOpenNewWindow = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    void openProjectWindow(`/projects/${id}`);
  };

  const PER_PAGE = 12;
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(projects.length / PER_PAGE));
  const paginated = useMemo(() => {
    const start = (page - 1) * PER_PAGE;
    return projects.slice(start, start + PER_PAGE);
  }, [projects, page]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [totalPages, page]);

  return (
    <div>
      <PageHeader
        icon={<Folder size={14} className="text-kumo-brand" />}
        title="Projects"
        help="dashboard"
        badges={projects.length > 0 ? <Badge variant="neutral" className="text-xs px-2 py-0.5">{projects.length}</Badge> : undefined}
        actions={
          <AppButton variant="primary" size="sm" onClick={() => setModalOpen(true)} icon={<Plus size={14} />}>
            Open Project
          </AppButton>
        }
        className="mb-6 shrink-0 space-y-2"
      />

      <OpenProjectDialog open={modalOpen} onOpenChange={setModalOpen} onCreated={handleCreated} />

      <SkillSetupDialog
        state={skill.state}
        onClose={() => skill.reset()}
        onRetry={() => skill.state.projectId && skill.start(skill.state.projectId)}
      />

      <ConfirmDialog
        open={deleteOpen}
        title="Remove Project"
        confirmLabel="Remove"
        onOpenChange={setDeleteOpen}
        onConfirm={confirmDelete}
      >
        Are you sure you want to remove this project from the dashboard? Local files will not be deleted.
      </ConfirmDialog>

      {loading ? (
        <CardGridSkeleton count={6} />
      ) : projects.length === 0 ? (
        <EmptyState
          icon={<Folder size={32} />}
          title="No projects yet"
          description={'Click "Browse" and select a project folder to get started.'}
          className="py-16"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginated.map((p) => (
              <div
                key={p.id}
                className="glass-panel bg-kumo-subtle rounded-2xl flex flex-col h-[260px] p-4 group cursor-pointer hover:border-kumo-brand/50 hover:bg-white/[0.04] transition-all border border-kumo-line/40"
                onClick={(e) => {
                  if (e.ctrlKey || e.metaKey || (e as any).button === 1) {
                    e.preventDefault();
                    void openProjectWindow(`/projects/${p.id}`);
                  } else {
                    navigate({ to: "/projects/$id", params: { id: p.id } });
                  }
                }}
                onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); void openProjectWindow(`/projects/${p.id}`); } }}
                onContextMenu={(e) => { e.preventDefault(); void openProjectWindow(`/projects/${p.id}`); }}
                title="Click to open — Ctrl/Cmd+Click or right-click for new window"
              >
                {/* Header */}
                <div className="flex items-start gap-3 shrink-0">
                  <div className="rounded-lg bg-kumo-elevated p-2 shrink-0 border border-kumo-line/30"><Cube size={18} className="text-kumo-brand" /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold truncate text-kumo-default">{p.name}</h3>
                    {p.company && <div className="flex items-center gap-1 text-[11px] text-kumo-subtle truncate"><Buildings size={11} />{p.company}</div>}
                  </div>
                  <Badge variant="neutral" className="text-[10px] shrink-0 hidden group-hover:inline-flex">Open</Badge>
                </div>
                {/* Meta */}
                <div className="mt-3 space-y-1 shrink-0">
                  {p.rootPath && <div className="text-[11px] font-mono text-kumo-subtle truncate bg-kumo-elevated/40 px-2 py-1 rounded border border-kumo-line/20" title={p.rootPath}>{p.rootPath}</div>}
                  {p.description && <p className="text-xs text-kumo-subtle line-clamp-2 leading-relaxed">{p.description}</p>}
                  {!p.description && <p className="text-xs text-kumo-subtle/60 italic line-clamp-2">Tidak ada deskripsi — klik Open untuk kelola FSD, Spec, Task.</p>}
                </div>
                {/* Stats strip */}
                <div className="mt-3 flex items-center gap-2 text-[10px] font-mono text-kumo-subtle">
                  {p.createdAt && <span className="flex items-center gap-1"><CalendarBlank size={11} />{new Date(p.createdAt).toLocaleDateString("id-ID")}</span>}
                  <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-kumo-elevated border border-kumo-line/30">ID {p.id.slice(0, 6)}</span>
                </div>
                {/* Preview placeholder */}
                <div className="mt-3 flex-1 rounded-lg border border-dashed border-kumo-line/30 bg-kumo-elevated/20 p-3 flex items-center justify-center">
                  <span className="text-[11px] text-kumo-subtle text-center">FSD • Spec • Task — kelola di project</span>
                </div>
                {/* Footer actions */}
                <div className="mt-3 flex items-center gap-1.5 shrink-0">
                  <AppButton variant="primary" size="sm" className="flex-1" onClick={(e) => { e.stopPropagation(); navigate({ to: "/projects/$id", params: { id: p.id } }); }}>Open</AppButton>
                  <AppButton
                    variant="secondary"
                    size="sm"
                    icon={<WindowsLogo size={13} />}
                    onClick={(e) => handleOpenNewWindow(e, p.id)}
                    title="Open in new window (Dashboard → project)"
                    className="shrink-0"
                  >
                    New Window
                  </AppButton>
                  <Button
                    variant="ghost"
                    onClick={(e) => handleDeleteClick(e, p.id)}
                    className="p-2 text-kumo-subtle hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                    title="Remove from dashboard"
                  >
                    <Trash size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          {/* Pagination 12/page */}
          {projects.length > 12 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-kumo-line/30">
              <span className="text-xs text-kumo-subtle font-mono">{(page - 1) * 12 + 1}–{Math.min(page * 12, projects.length)} of {projects.length}</span>
              <div className="flex items-center gap-2">
                <AppButton variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</AppButton>
                <span className="text-xs font-mono px-2">{page} / {totalPages}</span>
                <AppButton variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</AppButton>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
