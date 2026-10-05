import { useEffect, useState } from "react";
import { Button, Dialog, DialogRoot, DialogTitle } from "@cloudflare/kumo";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { FolderBrowserDialog } from "./FolderBrowserDialog";
import { InlineAlert } from "~/components/ui/InlineAlert";
import { agentLogo } from "~/lib/agent-command";
import { isDesktopShell } from "~/lib/run-notification";
import { reportClientError } from "~/lib/use-client-error-report";

/** Trace a picker failure into the server log. "Load failed" in the panel is
 *  WebKit's wording and proves nothing; the server log holds the real chain
 *  (IPC error + HTTP error, timestamped) — see /api/system/client-error. */
function tracePickerFailure(stage: string, e: unknown): void {
  const err = e instanceof Error ? e : new Error(String(e));
  reportClientError(`folder-picker/${stage}`, err.message, err.stack);
}

/** Native picker through the Tauri shell. Retries once — reopening the sheet
 *  is cheap and the first failure may be transient. Throws on final failure;
 *  the caller then drops to the web FolderBrowserDialog, NEVER to the
 *  osascript route: osascript steals window activation, which suspends the
 *  web-content process and kills every in-flight WebView fetch ("Load failed"). */
async function pickFolderNative(): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    return await invoke<string | null>("pick_folder");
  } catch (first) {
    console.error("[pick_folder] invoke failed, retrying once:", first);
    tracePickerFailure("invoke-1", first);
  }
  try {
    return await invoke<string | null>("pick_folder");
  } catch (second) {
    console.error("[pick_folder] invoke failed after retry:", second);
    tracePickerFailure("invoke-2", second);
    throw second;
  }
}

/** HTTP picker (osascript/zenity/powershell) — the web build only; on desktop
 *  the native command above owns this path. */
async function pickFolderHttp(): Promise<string | null> {
  // Never wait forever: a hung powershell picker (or dead server) must
  // surface as an error instead of leaving the Open button disabled.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch("/api/helpers/choose-folder", {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
    });
    if (res.ok) {
      const data = await res.json();
      // Server distinguishes "cancelled" (path:null, no error) from
      // "picker failed" (error set) — surface failures, not cancels.
      if (data.error) throw new Error(data.error);
      return data.path ?? null;
    }
    return null;
  } catch (e) {
    console.error("[pick_folder] web API failed:", e);
    tracePickerFailure("http", e);
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error("Folder picker timed out (120s). Coba lagi, atau ketik path folder langsung di kolom Project Folder.");
    }
    throw new Error(`Folder picker failed: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
}

interface AgentInfo {
  name: string;
  command: string;
  found: boolean;
  version: string | null;
  path: string | null;
}

interface OpenProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after the project row is created; the caller starts skill setup. */
  onCreated: (projectId: string) => void;
}

export function OpenProjectDialog({ open, onOpenChange, onCreated }: OpenProjectDialogProps) {
  const [folderPath, setFolderPath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [defaultAgent, setDefaultAgent] = useState("opencode");
  const [agentsList, setAgentsList] = useState<AgentInfo[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");
  const [dirOpen, setDirOpen] = useState(false);

  // Refresh the agent list whenever the dialog opens, so the CLI availability
  // shown is always current (mount-time fetch may have run before the sidecar
  // was ready → stale "not installed" entries).
  useEffect(() => {
    if (!open) return;
    setAgentsLoading(true);
    fetch("/api/agent/detect", { cache: "no-store" }).then((r) => r.json()).then((data) => {
      setAgentsList(data);
      setAgentsLoading(false);
    }).catch(() => setAgentsLoading(false));
  }, [open]);

  const applyPickedPath = (p: string) => {
    setFolderPath(p);
    if (!projectName) {
      const cleanPath = p.replace(/[/\\]$/, "");
      const parts = cleanPath.split(/[/\\]/);
      setProjectName(parts[parts.length - 1] || "Project");
    }
  };

  const handleBrowse = async () => {
    setBrowsing(true);
    setError("");
    try {
      if (isDesktopShell()) {
        try {
          const path = await pickFolderNative();
          if (path) applyPickedPath(path);
        } catch {
          // The IPC/native layer is dead. The web FolderBrowserDialog talks
          // straight to the sidecar over HTTP (/api/helpers/list-dirs) and
          // owns no native activation, so it cannot re-trigger the failure.
          setDirOpen(true);
        }
        return;
      }
      const path = await pickFolderHttp();
      if (path) applyPickedPath(path);
    } catch (e: any) {
      setError(e?.message || "Failed to open folder picker");
    } finally {
      setBrowsing(false);
    }
  };

  // Web folder browser — primary on Windows (PowerShell/COM dialogs are
  // slow/unreliable); macOS/Linux keep the native picker (untouched).
  const openFolderBrowser = async () => {
    setError("");
    try {
      const res = await fetch("/api/helpers/platform", { cache: "no-store" });
      const { platform } = await res.json();
      if (platform === "win32") { setDirOpen(true); return; }
    } catch {
      // platform unknown: fall through to the same picker handleBrowse picks.
    }
    void handleBrowse();
  };

  const handleOpenFolder = async () => {
    const path = folderPath.trim();
    if (!path) return;
    setOpening(true);
    setError("");
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootPath: path, name: projectName.trim(), defaultAgent }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed to open folder"); setOpening(false); return; }
      setOpening(false);
      onCreated(data.id);
    } catch {
      setError("Failed to connect");
      setOpening(false);
    }
  };

  return (
    <>
      <DialogRoot open={open} onOpenChange={onOpenChange}>
        <Dialog>
          <div className="p-5">
            <DialogTitle>Open Project</DialogTitle>
            <div className="space-y-4 mt-4">
              <div>
                <label className="block text-xs text-kumo-subtle mb-1.5">Project Folder</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={folderPath}
                    onChange={(e) => setFolderPath(e.target.value)}
                    placeholder="No folder selected — atau ketik path manual"
                    title="Paste path folder project jika picker bermasalah"
                    className="flex items-center text-xs text-kumo-default px-3 py-2 flex-1 border border-kumo-line rounded bg-kumo-elevated/30 focus:border-kumo-brand focus:outline-none"
                  />
                  <button
                    onClick={openFolderBrowser}
                    disabled={browsing}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs rounded bg-kumo-elevated border border-kumo-line text-kumo-default hover:bg-kumo-elevated/80 transition-colors disabled:opacity-50 shrink-0"
                  >
                    <MagnifyingGlass size={12} />
                    {browsing ? "Browsing..." : "Browse"}
                  </button>
                </div>
                <button
                  onClick={handleBrowse}
                  className="mt-1 text-[10px] text-kumo-subtle underline hover:text-kumo-default"
                  title="Pakai dialog sistem (PowerShell) sebagai cadangan"
                >
                  pakai dialog sistem
                </button>
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
                  {agentsList.length === 0 ? (
                    <div className="col-span-2 text-[11px] text-kumo-subtle italic py-2">
                      {agentsLoading ? "Checking installed agents…" : "No agents detected"}
                    </div>
                  ) : (
                    agentsList.map((a) => {
                      const logo = agentLogo(a.command);
                      return (
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
                                : "border-kumo-line bg-kumo-recessed opacity-50 cursor-not-allowed"
                          }`}
                        >
                          {logo ? (
                            <img
                              src={logo}
                              alt={a.name}
                              className={`w-6 h-6 rounded-md object-contain shrink-0 ${a.found ? "" : "grayscale opacity-50"}`}
                            />
                          ) : (
                            <div className={`w-2 h-2 rounded-full shrink-0 ${a.found ? "bg-green-400" : "bg-red-400/50"}`} />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className={`text-xs font-medium ${defaultAgent === a.command ? "text-kumo-brand" : a.found ? "text-kumo-default" : "text-kumo-subtle"} truncate`}>{a.name}</div>
                            <div className="text-[9px] text-kumo-subtle truncate">{a.found ? a.version || "Found" : "Not installed"}</div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
                <p className="text-[10px] text-kumo-subtle mt-2">This agent will be used by default when you open the terminal in this project.</p>
              </div>

              {error && <InlineAlert kind="error">{error}</InlineAlert>}

              <div className="flex justify-end gap-2 pt-4 mt-2">
                <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
                <Button variant="primary" size="sm" onClick={handleOpenFolder} disabled={opening || !folderPath.trim()}>
                  {opening ? "Opening..." : "Open Project"}
                </Button>
              </div>
            </div>
          </div>
        </Dialog>
      </DialogRoot>

      <FolderBrowserDialog
        open={dirOpen}
        onOpenChange={setDirOpen}
        onSelect={(p) => { applyPickedPath(p); setDirOpen(false); }}
      />
    </>
  );
}
