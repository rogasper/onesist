import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { Button, Badge } from "@cloudflare/kumo";
import { Folder, Cube, Plus, Trash } from "@phosphor-icons/react";
import { CardGridSkeleton } from "~/components/ui/Skeleton";
import { EmptyState } from "~/components/ui/EmptyState";
import { ConfirmDialog } from "~/components/ui/ConfirmDialog";
import { OpenProjectDialog } from "~/components/dashboard/OpenProjectDialog";
import { SkillSetupDialog } from "~/components/dashboard/SkillSetupDialog";
import { PageHelpButton } from "~/components/ui/PageHelpButton";
import { useSkillInstall } from "~/lib/use-skill-install";

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-kumo-default">Projects</h1>
          {projects.length > 0 && <Badge variant="neutral" className="text-xs px-2 py-0.5">{projects.length}</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <PageHelpButton help="dashboard" />
          <Button variant="primary" size="sm" onClick={() => setModalOpen(true)} className="flex items-center gap-1.5">
            <Plus size={14} />
            <span>Open Project</span>
          </Button>
        </div>
      </div>

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="glass-panel bg-kumo-subtle rounded-2xl px-5 py-4 group cursor-pointer hover:border-kumo-brand/50 hover:bg-white/5 transition-all"
              onClick={() => navigate({ to: "/projects/$id", params: { id: p.id } })}
            >
              <div className="flex items-center gap-3">
                <div className="rounded bg-kumo-elevated p-1.5 shrink-0"><Cube size={16} className="text-kumo-subtle" /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium truncate">{p.name}</h3>
                  {p.rootPath && <span className="text-[11px] text-kumo-subtle truncate">{p.rootPath}</span>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <Button
                    variant="ghost"
                    onClick={(e) => handleDeleteClick(e, p.id)}
                    className="p-1.5 text-kumo-subtle hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    title="Remove from dashboard"
                  >
                    <Trash size={14} />
                  </Button>
                  <Button variant="ghost" size="sm">Open</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
