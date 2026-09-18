import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { db } from "~/server/db/client";
import {
  apiEndpoints,
  apiSpecs,
  businessRequirements,
  changeLog,
  designSolutions,
  erdSnapshots,
  apiSnapshots,
  erds,
  exports_,
  fsdSessions,
  functionalRequirements,
  projects,
  rtmLinks,
  taskSnapshots,
  tasks,
  testCases,
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

  // Idempotent open. Every failed attempt in the skill-setup step used to send a
  // fresh POST, and each one inserted another row for the same folder — a user who
  // retried a few times ended up with several identical projects. Opening a folder
  // that is already registered returns the existing row instead of a duplicate.
  if (rootPath) {
    const wanted = path.resolve(rootPath).replace(/[/\\]+$/, "");
    const existing = db
      .select()
      .from(projects)
      .all()
      .find((p: typeof projects.$inferSelect) => p.rootPath && path.resolve(p.rootPath).replace(/[/\\]+$/, "") === wanted);
    if (existing) return json(existing);
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
  // Children of the project's own rows go first, and they are keyed by the PARENT
  // ROW id, not by the project id: erd_snapshots.erd_id -> erds.id,
  // api_snapshots/api_endpoints.spec_id -> api_specs.id, wiki_snapshots.page_id ->
  // wiki_pages.id, task_snapshots.task_id -> tasks.id. Deleting them by the project
  // id matched nothing, so with `PRAGMA foreign_keys = ON` the follow-up parent
  // delete violated the FK and the whole request failed — the project could not be
  // deleted at all. Collect the real ids first, then delete children by them.
  const ownedErdIds = db.select({ id: erds.id }).from(erds).where(eq(erds.projectId, id)).all();
  const ownedSpecIds = db.select({ id: apiSpecs.id }).from(apiSpecs).where(eq(apiSpecs.projectId, id)).all();
  const ownedPageIds = db.select({ id: wikiPages.id }).from(wikiPages).where(eq(wikiPages.projectId, id)).all();
  const ownedTaskIds = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, id)).all();

  for (const row of ownedErdIds) {
    db.delete(erdSnapshots).where(eq(erdSnapshots.erdId, row.id)).run();
  }
  for (const row of ownedSpecIds) {
    db.delete(apiSnapshots).where(eq(apiSnapshots.specId, row.id)).run();
    db.delete(apiEndpoints).where(eq(apiEndpoints.specId, row.id)).run();
  }
  for (const row of ownedPageIds) {
    db.delete(wikiSnapshots).where(eq(wikiSnapshots.pageId, row.id)).run();
  }
  for (const row of ownedTaskIds) {
    db.delete(taskSnapshots).where(eq(taskSnapshots.taskId, row.id)).run();
  }

  db.delete(rtmLinks).where(eq(rtmLinks.projectId, id)).run();
  db.delete(testCases).where(eq(testCases.projectId, id)).run();
  db.delete(designSolutions).where(eq(designSolutions.projectId, id)).run();
  db.delete(functionalRequirements).where(eq(functionalRequirements.projectId, id)).run();
  db.delete(businessRequirements).where(eq(businessRequirements.projectId, id)).run();
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
