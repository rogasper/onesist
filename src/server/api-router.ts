import { db } from "~/server/db/client";
import { projects, changeLog, erds, apiSpecs, apiEndpoints, wikiPages, tasks, fsdSessions } from "~/server/db/schema";
import { eq, desc } from "drizzle-orm";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 12);
}

function runCommand(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "ignore"] });
      let out = "";
      proc.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
      proc.on("close", (code) => resolve(code === 0 ? out.trim() : ""));
      proc.on("error", () => resolve(""));
    } catch {
      resolve("");
    }
  });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      // WKWebView (Tauri desktop) heuristically caches responses without
      // explicit cache headers — stale agent/project data would persist across
      // app launches. API responses must always be fresh.
      "Cache-Control": "no-store",
    },
  });
}

function parseBody(request: Request): Promise<Record<string, unknown>> {
  return request.json().catch(() => ({}));
}

export async function handleApiRequest(request: Request): Promise<Response | null> {
  const reqUrl = new URL(request.url);
  if (!reqUrl.pathname.startsWith("/api/")) return null;

  const method = request.method;
  const segments = reqUrl.pathname.slice(5).split("/").filter(Boolean);
  const resource = segments[0];

  // /api/health
  if (resource === "health") {
    return json({ status: "ok" });
  }

  // /api/helpers/choose-folder — open native OS folder picker
  if (resource === "helpers" && segments[1] === "choose-folder" && method === "POST") {
    async function pickFolder(): Promise<string> {
      const os = process.platform;
      if (os === "darwin") {
        return runCommand("osascript", ["-e", "tell me to activate", "-e", "POSIX path of (choose folder)"]);
      }
      if (os === "linux") {
        const zenity = await runCommand("zenity", ["--file-selection", "--directory", "--title=Select Project Folder"]);
        if (zenity) return zenity;
        return runCommand("kdialog", ["--getexistingdirectory"]);
      }
      if (os === "win32") {
        return runCommand("powershell", ["-NoProfile", "-Command",
          `Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; if ($d.ShowDialog() -eq 'OK') { $d.SelectedPath } else { '' }`
        ]);
      }
      return "";
    }
    let selectedPath = "";
    try {
      selectedPath = await pickFolder();
    } catch (e: any) {
      if (e?.exitCode !== 1) console.error("[folder-picker]", e?.message || e);
    }
    return json({ path: selectedPath || null });
  }

  // /api/projects
  if (resource === "projects") {
    return handleProjects(segments.slice(1), method, request);
  }

  // /api/agent/detect
  if (resource === "agent" && segments[1] === "detect" && method === "GET") {
    const { detectAllAgents } = await import("~/lib/agent-cli");
    return json(detectAllAgents());
  }

  // /api/agent/run
  if (resource === "agent" && segments[1] === "run" && method === "POST") {
    const body = await parseBody(request);
    const { runAgent, isAgentRunning } = await import("~/server/agent-runner");
    const sessionId = body.sessionId as string;
    if (isAgentRunning(sessionId)) {
      return json({ error: "Agent already running for this session" }, 409);
    }
    const mode = (body.mode as string) || "generate";
    const command = body.command as string;
    const agentName = body.agentName as string;
    const fsdFile = body.fsdFile as string;
    if (!command || !agentName || !sessionId) {
      return json({ error: "Missing required fields: command, agentName, sessionId" }, 400);
    }
    runAgent({ sessionId, command, mode: mode as "generate" | "gap" | "td" | "openapi", fsdFile, agentName }).catch(() => {});
    return json({ started: true, sessionId });
  }

  // /api/agent/stop
  if (resource === "agent" && segments[1] === "stop" && method === "POST") {
    const body = await parseBody(request);
    const { stopAgent } = await import("~/server/agent-runner");
    const sessionId = body.sessionId as string | undefined;
    stopAgent(sessionId);
    return json({ stopped: true });
  }

  // /api/agent/status
  if (resource === "agent" && segments[1] === "status" && method === "GET") {
    const { getRunningAgents } = await import("~/server/agent-runner");
    return json({ running: getRunningAgents() });
  }

  // /api/terminal/port
  if (resource === "terminal" && segments[1] === "port" && method === "GET") {
    return json({ port: parseInt(process.env.TERMINAL_PORT || "4323", 10) });
  }

  // /api/config/* — configuration info
  if (resource === "config" && segments[1] === "project-root" && method === "GET") {
    const projectId = reqUrl.searchParams.get("projectId");
    if (projectId) {
      const proj = db.select().from(projects).where(eq(projects.id, projectId)).get() as any;
      if (proj?.rootPath) return json({ root: proj.rootPath });
    }
    return json({ root: (process.env.SA_ROOT ? path.resolve(process.env.SA_ROOT) : path.resolve(process.cwd(), "..")) });
  }

  // /api/events/ticket
  if (resource === "events" && segments[1] === "ticket" && method === "POST") {
    const { eventBus } = await import("~/server/events");
    return json({ ticket: eventBus.createTicket() });
  }

  // /api/events — SSE stream
  if (resource === "events" && !segments[1]) {
    const { eventBus } = await import("~/server/events");
    const ticket = reqUrl.searchParams.get("ticket");
    if (!ticket || !eventBus.validateTicket(ticket)) {
      return json({ error: "Invalid or expired ticket" }, 401);
    }
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        const handlers: Record<string, (...args: any[]) => void> = {};
        for (const event of ["file:changed", "agent:log", "agent:status", "agent:done", "agent:error", "task:status", "fsd:conversion"]) {
          const handler = (payload: any) => send(event, payload);
          eventBus.on(event, handler);
          handlers[event] = handler;
        }
        send("connected", { message: "SSE connected" });
        const keepAlive = setInterval(() => send("keepalive", { ts: Date.now() }), 15000);
        request.signal.addEventListener("abort", () => {
          for (const [event, handler] of Object.entries(handlers)) eventBus.off(event, handler);
          clearInterval(keepAlive);
        });
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
    });
  }

  // /api/files/* — read/write/list/delete files in the project
  if (resource === "files") {
    const fs = await import("node:fs");
    const defaultRoot = (process.env.SA_ROOT ? path.resolve(process.env.SA_ROOT) : path.resolve(process.cwd(), ".."));
    function resolveRoot(projectId?: string | null): string {
      if (projectId) {
        try {
          const proj = db.select().from(projects).where(eq(projects.id, projectId)).get();
          if (proj && (proj as any).rootPath) return (proj as any).rootPath;
        } catch {}
      }
      return defaultRoot;
    }

    const fileAction = segments[1];
    if (fileAction === "list" && method === "GET") {
      const { scanDirectory } = await import("~/lib/file-router");
      const subDir = reqUrl.searchParams.get("dir") || "output";
      const projectId = reqUrl.searchParams.get("projectId");
      return json(scanDirectory(resolveRoot(projectId), subDir));
    }
    if (fileAction === "read" && method === "GET") {
      const { readFile } = await import("~/lib/file-router");
      const filePath = reqUrl.searchParams.get("path");
      const projectId = reqUrl.searchParams.get("projectId");
      if (!filePath) return json({ error: "Missing path" }, 400);
      const content = readFile(resolveRoot(projectId), filePath);
      return content !== null ? json({ content }) : json({ error: "Not found" }, 404);
    }
    if (fileAction === "image" && method === "GET") {
      // Raw binary image serving so <img src> can render project files.
      const filePath = reqUrl.searchParams.get("path");
      const projectId = reqUrl.searchParams.get("projectId");
      if (!filePath || filePath.includes("..")) return json({ error: "Missing or invalid path" }, 400);
      const fullPath = path.join(resolveRoot(projectId), filePath);
      try {
        const buf = fs.readFileSync(fullPath);
        const ext = path.extname(filePath).slice(1).toLowerCase();
        const types: Record<string, string> = {
          png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
          webp: "image/webp", svg: "image/svg+xml", avif: "image/avif",
        };
        return new Response(new Uint8Array(buf), {
          headers: {
            "Content-Type": types[ext] || "application/octet-stream",
            "Cache-Control": "no-store",
          },
        });
      } catch {
        return json({ error: "Not found" }, 404);
      }
    }
    if (fileAction === "write" && method === "POST") {
      const body = await parseBody(request);
      const { writeFile } = await import("~/lib/file-router");
      const filePath = body.path as string;
      const projectId = body.projectId as string;
      const content = body.content as string;
      if (!filePath || content === undefined) return json({ error: "Missing path or content" }, 400);
      const ok = writeFile(resolveRoot(projectId), filePath, content);
      return json({ saved: ok, path: filePath });
    }
    if (fileAction === "delete" && method === "DELETE") {
      const { deleteFile } = await import("~/lib/file-router");
      const filePath = reqUrl.searchParams.get("path");
      const projectId = reqUrl.searchParams.get("projectId");
      if (!filePath) return json({ error: "Missing path" }, 400);
      return json({ deleted: deleteFile(resolveRoot(projectId), filePath) });
    }
    if (fileAction === "rename" && method === "POST") {
      const { renameFile } = await import("~/lib/file-router");
      const body = await parseBody(request);
      const filePath = body.path as string;
      const newName = body.newName as string;
      const projectId = body.projectId as string;
      if (!filePath || !newName) return json({ error: "Missing path or newName" }, 400);
      const renamed = renameFile(resolveRoot(projectId), filePath, newName);
      if (renamed && projectId) {
        // Keep FSD sessions pointing at the renamed markdown file (input/fsd/*).
        const newPath = filePath.slice(0, filePath.lastIndexOf("/") + 1) + newName;
        if (filePath.startsWith("input/fsd/")) {
          try {
            const projId = projectId;
            db.update(fsdSessions)
              .set({ markdownPath: newPath, fsdInputPath: newName, updatedAt: new Date().toISOString() })
              .where(eq(fsdSessions.projectId, projId))
              .where(eq(fsdSessions.markdownPath, filePath))
              .run();
          } catch {}
        }
      }
      return json({ renamed });
    }
    if (fileAction === "copy" && method === "POST") {
      const { copyFile } = await import("~/lib/file-router");
      const body = await parseBody(request);
      const source = body.source as string;
      const destination = body.destination as string;
      const projectId = body.projectId as string;
      if (!source || !destination) return json({ error: "Missing source or destination" }, 400);
      const result = copyFile(resolveRoot(projectId), source, destination);
      return result ? json({ copied: true, path: result }) : json({ error: "Copy failed" }, 404);
    }
    if (fileAction === "move" && method === "POST") {
      const { moveFile } = await import("~/lib/file-router");
      const body = await parseBody(request);
      const source = body.source as string;
      const destination = body.destination as string;
      const projectId = body.projectId as string;
      if (!source || !destination) return json({ error: "Missing source or destination" }, 400);
      const result = moveFile(resolveRoot(projectId), source, destination);
      return result ? json({ moved: true, path: result }) : json({ error: "Move failed" }, 404);
    }
    if (fileAction === "summary" && method === "GET") {
      const { getProjectSummary } = await import("~/lib/file-router");
      const projectId = reqUrl.searchParams.get("projectId");
      return json(getProjectSummary(resolveRoot(projectId)));
    }
    return json({ error: "Not found" }, 404);
  }

  return json({ error: "Not found" }, 404);
}

async function handleProjects(
  segments: string[],
  method: string,
  request: Request,
): Promise<Response> {
  const id = segments[0];
  const sub = segments[1];

  // /api/projects
  if (!id) {
    if (method === "GET") {
      const result = db.select().from(projects).all();
      return json(result);
    }
    if (method === "POST") {
      const data = await parseBody(request);
      const projectId = crypto.randomUUID();
      const now = new Date().toISOString();
      const rootPath = (data.rootPath as string) || "";
      let name = (data.name as string) || "";

      // Validate rootPath
      const { existsSync, statSync, readdirSync } = await import("node:fs");
      if (rootPath && existsSync(rootPath) && statSync(rootPath).isDirectory()) {
        if (!name) {
          const clean = rootPath.replace(/[/\\]$/, "");
          name = clean.split(/[/\\]/).pop() || "Project";
        }
        const { ensureProjectStructure } = await import("~/lib/file-router");
        ensureProjectStructure(rootPath);
      } else if (rootPath) {
        return json({ error: "Folder not found or not accessible" }, 400);
      }

      if (!name) name = "Untitled";
      const project = {
        id: projectId,
        name,
        rootPath: rootPath || null,
        company: (data.company as string) ?? null,
        description: (data.description as string) ?? null,
        defaultAgent: (data.defaultAgent as string) || "opencode",
        createdAt: now,
        updatedAt: now,
      };
      db.insert(projects).values(project).run();
      if (rootPath) {
        const { registerWatchRoot } = await import("~/server/file-watcher");
        registerWatchRoot(rootPath);
      }
      db.insert(changeLog).values({
        id: crypto.randomUUID(),
        projectId,
        entityType: "project",
        entityId: projectId,
        entityName: project.name,
        action: "created",
        summary: `Opened project '${project.name}' at ${rootPath || "(no path)"}`,
        createdAt: now,
      }).run();
      return json(project, 201);
    }
    return json({ error: "Method not allowed" }, 405);
  }

  // /api/projects/:id
  if (!sub) {
    if (method === "GET") {
      const result = db.select().from(projects).where(eq(projects.id, id)).get();
      if (!result) return json({ error: "Not found" }, 404);
      return json(result);
    }
    if (method === "PUT") {
      const data = await parseBody(request);
      const existing = db.select().from(projects).where(eq(projects.id, id)).get();
      if (!existing) return json({ error: "Not found" }, 404);
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = { updatedAt: now };
      if (data.name !== undefined) updates.name = data.name;
      if (data.company !== undefined) updates.company = data.company;
      if (data.description !== undefined) updates.description = data.description;
      if (data.defaultAgent !== undefined) updates.defaultAgent = data.defaultAgent;
      db.update(projects).set(updates).where(eq(projects.id, id)).run();
      return json({ ...existing, ...updates });
    }
    if (method === "DELETE") {
      const existing = db.select().from(projects).where(eq(projects.id, id)).get();
      if (!existing) return json({ error: "Not found" }, 404);
      // Delete child entities in FK order (snapshots/endpoints before parents)
      const schema = await import("~/server/db/schema");
      db.delete(schema.erdSnapshots).where(eq(schema.erdSnapshots.erdId, id)).run();
      db.delete(schema.apiSnapshots).where(eq(schema.apiSnapshots.specId, id)).run();
      db.delete(schema.apiEndpoints).where(eq(schema.apiEndpoints.specId, id)).run();
      db.delete(schema.wikiSnapshots).where(eq(schema.wikiSnapshots.pageId, id)).run();
      db.delete(schema.taskSnapshots).where(eq(schema.taskSnapshots.taskId, id)).run();
      db.delete(erds).where(eq(erds.projectId, id)).run();
      db.delete(apiSpecs).where(eq(apiSpecs.projectId, id)).run();
      db.delete(wikiPages).where(eq(wikiPages.projectId, id)).run();
      db.delete(tasks).where(eq(tasks.projectId, id)).run();
      db.delete(changeLog).where(eq(changeLog.projectId, id)).run();
      db.delete(fsdSessions).where(eq(fsdSessions.projectId, id)).run();
      db.delete(schema.exports_).where(eq(schema.exports_.projectId, id)).run();
      db.delete(projects).where(eq(projects.id, id)).run();
      return json({ message: "Deleted" });
    }
    return json({ error: "Method not allowed" }, 405);
  }

  // /api/projects/:id/skills
  if (sub === "skills") {
    const proj = db.select().from(projects).where(eq(projects.id, id)).get() as any;
    if (!proj) return json({ error: "Not found" }, 404);
    const rootPath = proj.rootPath || (process.env.SA_ROOT ? path.resolve(process.env.SA_ROOT) : path.resolve(process.cwd(), ".."));
    const { detectProjectSkills, installProjectSkills } = await import("~/lib/project-skills");

    // GET /api/projects/:id/skills — detect status
    if (method === "GET") {
      const statuses = detectProjectSkills(rootPath);
      const ready = statuses.every((s) => s.status === "installed");
      if (ready && proj.skillsStatus !== "ready") {
        db.update(projects).set({ skillsStatus: "ready", skillsError: null, skillsUpdatedAt: new Date().toISOString() }).where(eq(projects.id, id)).run();
      } else if (!ready && proj.skillsStatus !== "installing" && proj.skillsStatus !== "failed") {
        db.update(projects).set({ skillsStatus: "pending", skillsUpdatedAt: new Date().toISOString() }).where(eq(projects.id, id)).run();
      }
      return json({ status: ready ? "ready" : proj.skillsStatus, skills: statuses });
    }

    // POST /api/projects/:id/skills/install — install missing skills (background)
    if (method === "POST" && segments[2] === "install") {
      if (proj.skillsStatus === "installing") return json({ error: "Installation already in progress" }, 409);
      db.update(projects).set({ skillsStatus: "installing", skillsError: null, skillsUpdatedAt: new Date().toISOString() }).where(eq(projects.id, id)).run();
      void (async () => {
        try {
          const result = await installProjectSkills(rootPath);
          db.update(projects).set({
            skillsStatus: result.ok ? "ready" : "failed",
            skillsError: result.ok ? null : result.failed.map((f) => `${f.name}: ${f.error}`).join("\n---\n"),
            skillsUpdatedAt: new Date().toISOString(),
          }).where(eq(projects.id, id)).run();
        } catch (e: any) {
          db.update(projects).set({
            skillsStatus: "failed",
            skillsError: e?.message ?? String(e),
            skillsUpdatedAt: new Date().toISOString(),
          }).where(eq(projects.id, id)).run();
        }
      })();
      return json({ started: true, status: "installing" }, 202);
    }

    return json({ error: "Method not allowed" }, 405);
  }

  // /api/projects/:id/erds
  if (sub === "erds") {
    if (method === "GET") {
      const result = db.select().from(erds).where(eq(erds.projectId, id)).all();
      return json(result);
    }
    if (method === "POST") {
      const data = await parseBody(request);
      const erdId = crypto.randomUUID();
      const erd = {
        id: erdId,
        projectId: id,
        name: (data.name as string) ?? "Master ERD",
        dbmlContent: (data.dbmlContent as string) ?? "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.insert(erds).values(erd).run();
      return json(erd, 201);
    }
    return json({ error: "Method not allowed" }, 405);
  }

  // /api/projects/:id/specs
  if (sub === "specs") {
    const specAction = segments[2];

    // POST /api/projects/:id/specs/import — parse all spec files and persist to SQLite
    if (specAction === "import" && method === "POST") {
      const pathMod = path;
      const fs = await import("node:fs");
      const proj = db.select().from(projects).where(eq(projects.id, id)).get() as any;
      if (!proj) return json({ error: "Project not found" }, 404);
      const rootPath = proj.rootPath || (process.env.SA_ROOT ? path.resolve(process.env.SA_ROOT) : path.resolve(process.cwd(), ".."));
      const now = new Date().toISOString();
      const { parseMarkdownToModules } = await import("~/lib/spec-parser");
      const { readFile } = await import("~/lib/file-router");

      // Delete existing spec data for this project
      const existingSpecs = db.select().from(apiSpecs).where(eq(apiSpecs.projectId, id)).all();
      for (const spec of existingSpecs) {
        db.delete(apiEndpoints).where(eq(apiEndpoints.specId, spec.id)).run();
      }
      db.delete(apiSpecs).where(eq(apiSpecs.projectId, id)).run();

      let totalSpecs = 0;
      let totalEndpoints = 0;

      const persistSpec = (sourceName: string, moduleName: string, endpoints: any[]) => {
        const specId = crypto.randomUUID();
        db.insert(apiSpecs).values({
          id: specId, projectId: id,
          name: `${sourceName}: ${moduleName}`,
          markdownContent: null,
          createdAt: now, updatedAt: now,
        }).run();
        endpoints.forEach((ep, idx) => {
          db.insert(apiEndpoints).values({
            id: crypto.randomUUID(), specId,
            method: ep.method || "NO_METHOD",
            path: ep.path || ep.no || "/",
            module: moduleName,
            purpose: ep.purpose || null,
            bodySchema: ep.body || null,
            responseSchema: ep.response || null,
            sortOrder: idx,
          }).run();
        });
        totalSpecs++;
        totalEndpoints += endpoints.length;
      };

      // Parse MASTER_SPEC_API.md
      const masterContent = readFile(rootPath, "MASTER_SPEC_API.md");
      if (masterContent) {
        const modules = parseMarkdownToModules(masterContent);
        for (const mod of modules) {
          if (mod.endpoints.length === 0) continue;
          persistSpec("MASTER", mod.fullName, mod.endpoints);
        }
      }

      // Parse output/**/*.md spec files recursively
      const outputDir = pathMod.join(rootPath, "output");
      try {
        if (fs.existsSync(outputDir)) {
          const walkForSpecs = (dir: string, relPrefix: string) => {
            try {
              const items = fs.readdirSync(dir, { withFileTypes: true });
              for (const item of items) {
                const full = pathMod.join(dir, item.name);
                const rel = relPrefix ? pathMod.join(relPrefix, item.name) : item.name;
                if (item.isFile() && item.name.endsWith(".md") && /(spec_api|existing_cms_tsl)/.test(item.name)) {
                  const content = readFile(rootPath, rel);
                  if (!content) continue;
                  const modules = parseMarkdownToModules(content);
                  for (const mod of modules) {
                    if (mod.endpoints.length === 0) continue;
                    persistSpec(item.name.replace(/\.md$/, ""), mod.fullName, mod.endpoints);
                  }
                } else if (item.isDirectory() && !item.name.startsWith(".")) {
                  walkForSpecs(full, rel);
                }
              }
            } catch {}
          };
          walkForSpecs(outputDir, "output");
        }
      } catch {}

      return json({ imported: { specs: totalSpecs, endpoints: totalEndpoints } });
    }

    // GET /api/projects/:id/specs/:specId/endpoints
    if (specAction && segments[3] === "endpoints" && method === "GET") {
      const result = db.select().from(apiEndpoints)
        .where(eq(apiEndpoints.specId, specAction))
        .orderBy(apiEndpoints.sortOrder)
        .all();
      return json(result);
    }

    // DELETE /api/projects/:id/specs/:specId
    if (specAction && method === "DELETE") {
      db.delete(apiEndpoints).where(eq(apiEndpoints.specId, specAction)).run();
      db.delete(apiSpecs).where(eq(apiSpecs.id, specAction)).run();
      return json({ deleted: true });
    }

    if (method === "GET") {
      const result = db.select().from(apiSpecs).where(eq(apiSpecs.projectId, id)).all();
      return json(result);
    }
    return json({ error: "Method not allowed" }, 405);
  }

  // /api/projects/:id/wiki
  if (sub === "wiki") {
    const pageId = segments[2];
    // /api/projects/:id/wiki/:pageId
    if (pageId) {
      if (method === "GET") {
        const result = db.select().from(wikiPages).where(eq(wikiPages.id, pageId)).get();
        return result ? json(result) : json({ error: "Not found" }, 404);
      }
      if (method === "PUT") {
        const data = await parseBody(request);
        const now = new Date().toISOString();
        const updates: Record<string, unknown> = { updatedAt: now };
        if (data.title !== undefined) updates.title = data.title;
        if (data.contentMd !== undefined) updates.contentMd = data.contentMd;
        if (data.parentId !== undefined) updates.parentId = data.parentId;
        if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;
        db.update(wikiPages).set(updates).where(eq(wikiPages.id, pageId)).run();
        const updated = db.select().from(wikiPages).where(eq(wikiPages.id, pageId)).get();
        return json(updated);
      }
      if (method === "DELETE") {
        db.delete(wikiPages).where(eq(wikiPages.id, pageId)).run();
        return json({ deleted: true });
      }
      return json({ error: "Method not allowed" }, 405);
    }
    // /api/projects/:id/wiki
    if (method === "GET") {
      const result = db.select().from(wikiPages).where(eq(wikiPages.projectId, id)).all();
      return json(result);
    }
    if (method === "POST") {
      const data = await parseBody(request);
      const now = new Date().toISOString();
      const pageId = crypto.randomUUID();
      const slug = (data.slug as string) || ((data.title as string) || "untitled")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
      const page = {
        id: pageId,
        projectId: id,
        title: (data.title as string) ?? "Untitled",
        slug,
        contentMd: (data.contentMd as string) ?? "",
        parentId: (data.parentId as string) ?? null,
        sortOrder: (data.sortOrder as number) ?? 0,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(wikiPages).values(page).run();
      return json(page, 201);
    }
    return json({ error: "Method not allowed" }, 405);
  }

  // /api/projects/:id/tasks
  if (sub === "tasks") {
    const taskId = segments[2];

    // Special: POST /api/projects/:id/tasks/import — re-import from artifacts
    if (taskId === "import" && method === "POST") {
      const { scanAllTaskFiles } = await import("~/lib/task-parser");
      const now = new Date().toISOString();
      const existing = db.select().from(tasks).where(eq(tasks.projectId, id)).all() as any[];
      const byCode = new Map<string, any>();
      for (const t of existing) {
        const key = t.code ?? (typeof t.title === "string" ? t.title.split(":")[0].trim() : t.title);
        byCode.set(key, t);
      }
      const parsed = scanAllTaskFiles();
      const seenCodes = new Set<string>();
      let inserted = 0, updated = 0;
      for (const pt of parsed) {
        const key = pt.code;
        seenCodes.add(key);
        const existingTask = byCode.get(key);
        const values: Record<string, unknown> = {
          code: pt.code,
          title: `${pt.code}: ${pt.title}`,
          description: pt.contentMd || "",
          storyPoints: pt.storyPoints,
          module: pt.module,
          dependenciesJson: pt.parentCode ? JSON.stringify([pt.parentCode]) : null,
          sourcePath: pt.sourcePath,
          phase: pt.phase,
          updatedAt: now,
        };
        if (existingTask) {
          // Preserve user-owned fields: status, assignee, manual title/description edits
          db.update(tasks).set(values).where(eq(tasks.id, existingTask.id)).run();
          updated++;
        } else {
          db.insert(tasks).values({
            id: crypto.randomUUID(),
            projectId: id,
            status: "todo",
            assignee: pt.assignee,
            ...values,
            createdAt: now,
          } as any).run();
          inserted++;
        }
      }
      // Remove tasks whose source file is gone (keep user-created tasks without code)
      const stale = existing.filter((t) => t.code && !seenCodes.has(t.code));
      for (const s of stale) {
        db.delete(tasks).where(eq(tasks.id, s.id)).run();
      }
      // Remove legacy tasks without a code — the app has no manual create flow,
      // so code-less rows are orphans from pre-code imports
      const orphans = existing.filter((t) => !t.code);
      for (const o of orphans) {
        db.delete(tasks).where(eq(tasks.id, o.id)).run();
      }
      return json({ inserted, updated, removed: stale.length + orphans.length });
    }

    if (taskId) {
      if (method === "GET") {
        const result = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
        return result ? json(result) : json({ error: "Not found" }, 404);
      }
      if (method === "PUT") {
        const data = await parseBody(request);
        const now = new Date().toISOString();
        const updates: Record<string, unknown> = { updatedAt: now };
        if (data.title !== undefined) updates.title = data.title;
        if (data.description !== undefined) updates.description = data.description;
        if (data.status !== undefined) updates.status = data.status;
        if (data.storyPoints !== undefined) updates.storyPoints = data.storyPoints;
        if (data.assignee !== undefined) updates.assignee = data.assignee;
        if (data.module !== undefined) updates.module = data.module;
        if (data.dependenciesJson !== undefined) updates.dependenciesJson = data.dependenciesJson;
        if (data.code !== undefined) updates.code = data.code;
        if (data.sourcePath !== undefined) updates.sourcePath = data.sourcePath;
        if (data.phase !== undefined) updates.phase = data.phase;
        db.update(tasks).set(updates).where(eq(tasks.id, taskId)).run();
        const updated = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
        return json(updated);
      }
      if (method === "DELETE") {
        db.delete(tasks).where(eq(tasks.id, taskId)).run();
        return json({ deleted: true });
      }
      return json({ error: "Method not allowed" }, 405);
    }
    if (method === "GET") {
      const result = db.select().from(tasks).where(eq(tasks.projectId, id)).all();
      return json(result);
    }
    if (method === "POST") {
      const data = await parseBody(request);
      const now = new Date().toISOString();
      const task = {
        id: crypto.randomUUID(),
        projectId: id,
        code: (data.code as string) ?? null,
        title: (data.title as string) ?? "Untitled Task",
        description: (data.description as string) ?? "",
        status: (data.status as string) ?? "todo",
        storyPoints: (data.storyPoints as number) ?? null,
        assignee: (data.assignee as string) ?? null,
        module: (data.module as string) ?? null,
        dependenciesJson: (data.dependenciesJson as string) ?? null,
        sourcePath: (data.sourcePath as string) ?? null,
        phase: (data.phase as string) ?? null,
        createdAt: now,
        updatedAt: now,
      };
      db.insert(tasks).values(task).run();
      return json(task, 201);
    }
    return json({ error: "Method not allowed" }, 405);
  }

  // /api/projects/:id/fsd
  if (sub === "fsd") {
    const sessionId = segments[2];
    const pathMod = path;
    const fs = await import("node:fs");
    const defaultRoot = (process.env.SA_ROOT ? path.resolve(process.env.SA_ROOT) : path.resolve(process.cwd(), ".."));
    const resolveRoot = () => {
      const proj = db.select().from(projects).where(eq(projects.id, id)).get() as any;
      return proj?.rootPath || defaultRoot;
    };
    const fsdDir = () => pathMod.join(resolveRoot(), "input", "fsd");
    const sourcesDir = () => pathMod.join(fsdDir(), "sources");

    const writeSessionContent = (sid: string, content: string) => {
      const now = new Date().toISOString();
      const hash = hashContent(content);
      db.update(fsdSessions).set({ fsdContent: content, contentHash: hash, updatedAt: now }).where(eq(fsdSessions.id, sid)).run();
      return hash;
    };

    // POST /api/projects/:id/fsd/scan — recursive scan + upsert
    if (sessionId === "scan" && method === "POST") {
      const existing = db.select().from(fsdSessions).where(eq(fsdSessions.projectId, id)).all() as any[];
      const byPath = new Map<string, any>();
      for (const s of existing) {
        if (s.markdownPath) byPath.set(s.markdownPath, s);
        if (s.sourceFilePath) byPath.set(s.sourceFilePath, s);
        if (!s.markdownPath && !s.sourceFilePath && s.fsdInputPath) byPath.set(`input/fsd/${s.fsdInputPath}`, s);
      }
      const now = new Date().toISOString();
      let count = 0;
      const walk = (dir: string, relPrefix: string) => {
        try {
          if (!fs.default.existsSync(dir)) return;
          const entries = fs.default.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const full = pathMod.join(dir, entry.name);
            if (entry.isFile()) {
              if (!entry.name.endsWith(".md") || entry.name === "README.md" || entry.name.startsWith(".")) continue;
              const rel = relPrefix ? pathMod.join(relPrefix, entry.name) : entry.name;
              const relPath = `input/fsd/${rel}`;
              const content = fs.default.readFileSync(full, "utf-8");
              const hash = hashContent(content);
              const artifactSlug = entry.name.replace(/^fsd_/, "").replace(/\.md$/, "").replace(/_/g, "");
              const artifacts: Record<string, string[]> = { spec: [], erd: [], task: [] };
              try {
                const specDir = pathMod.join(resolveRoot(), "output", "spec");
                if (fs.default.existsSync(specDir)) artifacts.spec = fs.default.readdirSync(specDir).filter((f: string) => f.includes(artifactSlug) && f.endsWith(".md"));
              } catch {}
              try {
                const erdDir = pathMod.join(resolveRoot(), "output", "erd");
                if (fs.default.existsSync(erdDir)) artifacts.erd = fs.default.readdirSync(erdDir).filter((f: string) => f.includes(artifactSlug) && f.endsWith(".md"));
              } catch {}
              try {
                const taskDir = pathMod.join(resolveRoot(), "output", "task");
                if (fs.default.existsSync(taskDir)) artifacts.task = fs.default.readdirSync(taskDir).filter((f: string) => f.includes(artifactSlug) && f.endsWith(".md"));
              } catch {}
              const existingRow = byPath.get(relPath);
              if (existingRow) {
                db.update(fsdSessions).set({
                  fsdContent: content,
                  contentHash: hash,
                  markdownPath: relPath,
                  artifactsJson: JSON.stringify(artifacts),
                  updatedAt: now,
                }).where(eq(fsdSessions.id, existingRow.id)).run();
              } else {
                db.insert(fsdSessions).values({
                  id: crypto.randomUUID(),
                  projectId: id,
                  fsdInputPath: rel,
                  fsdContent: content,
                  mode: "generate",
                  status: "draft",
                  title: entry.name.replace(/^fsd_/, "").replace(/\.md$/, "").replace(/_/g, " "),
                  sourceType: "manual",
                  markdownPath: relPath,
                  contentHash: hash,
                  artifactsJson: JSON.stringify(artifacts),
                  createdAt: now,
                  updatedAt: now,
                }).run();
              }
              count++;
            } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
              walk(full, relPrefix ? pathMod.join(relPrefix, entry.name) : entry.name);
            }
          }
        } catch {}
      };
      walk(fsdDir(), "");

      // Also index uploaded source documents so conversion can be started
      // from the selected FSD document instead of only from the upload dialog.
      const { isSupportedUpload } = await import("~/lib/markitdown");
      const scanSources = (dir: string, relPrefix: string) => {
        try {
          if (!fs.default.existsSync(dir)) return;
          for (const entry of fs.default.readdirSync(dir, { withFileTypes: true })) {
            const full = pathMod.join(dir, entry.name);
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              scanSources(full, relPrefix ? pathMod.join(relPrefix, entry.name) : entry.name);
              continue;
            }
            if (!entry.isFile() || !isSupportedUpload(entry.name) || entry.name.endsWith(".md")) continue;
            // Skip source files that already have a converted Markdown twin —
            // the Markdown session is the editable document.
            const stem = entry.name.replace(/\.[a-z0-9]+$/i, "");
            const twinTopLevel = pathMod.join(fsdDir(), `${stem}.md`);
            const twinSameFolder = pathMod.join(dir, `${stem}.md`);
            if (fs.default.existsSync(twinTopLevel) || fs.default.existsSync(twinSameFolder)) {
              const sourceRel = `input/fsd/sources/${relPrefix ? pathMod.join(relPrefix, entry.name) : entry.name}`;
              const existingTwin = byPath.get(sourceRel);
              if (existingTwin) {
                db.delete(fsdSessions).where(eq(fsdSessions.id, existingTwin.id)).run();
                byPath.delete(sourceRel);
                count++;
              }
              continue;
            }
            const rel = relPrefix ? pathMod.join(relPrefix, entry.name) : entry.name;
            const sourcePath = `input/fsd/sources/${rel}`;
            const existingRow = byPath.get(sourcePath);
            if (existingRow) continue;
            const ext = pathMod.extname(entry.name).slice(1).toLowerCase();
            const title = entry.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
            const placeholder = `# ${title}\n\n> Uploaded ${ext.toUpperCase()} document. Convert it to Markdown to edit the extracted requirements.`;
            const now = new Date().toISOString();
            const session = {
              id: crypto.randomUUID(),
              projectId: id,
              fsdInputPath: null,
              fsdContent: placeholder,
              mode: "generate",
              status: "draft",
              title,
              sourceType: ext,
              sourceFilePath: sourcePath,
              markdownPath: null,
              conversionStatus: "pending",
              conversionError: null,
              contentHash: hashContent(placeholder),
              artifactsJson: JSON.stringify({ spec: [], erd: [], task: [] }),
              createdAt: now,
              updatedAt: now,
            };
            db.insert(fsdSessions).values(session).run();
            byPath.set(sourcePath, session);
            count++;
          }
        } catch {}
      };
      scanSources(sourcesDir(), "");
      return json({ scanned: count, total: db.select().from(fsdSessions).where(eq(fsdSessions.projectId, id)).all().length });
    }

    // POST /api/projects/:id/fsd/upload — save the file only; conversion is manual
    // Body: raw file bytes. Query: ?filename=<base64>
    if (sessionId === "upload" && method === "POST") {
      try {
        const { isSupportedUpload, sanitizeFilename } = await import("~/lib/markitdown");
        const reqUrl = new URL(request.url);
        const originalNameRaw = reqUrl.searchParams.get("filename") ?? "";
        const originalName = (() => {
          try { return sanitizeFilename(Buffer.from(originalNameRaw, "base64").toString("utf-8")); } catch { return ""; }
        })();
        if (!originalName) return json({ error: "Missing filename" }, 400);
        const buf = Buffer.from(await request.arrayBuffer());
        if (!buf.length) return json({ error: "Missing file" }, 400);
        if (buf.length > 50 * 1024 * 1024) return json({ error: "File too large (max 50MB)" }, 413);
        if (!isSupportedUpload(originalName)) return json({ error: `Unsupported file type: ${originalName}` }, 415);

        const stem = originalName.replace(/\.[a-z0-9]+$/i, "");
        const ext = originalName.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? "";

        const isMd = ext === ".md";
        const targetDir = isMd ? fsdDir() : sourcesDir();
        try { fs.default.mkdirSync(targetDir, { recursive: true }); } catch {}
        const baseName = stem.replace(/[^\w.\- ]+/g, "_");
        let fileNameFinal = `${baseName}${ext}`;
        let n = 2;
        while (fs.default.existsSync(pathMod.join(targetDir, fileNameFinal))) {
          fileNameFinal = `${baseName}_${n}${ext}`;
          n++;
        }
        fs.default.writeFileSync(pathMod.join(targetDir, fileNameFinal), buf);
        const relativePath = isMd
          ? `input/fsd/${fileNameFinal}`
          : `input/fsd/sources/${fileNameFinal}`;
        return json({
          uploaded: true,
          fileName: fileNameFinal,
          sourcePath: relativePath,
          needsConversion: !isMd,
          message: isMd ? "Markdown file uploaded" : "File uploaded; conversion is available manually",
        }, 201);
      } catch (e: any) {
        return json({ error: `Upload failed: ${e?.message ?? e}` }, 500);
      }
    }

    // POST /api/projects/:id/fsd/upload-image — save an image pasted/dropped
    // into the editor into input/fsd/images/. Body: raw file bytes. Query: ?filename=<base64>
    if (sessionId === "upload-image" && method === "POST") {
      try {
        const reqUrl = new URL(request.url);
        const originalNameRaw = reqUrl.searchParams.get("filename") ?? "";
        let originalName = "";
        try { originalName = Buffer.from(originalNameRaw, "base64").toString("utf-8"); } catch {}
        if (!originalName) return json({ error: "Missing filename" }, 400);
        const buf = Buffer.from(await request.arrayBuffer());
        if (!buf.length) return json({ error: "Missing file" }, 400);
        if (buf.length > 20 * 1024 * 1024) return json({ error: "Image too large (max 20MB)" }, 413);
        const ext = originalName.match(/\.(png|jpe?g|gif|webp|svg|avif)$/i)?.[0].toLowerCase() ?? "";
        if (!ext) return json({ error: `Unsupported image type: ${originalName}` }, 415);

        const imagesDir = pathMod.join(fsdDir(), "images");
        try { fs.default.mkdirSync(imagesDir, { recursive: true }); } catch {}
        const stem = originalName.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.\- ]+/g, "_");
        let fileNameFinal = `${stem}${ext}`;
        let n = 2;
        while (fs.default.existsSync(pathMod.join(imagesDir, fileNameFinal))) {
          fileNameFinal = `${stem}_${n}${ext}`;
          n++;
        }
        fs.default.writeFileSync(pathMod.join(imagesDir, fileNameFinal), buf);
        const relativePath = `input/fsd/images/${fileNameFinal}`;
        return json({ uploaded: true, path: relativePath }, 201);
      } catch (e: any) {
        return json({ error: `Image upload failed: ${e?.message ?? e}` }, 500);
      }
    }

    // POST /api/projects/:id/fsd/convert-file — manually convert an uploaded file
    // in the background with OpenCode + the project's markitdown skill.
    if (sessionId === "convert-file" && method === "POST") {
      const data = await parseBody(request);
      const sourcePath = typeof data.sourcePath === "string" ? data.sourcePath : "";
      if (!sourcePath || !sourcePath.startsWith("input/fsd/sources/") || sourcePath.includes("..")) {
        return json({ error: "Invalid source path" }, 400);
      }
      const sourceFullPath = pathMod.join(resolveRoot(), sourcePath);
      if (!fs.default.existsSync(sourceFullPath)) return json({ error: "Source file missing on disk" }, 404);

      const sourceName = pathMod.basename(sourcePath);
      const stem = sourceName.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.\- ]+/g, "_");
      const outputPath = pathMod.join(fsdDir(), `${stem}.md`);
      const markdownPath = `input/fsd/${stem}.md`;
      const { eventBus } = await import("~/server/events");
      eventBus.emitFsdConversion(sourcePath, "converting");

      void (async () => {
        try {
          const { convertWithOpencode, convertWithMarkitdown } = await import("~/lib/markitdown");
          const result = await convertWithOpencode(sourceFullPath);
          let markdown = result.ok ? result.markdown : null;
          let error = result.error;
          let tool = "opencode-markitdown-skill";
          if (!markdown) {
            // Deterministic fallback so DOCX/PPTX/XLSX still convert if opencode fails/times out
            const cli = await convertWithMarkitdown(sourceFullPath);
            if (cli.ok && cli.markdown) {
              markdown = cli.markdown;
              tool = "markitdown-cli";
            } else if (!error) {
              error = cli.error;
            }
          }
          if (!markdown) {
            eventBus.emitFsdConversion(sourcePath, "failed", error);
            return;
          }
          const output = `---\nsource_file: ${sourceName}\nsource_type: ${pathMod.extname(sourceName).slice(1)}\nconverted_by: ${tool}\nconverted_at: ${new Date().toISOString()}\n---\n\n${markdown}`;
          fs.default.writeFileSync(outputPath, output, "utf-8");
          eventBus.emitFsdConversion(sourcePath, "converted", null, output.length);
        } catch (e: any) {
          eventBus.emitFsdConversion(sourcePath, "failed", e?.message ?? String(e));
        }
      })();

      return json({ accepted: true, status: "converting", sourcePath, markdownPath }, 202);
    }

    // POST /api/projects/:id/fsd — create a new FSD document
    if (!sessionId && method === "POST") {
      const data = await parseBody(request);
      const title = (data.title as string)?.trim() || "Untitled FSD";
      const filename = (data.filename as string)?.trim() || `${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "fsd"}.md`;
      const safeName = filename.replace(/[^\w.\- ]+/g, "_").replace(/\.{2,}/g, ".");
      const now = new Date().toISOString();
      const content = (data.content as string) ?? `# ${title}\n\n## Context\n\n## Discussion Notes\n\n## Problem Statement\n\n## Goals\n\n## Scope\n\n### In Scope\n\n### Out of Scope\n\n## Actors\n\n## Functional Requirements\n\n## Non-functional Requirements\n\n## User Flow\n\n## Data Requirements\n\n## API Requirements\n\n## Acceptance Criteria\n\n## Open Questions\n\n## Notes\n`;
      const relPath = `input/fsd/${safeName}`;
      const fullPath = pathMod.join(fsdDir(), safeName);
      if (fs.default.existsSync(fullPath)) return json({ error: `File already exists: ${safeName}` }, 409);
      try { fs.default.mkdirSync(fsdDir(), { recursive: true }); } catch {}
      fs.default.writeFileSync(fullPath, content, "utf-8");
      const hash = hashContent(content);
      const session = {
        id: crypto.randomUUID(),
        projectId: id,
        fsdInputPath: safeName,
        fsdContent: content,
        mode: "generate",
        status: "draft",
        title,
        sourceType: "manual",
        markdownPath: relPath,
        contentHash: hash,
        artifactsJson: JSON.stringify({ spec: [], erd: [], task: [] }),
        createdAt: now,
        updatedAt: now,
      };
      db.insert(fsdSessions).values(session).run();
      return json(session, 201);
    }

    if (sessionId) {
      if (method === "GET") {
        const result = db.select().from(fsdSessions).where(eq(fsdSessions.id, sessionId)).get();
        return result ? json(result) : json({ error: "Not found" }, 404);
      }
      if (method === "DELETE") {
        const session = db.select().from(fsdSessions).where(eq(fsdSessions.id, sessionId)).get() as any;
        if (session) {
          // Remove the editable markdown + original source from disk
          const paths = [session.markdownPath, session.sourceFilePath]
            .filter(Boolean)
            .map((p: string) => pathMod.join(resolveRoot(), p));
          for (const p of paths) {
            try { if (fs.default.existsSync(p)) fs.default.unlinkSync(p); } catch {}
          }
        }
        db.delete(fsdSessions).where(eq(fsdSessions.id, sessionId)).run();
        return json({ deleted: true });
      }
      if (method === "PUT") {
        const data = await parseBody(request);
        const now = new Date().toISOString();
        const session = db.select().from(fsdSessions).where(eq(fsdSessions.id, sessionId)).get() as any;
        if (!session) return json({ error: "Not found" }, 404);
        const updates: Record<string, unknown> = { updatedAt: now };
        if (typeof data.content === "string") {
          // Persist to the source Markdown file (source of truth)
          const rel = (session.markdownPath as string) ?? (session.fsdInputPath ? `input/fsd/${session.fsdInputPath}` : null);
          if (rel) {
            try {
              const full = pathMod.join(resolveRoot(), rel);
              fs.default.mkdirSync(pathMod.dirname(full), { recursive: true });
              fs.default.writeFileSync(full, data.content, "utf-8");
            } catch {}
          }
          updates.fsdContent = data.content;
          updates.contentHash = hashContent(data.content);
        }
        if (data.status !== undefined) updates.status = data.status;
        if (data.title !== undefined) updates.title = data.title;
        if (data.completenessJson !== undefined) updates.completenessJson = data.completenessJson;
        db.update(fsdSessions).set(updates).where(eq(fsdSessions.id, sessionId)).run();
        const updated = db.select().from(fsdSessions).where(eq(fsdSessions.id, sessionId)).get();
        return json(updated);
      }
      // POST /api/projects/:id/fsd/:sessionId/check — completeness check
      if (method === "POST" && segments[3] === "check") {
        const session = db.select().from(fsdSessions).where(eq(fsdSessions.id, sessionId)).get() as any;
        if (!session) return json({ error: "Not found" }, 404);
        const { checkCompleteness } = await import("~/lib/fsd-completeness");
        const result = checkCompleteness(session.fsdContent ?? "");
        db.update(fsdSessions).set({ completenessJson: JSON.stringify(result), updatedAt: new Date().toISOString() }).where(eq(fsdSessions.id, sessionId)).run();
        return json(result);
      }
      // POST /api/projects/:id/fsd/:sessionId/convert — convert uploaded file to Markdown
      // via headless opencode + markitdown skill, runs in the background
      if (method === "POST" && segments[3] === "convert") {
        const session = db.select().from(fsdSessions).where(eq(fsdSessions.id, sessionId)).get() as any;
        if (!session) return json({ error: "Not found" }, 404);
        if (session.conversionStatus === "converting") return json({ error: "Already converting" }, 409);
        if (!session.sourceFilePath) return json({ error: "No source file to convert" }, 400);
        const sourceFullPath = pathMod.join(resolveRoot(), session.sourceFilePath);
        if (!fs.default.existsSync(sourceFullPath)) return json({ error: "Source file missing on disk" }, 404);

        const sourceName = pathMod.basename(session.sourceFilePath);
        const outputStem = sourceName.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.\- ]+/g, "_");
        const outputFileName = `${outputStem}.md`;
        const outputMarkdownPath = `input/fsd/${outputFileName}`;
        const mdFullPath = pathMod.join(resolveRoot(), session.markdownPath ?? outputMarkdownPath);
        const title = session.title ?? session.fsdInputPath ?? "Document";
        const now = new Date().toISOString();

        db.update(fsdSessions).set({
          conversionStatus: "converting",
          conversionError: null,
          updatedAt: now,
        }).where(eq(fsdSessions.id, sessionId)).run();
        const { eventBus } = await import("~/server/events");
        eventBus.emitFsdConversion(sessionId, "converting");

        void (async () => {
          try {
            const { convertWithOpencode, convertWithMarkitdown } = await import("~/lib/markitdown");
            const result = await convertWithOpencode(sourceFullPath);
            let markdown = result.ok ? result.markdown : null;
            let error = result.error;
            let tool = "opencode-markitdown-skill";
            if (!markdown) {
              const cli = await convertWithMarkitdown(sourceFullPath);
              if (cli.ok && cli.markdown) {
                markdown = cli.markdown;
                tool = "markitdown-cli";
              } else if (!error) {
                error = cli.error;
              }
            }
            const finalMd = `---\nsource_file: ${pathMod.basename(session.sourceFilePath)}\nsource_type: ${(session.sourceType ?? "file").replace("manual", "file")}\nconverted_by: ${tool}\nconverted_at: ${new Date().toISOString()}\n---\n\n# ${title}\n\n${markdown ?? ""}`;
            if (markdown) {
              fs.default.writeFileSync(mdFullPath, finalMd, "utf-8");
              const hash = hashContent(finalMd);
              db.update(fsdSessions).set({
                fsdContent: finalMd,
                fsdInputPath: outputFileName,
                markdownPath: outputMarkdownPath,
                contentHash: hash,
                conversionStatus: "converted",
                conversionError: null,
                updatedAt: new Date().toISOString(),
              }).where(eq(fsdSessions.id, sessionId)).run();
              eventBus.emitFsdConversion(sessionId, "converted", null, finalMd.length);
            } else {
              const failedMd = `---\nsource_file: ${pathMod.basename(session.sourceFilePath)}\nsource_type: ${(session.sourceType ?? "file").replace("manual", "file")}\nconverted_by: ${tool}\nconverted_at: ${new Date().toISOString()}\n---\n\n# ${title}\n\n> **Conversion failed.** The original file is preserved at \`${session.sourceFilePath}\`.\n> Error: ${error}\n\nYou can paste the content manually below.\n`;
              fs.default.writeFileSync(mdFullPath, failedMd, "utf-8");
              db.update(fsdSessions).set({
                fsdContent: failedMd,
                conversionStatus: "failed",
                conversionError: error,
                updatedAt: new Date().toISOString(),
              }).where(eq(fsdSessions.id, sessionId)).run();
              eventBus.emitFsdConversion(sessionId, "failed", error);
            }
          } catch (e: any) {
            const err = e?.message ?? String(e);
            db.update(fsdSessions).set({
              conversionStatus: "failed",
              conversionError: err,
              updatedAt: new Date().toISOString(),
            }).where(eq(fsdSessions.id, sessionId)).run();
            eventBus.emitFsdConversion(sessionId, "failed", err);
          }
        })();

        return json({ ok: true, conversionStatus: "converting" }, 202);
      }
      // POST /api/projects/:id/fsd/:sessionId/ready — mark ready
      if (method === "POST" && segments[3] === "ready") {
        const session = db.select().from(fsdSessions).where(eq(fsdSessions.id, sessionId)).get() as any;
        if (!session) return json({ error: "Not found" }, 404);
        const { checkCompleteness } = await import("~/lib/fsd-completeness");
        const result = checkCompleteness(session.fsdContent ?? "");
        db.update(fsdSessions).set({
          completenessJson: JSON.stringify(result),
          status: result.missing.length === 0 ? "ready" : "draft",
          updatedAt: new Date().toISOString(),
        }).where(eq(fsdSessions.id, sessionId)).run();
        return json({ ...db.select().from(fsdSessions).where(eq(fsdSessions.id, sessionId)).get(), completeness: result });
      }
      return json({ error: "Method not allowed" }, 405);
    }

    if (method === "GET") {
      const result = db.select().from(fsdSessions).where(eq(fsdSessions.projectId, id)).orderBy(desc(fsdSessions.updatedAt)).all();
      return json(result);
    }

    return json({ error: "Method not allowed" }, 405);
  }

  // /api/projects/:id/changelog
  if (sub === "changelog") {
    if (method === "GET") {
      const result = db.select().from(changeLog)
        .where(eq(changeLog.projectId, id))
        .orderBy(changeLog.createdAt)
        .all();
      return json(result);
    }
    return json({ error: "Method not allowed" }, 405);
    }

  return json({ error: "Not found" }, 404);
}
