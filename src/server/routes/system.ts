import fs from "node:fs";
import path from "node:path";
import { json } from "../http/response";
import { Router } from "../http/router";
import { getProject, runCommand } from "../http/route-utils";

export const router = new Router();

// /api/health
router.all("health", () => json({ status: "ok" }));

// /api/helpers/platform — OS platform so the frontend can pick the right
// folder-picker flow (web folder browser on Windows, native elsewhere).
router.get("helpers/platform", () => json({ platform: process.platform }));

// /api/helpers/list-dirs — list directories for the web folder picker.
// No native dialog involved: instant, no PowerShell, works everywhere.
// POST { path: "" } returns drive/mount roots; POST { path: "C:\\" } lists
// its subdirectories.
router.post("helpers/list-dirs", async ({ body }) => {
  const data = await body();
  const requested = String(data.path ?? "").trim();

  const rootCandidates = (): { name: string; path: string }[] => {
    const out: { name: string; path: string }[] = [];
    if (process.platform === "win32") {
      for (let i = 65; i <= 90; i++) {
        const letter = String.fromCharCode(i);
        try { if (fs.existsSync(`${letter}:\\`)) out.push({ name: `${letter}:\\`, path: `${letter}:\\` }); } catch {}
      }
      const home = process.env.USERPROFILE || process.env.SA_ROOT;
      if (home && fs.existsSync(home)) out.push({ name: `~ (${home.split("\\").pop()})`, path: home });
    } else {
      out.push({ name: "/", path: "/" });
      const home = process.env.HOME || process.env.SA_ROOT;
      if (home && fs.existsSync(home)) out.push({ name: `~ (${path.basename(home)})`, path: home });
    }
    return out;
  };

  if (!requested) {
    return json({ path: "", parent: null, roots: rootCandidates(), entries: [] });
  }

  let current = requested;
  try { current = path.normalize(current); } catch {}

  let entries: { name: string; path: string }[] = [];
  try {
    const items = fs.readdirSync(current, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith(".")) continue;
      try {
        if (item.isDirectory()) {
          entries.push({ name: item.name, path: path.join(current, item.name) });
        }
      } catch {}
    }
  } catch (e: any) {
    return json({ error: e?.message || String(e) }, 400);
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  if (entries.length > 500) entries = entries.slice(0, 500);
  const parent = path.dirname(current) === current ? null : path.dirname(current);
  return json({ path: current, parent, roots: [], entries });
});

// /api/helpers/choose-folder — open native OS folder picker.
// NOTE(later): extract the OS-specific picker commands into services/folder-picker.ts.
router.post("helpers/choose-folder", async () => {
  async function pickFolder(): Promise<string> {
    const platform = process.platform;
    if (platform === "darwin") {
      const r = await runCommand("osascript", ["-e", "tell me to activate", "-e", "POSIX path of (choose folder)"], 60000);
      return r.code === 0 ? r.out : "";
    }
    if (platform === "linux") {
      const zenity = await runCommand("zenity", ["--file-selection", "--directory", "--title=Select Project Folder"], 60000);
      if (zenity.code === 0 && zenity.out) return zenity.out;
      const kdialog = await runCommand("kdialog", ["--getexistingdirectory"], 60000);
      return kdialog.code === 0 ? kdialog.out : "";
    }
    if (platform === "win32") {
      // PowerShell is the only reliable picker on Windows 11 24H2+: cscript/
      // VBScript is deprecated there and WSH fails to run .vbs scripts.
      // Both variants below use a marker protocol (SEL:/CANCEL) so we can
      // distinguish "user cancelled" from "mechanism failed" — a failed
      // picker must fall through to the next mechanism, not be treated as
      // a silent cancel. [Environment]::Exit(0) forces powershell.exe to
      // terminate after the dialog (it otherwise stays alive forever).
      const psBase = ["-NoProfile", "-NonInteractive", "-STA", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command"];

      // 1) Shell COM BrowseForFolder — modern Vista-style dialog, no
      // WinForms/.NET dependency.
      const comCmd = [
        "$sh = New-Object -ComObject Shell.Application",
        "$f = $sh.BrowseForFolder(0, 'Select Project Folder', 1)",
        "if ($f -ne $null) { Write-Output ('SEL:' + $f.Self.Path) } else { Write-Output 'CANCEL' }",
        "[Environment]::Exit(0)",
      ].join("; ");
      console.log("[folder-picker] launching powershell COM dialog...");
      const com = await runCommand("powershell", [...psBase, comCmd], 60000);
      console.log(`[folder-picker] com exit=${com.code} out="${com.out.slice(0, 300)}"`);
      if (com.out.startsWith("SEL:")) return com.out.slice(4);
      if (com.out.trim() === "CANCEL") return ""; // user cancelled — stop here

      // 2) Fallback: WinForms FolderBrowserDialog (-STA required).
      const winformsCmd = [
        "Add-Type -AssemblyName System.Windows.Forms",
        "$d = New-Object System.Windows.Forms.FolderBrowserDialog",
        "$r = $d.ShowDialog()",
        "if ($r -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output ('SEL:' + $d.SelectedPath) } else { Write-Output 'CANCEL' }",
        "[Environment]::Exit(0)",
      ].join("; ");
      console.log("[folder-picker] com failed — trying WinForms fallback");
      const wf = await runCommand("powershell", [...psBase, winformsCmd], 60000);
      console.log(`[folder-picker] winforms exit=${wf.code} out="${wf.out.slice(0, 300)}"`);
      if (wf.out.startsWith("SEL:")) return wf.out.slice(4);
      if (wf.out.trim() === "CANCEL") return "";
      throw new Error(`Folder picker failed (win32): ${wf.out.trim() || `powershell exit ${wf.code}`}`);
    }
    return "";
  }
  let selectedPath = "";
  let pickerError: string | null = null;
  try {
    selectedPath = await pickFolder();
  } catch (e: any) {
    pickerError = e?.message || String(e);
    if (e?.exitCode !== 1) console.error("[folder-picker]", pickerError);
  }
  return json({ path: selectedPath || null, error: pickerError });
});

// /api/config/project-root
router.get("config/project-root", ({ params, query }) => {
  const projectId = query.get("projectId");
  if (projectId) {
    const proj = getProject(projectId);
    if (proj?.rootPath) return json({ root: proj.rootPath });
  }
  return json({ root: process.env.SA_ROOT ? path.resolve(process.env.SA_ROOT) : path.resolve(process.cwd(), "..") });
});

// /api/terminal/port
router.get("terminal/port", () => json({ port: parseInt(process.env.TERMINAL_PORT || "4323", 10) }));

// /api/agent/detect
router.get("agent/detect", async () => {
  const { detectAllAgents } = await import("~/lib/agent-cli");
  return json(detectAllAgents());
});

// /api/agent/run
router.post("agent/run", async ({ body }) => {
  const data = await body();
  const { runAgent, isAgentRunning } = await import("~/server/services/agent-runner");
  const sessionId = data.sessionId as string;
  if (isAgentRunning(sessionId)) {
    return json({ error: "Agent already running for this session" }, 409);
  }
  const mode = (data.mode as string) || "generate";
  const command = data.command as string;
  const agentName = data.agentName as string;
  const fsdFile = data.fsdFile as string;
  if (!command || !agentName || !sessionId) {
    return json({ error: "Missing required fields: command, agentName, sessionId" }, 400);
  }
  runAgent({ sessionId, command, mode: mode as "generate" | "gap" | "td" | "openapi", fsdFile, agentName }).catch(() => {});
  return json({ started: true, sessionId });
});

// /api/agent/stop
router.post("agent/stop", async ({ body }) => {
  const data = await body();
  const { stopAgent } = await import("~/server/services/agent-runner");
  const sessionId = data.sessionId as string | undefined;
  stopAgent(sessionId);
  return json({ stopped: true });
});

// /api/agent/status
router.get("agent/status", async () => {
  const { getRunningAgents } = await import("~/server/services/agent-runner");
  return json({ running: getRunningAgents() });
});
