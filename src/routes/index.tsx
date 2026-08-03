import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Button, Badge, DialogRoot, Dialog, DialogTitle, DialogDescription } from "@cloudflare/kumo";
import { Folder, Cube, MagnifyingGlass, Trash, Plus } from "@phosphor-icons/react";

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

interface AgentInfo {
  name: string;
  command: string;
  found: boolean;
  version: string | null;
  path: string | null;
}

function DashboardPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectData[]>([]);
  const [loading, setLoading] = useState(true);
  const [folderPath, setFolderPath] = useState("");
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  // Skill setup state
  const [setupState, setSetupState] = useState<{
    phase: "idle" | "creating" | "installing" | "ready" | "failed";
    skills: { name: string; status: string; error?: string | null }[] | null;
    error: string | null;
    projectId: string | null;
  }>({ phase: "idle", skills: null, error: null, projectId: null });
  const setupTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  
  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [defaultAgent, setDefaultAgent] = useState("opencode");
  const [agentsList, setAgentsList] = useState<AgentInfo[]>([]);

  // Delete modal state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

  const fetchProjects = () => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data: ProjectData[]) => { 
        if (Array.isArray(data)) {
          setProjects(data);
          window.dispatchEvent(new Event("projects-updated"));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { 
    fetchProjects(); 
    fetch("/api/agent/detect").then(r => r.json()).then(data => {
      setAgentsList(data);
    }).catch(() => {});
  }, []);

  const handleBrowse = async () => {
    setBrowsing(true);
    try {
      const res = await fetch("/api/helpers/choose-folder", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.path) {
          setFolderPath(data.path);
          if (!projectName) {
            const cleanPath = data.path.replace(/[/\\]$/, "");
            const parts = cleanPath.split(/[/\\]/);
            setProjectName(parts[parts.length - 1] || "Project");
          }
        }
      }
    } catch {}
    setBrowsing(false);
  };

  const handleOpenFolder = async () => {
    const path = folderPath.trim();
    if (!path) return;
    setOpening(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootPath: path, name: projectName.trim(), defaultAgent }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to open folder"); setOpening(false); return; }
      // Project created — start skill verification
      setSetupState({ phase: "installing", skills: null, error: null, projectId: data.id });
      try {
        const skillRes = await fetch(`/api/projects/${data.id}/skills`);
        if (skillRes.ok) {
          const skillData = await skillRes.json();
          const allReady = skillData.skills?.every((s: any) => s.status === "installed");
          if (allReady) {
            finishProjectOpen(data.id);
            return;
          }
        }
        // Install missing skills
        await fetch(`/api/projects/${data.id}/skills/install`, { method: "POST" });
        if (setupTimer.current) clearInterval(setupTimer.current);
        setupTimer.current = setInterval(async () => {
          const r = await fetch(`/api/projects/${data.id}/skills`);
          if (!r.ok) return;
          const d = await r.json();
          setSetupState((prev) => ({ ...prev, skills: d.skills ?? null, error: null }));
          if (d.status === "ready") {
            if (setupTimer.current) { clearInterval(setupTimer.current); setupTimer.current = null; }
            finishProjectOpen(data.id);
          } else if (d.status === "failed") {
            if (setupTimer.current) { clearInterval(setupTimer.current); setupTimer.current = null; }
            setSetupState({ phase: "failed", skills: d.skills ?? null, error: "Skill installation failed", projectId: data.id });
            setOpening(false);
          }
        }, 1500);
      } catch {
        setSetupState({ phase: "failed", skills: null, error: "Failed to check/install project skills", projectId: data.id });
        setOpening(false);
      }
    } catch {
      setError("Failed to connect");
    }
    setOpening(false);
  };

  const finishProjectOpen = (projectId: string) => {
    setSetupState({ phase: "ready", skills: null, error: null, projectId });
    setFolderPath("");
    setProjectName("");
    setModalOpen(false);
    fetchProjects();
    navigate({ to: "/projects/$id", params: { id: projectId } });
  };

  const retrySkillInstall = async () => {
    const pid = setupState.projectId;
    if (!pid) return;
    setSetupState((prev) => ({ ...prev, phase: "installing", error: null }));
    await fetch(`/api/projects/${pid}/skills/install`, { method: "POST" });
    if (setupTimer.current) clearInterval(setupTimer.current);
    setupTimer.current = setInterval(async () => {
      const r = await fetch(`/api/projects/${pid}/skills`);
      if (!r.ok) return;
      const d = await r.json();
      if (d.status === "ready") {
        if (setupTimer.current) { clearInterval(setupTimer.current); setupTimer.current = null; }
        finishProjectOpen(pid);
      } else if (d.status === "failed") {
        if (setupTimer.current) { clearInterval(setupTimer.current); setupTimer.current = null; }
        setSetupState({ phase: "failed", skills: d.skills ?? null, error: "Skill installation failed", projectId: pid });
      }
    }, 1500);
  };

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
          <h1 className="text-lg text-kumo-default">Projects</h1>
          {projects.length > 0 && <Badge variant="neutral" className="text-xs px-2 py-0.5">{projects.length}</Badge>}
        </div>
        <Button variant="primary" size="sm" onClick={() => setModalOpen(true)} className="flex items-center gap-1.5">
          <Plus size={14} />
          <span>Open Project</span>
        </Button>
      </div>

      <DialogRoot open={modalOpen} onOpenChange={setModalOpen}>
        <Dialog>
          <div className="p-5">
            <DialogTitle>Open Project</DialogTitle>
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-xs text-kumo-subtle mb-1.5">Project Folder</label>
                <div className="flex gap-2">
                  <span className="flex items-center text-xs text-kumo-default px-3 py-2 flex-1 border border-kumo-line rounded bg-kumo-elevated/30 truncate">
                    {folderPath || "No folder selected"}
                  </span>
                  <button
                    onClick={handleBrowse}
                    disabled={browsing}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs rounded bg-kumo-elevated border border-kumo-line text-kumo-default hover:bg-kumo-elevated/80 transition-colors disabled:opacity-50 shrink-0"
                  >
                    <MagnifyingGlass size={12} />
                    {browsing ? "Browsing..." : "Browse"}
                  </button>
                </div>
              </div>
              
              <div>
                <label className="block text-xs text-kumo-subtle mb-1.5">Project Name</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. My Awesome App"
                  className="w-full bg-kumo-elevated/30 border border-kumo-line rounded px-3 py-2 text-sm text-kumo-default focus:border-kumo-brand focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-kumo-subtle mb-1.5">Default Agent CLI</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {agentsList.map(a => (
                    <button
                      key={a.name}
                      type="button"
                      onClick={() => a.found && setDefaultAgent(a.command)}

                      disabled={!a.found}
                      className={`flex items-center gap-2 p-2.5 rounded border text-left transition-colors ${
                        defaultAgent === a.command
                          ? "border-kumo-brand bg-kumo-brand/10"
                          : a.found
                            ? "border-kumo-line bg-kumo-elevated/30 hover:bg-kumo-elevated/60 cursor-pointer"
                            : "border-[#2a2a2a] bg-[#1a1a1a] opacity-50 cursor-not-allowed"
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${a.found ? "bg-green-400" : "bg-red-400/50"}`} />
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs font-medium ${defaultAgent === a.name ? "text-kumo-brand" : a.found ? "text-kumo-default" : "text-kumo-subtle"} truncate`}>{a.name}</div>
                        <div className="text-[9px] text-kumo-subtle truncate">{a.found ? a.version || "Found" : "Not installed"}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-kumo-subtle mt-2">This agent will be used by default when you open the terminal in this project.</p>
              </div>

              {error && <div className="text-xs text-red-400 p-2 bg-red-400/10 rounded">{error}</div>}

              <div className="flex justify-end gap-2 pt-4 mt-2">
                <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={handleOpenFolder} disabled={opening || !folderPath.trim()}>
                  {opening ? "Opening..." : "Open Project"}
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      </DialogRoot>

      {/* Skill setup dialog */}
      <DialogRoot open={setupState.phase !== "idle"} onOpenChange={(open) => {
        if (!open && setupState.phase !== "installing") setSetupState((p) => ({ ...p, phase: "idle" }));
      }}>
        <Dialog>
          <div className="p-5 w-96 max-w-full">
            <DialogTitle>Project skill setup</DialogTitle>
            <DialogDescription className="mt-1">
              The project requires the <b>fsd-analyzer</b> and <b>markitdown</b> skills to be installed into{" "}
              <code className="text-[10px]">.agents/skills/</code> before AI analysis can run.
            </DialogDescription>
            <div className="mt-4 space-y-2">
              {setupState.skills?.length ? setupState.skills.map((s) => (
                <div key={s.name} className="flex items-center gap-2 text-xs">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    s.status === "installed" ? "bg-green-400"
                    : s.status === "installing" ? "bg-amber-400 animate-pulse"
                    : s.status === "failed" ? "bg-red-400"
                    : "bg-kumo-subtle"
                  }`} />
                  <span className="text-kumo-default font-medium">{s.name}</span>
                  <span className="text-kumo-subtle ml-auto">{s.status}</span>
                </div>
              )) : (
                <div className="text-xs text-kumo-subtle flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  Checking / installing required skills…
                </div>
              )}
              {setupState.phase === "failed" && setupState.error && (
                <div className="text-[11px] text-red-400 p-2 bg-red-400/10 rounded whitespace-pre-wrap">{setupState.error}</div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              {setupState.phase === "failed" ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setSetupState((p) => ({ ...p, phase: "idle" }))}>Close</Button>
                  <Button variant="primary" size="sm" onClick={retrySkillInstall}>Retry install</Button>
                </>
              ) : (
                <Button variant="ghost" size="sm" disabled>Please wait…</Button>
              )}
            </div>
          </div>
        </Dialog>
      </DialogRoot>

      <DialogRoot open={deleteOpen} onOpenChange={setDeleteOpen}>        <Dialog>
          <div className="p-5">
            <DialogTitle>Remove Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove this project from the dashboard? Local files will not be deleted.
            </DialogDescription>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="destructive" size="sm" onClick={confirmDelete}>Remove</Button>
            </div>
          </div>
        </Dialog>
      </DialogRoot>

      {loading ? (
        <div className="text-kumo-subtle text-sm">Loading...</div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-kumo-subtle">
          <Folder size={32} className="opacity-30" />
          <span className="text-sm">No projects yet</span>
          <span className="text-xs text-kumo-subtle">Click "Browse" and select a project folder</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="glass-panel rounded-2xl px-5 py-4 group cursor-pointer hover:border-kumo-brand/50 hover:bg-white/5 transition-all"
              onClick={() => navigate({ to: "/projects/$id", params: { id: p.id } })}
            >
              <div className="flex items-center gap-3">
                <div className="rounded bg-kumo-elevated p-1.5 shrink-0"><Cube size={16} className="text-kumo-subtle" /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-medium truncate">{p.name}</h3>
                  {p.rootPath && <span className="text-[11px] text-kumo-subtle truncate">{p.rootPath}</span>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button 
                    onClick={(e) => handleDeleteClick(e, p.id)} 
                    className="p-1.5 text-kumo-subtle hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                    title="Remove from dashboard"
                  >
                    <Trash size={14} />
                  </button>
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
