import fs from "node:fs";
import { eq } from "drizzle-orm";
import { json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { db } from "~/server/db/client";
import {
  apiEndpoints,
  apiSpecs,
  changeLog,
  erdSnapshots,
  apiSnapshots,
  erds,
  exports_,
  fsdSessions,
  projects,
  taskSnapshots,
  tasks,
  wikiPages,
  wikiSnapshots,
} from "~/server/db/schema";

export const router = new Router();

// GET /api/projects
router.get("projects", () => {
  const result = db.select().from(projects).all();
  return json(result);
});

// POST /api/projects
router.post("projects", async ({ body }) => {
  const data = await body();
  const projectId = crypto.randomUUID();
  const now = new Date().toISOString();
  const rootPath = (data.rootPath as string) || "";
  let name = (data.name as string) || "";

  // Validate rootPath
  if (rootPath && fs.existsSync(rootPath) && fs.statSync(rootPath).isDirectory()) {
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
    const { registerWatchRoot } = await import("~/server/realtime/file-watcher");
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
});

// GET /api/projects/:id
router.get("projects/:id", ({ params }) => {
  const result = db.select().from(projects).where(eq(projects.id, params.id)).get();
  return result ? json(result) : notFound();
});

// PUT /api/projects/:id
router.put("projects/:id", async ({ params, body }) => {
  const id = params.id;
  const existing = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!existing) return notFound();
  const data = await body();
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (data.name !== undefined) updates.name = data.name;
  if (data.company !== undefined) updates.company = data.company;
  if (data.description !== undefined) updates.description = data.description;
  if (data.defaultAgent !== undefined) updates.defaultAgent = data.defaultAgent;
  db.update(projects).set(updates).where(eq(projects.id, id)).run();
  return json({ ...existing, ...updates });
});

// DELETE /api/projects/:id
router.delete("projects/:id", async ({ params }) => {
  const id = params.id;
  const existing = db.select().from(projects).where(eq(projects.id, id)).get();
  if (!existing) return notFound();
  // Delete child entities in FK order (snapshots/endpoints before parents)
  db.delete(erdSnapshots).where(eq(erdSnapshots.erdId, id)).run();
  db.delete(apiSnapshots).where(eq(apiSnapshots.specId, id)).run();
  db.delete(apiEndpoints).where(eq(apiEndpoints.specId, id)).run();
  db.delete(wikiSnapshots).where(eq(wikiSnapshots.pageId, id)).run();
  db.delete(taskSnapshots).where(eq(taskSnapshots.taskId, id)).run();
  db.delete(erds).where(eq(erds.projectId, id)).run();
  db.delete(apiSpecs).where(eq(apiSpecs.projectId, id)).run();
  db.delete(wikiPages).where(eq(wikiPages.projectId, id)).run();
  db.delete(tasks).where(eq(tasks.projectId, id)).run();
  db.delete(changeLog).where(eq(changeLog.projectId, id)).run();
  db.delete(fsdSessions).where(eq(fsdSessions.projectId, id)).run();
  db.delete(exports_).where(eq(exports_.projectId, id)).run();
  db.delete(projects).where(eq(projects.id, id)).run();
  return json({ message: "Deleted" });
});

// GET /api/projects/:id/changelog
router.get("projects/:id/changelog", ({ params }) => {
  const result = db.select().from(changeLog)
    .where(eq(changeLog.projectId, params.id))
    .orderBy(changeLog.createdAt)
    .all();
  return json(result);
});
