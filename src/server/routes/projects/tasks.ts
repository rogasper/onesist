import { eq } from "drizzle-orm";
import { json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { defaultRoot, getProject } from "../../http/route-utils";
import { scanAllTaskFiles } from "~/lib/task-parser";
import { db } from "~/server/db/client";
import { tasks } from "~/server/db/schema";

export const router = new Router();

// GET /api/projects/:id/tasks
router.get("projects/:id/tasks", ({ params }) => {
  const result = db.select().from(tasks).where(eq(tasks.projectId, params.id)).all();
  return json(result);
});

// POST /api/projects/:id/tasks
router.post("projects/:id/tasks", async ({ params, body }) => {
  const data = await body();
  const now = new Date().toISOString();
  const task = {
    id: crypto.randomUUID(),
    projectId: params.id,
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
});

// POST /api/projects/:id/tasks/import — re-import from artifacts
router.post("projects/:id/tasks/import", async ({ params }) => {
  const id = params.id;
  const now = new Date().toISOString();
  const existing = db.select().from(tasks).where(eq(tasks.projectId, id)).all() as any[];
  const byCode = new Map<string, any>();
  for (const t of existing) {
    const key = t.code ?? (typeof t.title === "string" ? t.title.split(":")[0].trim() : t.title);
    byCode.set(key, t);
  }
  const proj = getProject(id);
  const taskRoot = proj?.rootPath || defaultRoot();
  const parsed = scanAllTaskFiles(taskRoot);
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
});

// GET /api/projects/:id/tasks/:taskId
router.get("projects/:id/tasks/:taskId", ({ params }) => {
  const result = db.select().from(tasks).where(eq(tasks.id, params.taskId)).get();
  return result ? json(result) : notFound();
});

// PUT /api/projects/:id/tasks/:taskId
router.put("projects/:id/tasks/:taskId", async ({ params, body }) => {
  const data = await body();
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
  db.update(tasks).set(updates).where(eq(tasks.id, params.taskId)).run();
  const updated = db.select().from(tasks).where(eq(tasks.id, params.taskId)).get();
  return json(updated);
});

// DELETE /api/projects/:id/tasks/:taskId
router.delete("projects/:id/tasks/:taskId", ({ params }) => {
  db.delete(tasks).where(eq(tasks.id, params.taskId)).run();
  return json({ deleted: true });
});
