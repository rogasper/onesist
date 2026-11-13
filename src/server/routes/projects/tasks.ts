import path from "node:path";
import { eq, and } from "drizzle-orm";
import { json, notFound, badRequest } from "../../http/response";
import { Router } from "../../http/router";
import { defaultRoot, getProject } from "../../http/route-utils";
import { readFile, writeFile } from "~/lib/file-router";
import { rewriteTaskSection, scanAllTaskFiles } from "~/lib/task-parser";
import { db } from "~/server/db/client";
import { taskRunRepos, taskRuns, tasks } from "~/server/db/schema";
import { isTaskStatus } from "~/lib/task-status";

export const router = new Router();

/**
 * Fields the task modal edits that the re-import also writes. Once a human
 * touches one, it belongs to the human: `manual_fields_json` records it and the
 * import leaves it alone (status, assignee and archived were always preserved).
 */
const MANUAL_FIELDS = ["title", "description", "storyPoints", "module", "phase"] as const;

function manualFields(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

/** Whether a submitted value equals what is stored (null/"" and numeric strings compared as one). */
function sameFieldValue(field: string, next: unknown, current: unknown): boolean {
  if (field === "storyPoints") {
    const a = next === null || next === undefined || next === "" ? null : Number(next);
    const b = current === null || current === undefined || current === "" ? null : Number(current);
    return a === b;
  }
  return String(next ?? "").trim() === String(current ?? "").trim();
}

// GET /api/projects/:id/tasks
router.get("projects/:id/tasks", ({ params }) => {
  const result = db.select().from(tasks).where(eq(tasks.projectId, params.id)).all();
  return json(result);
});

// POST /api/projects/:id/tasks
router.post("projects/:id/tasks", async ({ params, body }) => {
  const data = await body();
  if (data.status !== undefined && !isTaskStatus(data.status)) return badRequest("Status tidak dikenal");
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
    archived: Boolean(data.archived) ?? false,
    execProviderId: (data.execProviderId as string) ?? null,
    execModel: (data.execModel as string) ?? null,
    reposJson: (data.reposJson as string) ?? null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(tasks).values(task).run();
  return json(task, 201);
});

// POST /api/projects/:id/tasks/bulk — bulk update status / archived
router.post("projects/:id/tasks/bulk", async ({ params, body }) => {
  const data = await body();
  const ids = Array.isArray(data.ids) ? (data.ids as string[]) : [];
  const patch = data.patch as { status?: string; archived?: boolean } | undefined;
  if (!ids.length || !patch) {
    return badRequest("ids array and patch object are required");
  }
  if (patch.status !== undefined && !isTaskStatus(patch.status)) return badRequest("Status tidak dikenal");

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (patch.status !== undefined) updates.status = patch.status;
  if (patch.archived !== undefined) updates.archived = Boolean(patch.archived);

  let updated = 0;
  for (const taskId of ids) {
    const res = db
      .update(tasks)
      .set(updates)
      .where(and(eq(tasks.id, taskId), eq(tasks.projectId, params.id)))
      .run();
    if (res.changes) updated += res.changes;
  }

  return json({ updated });
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
  const { tasks: parsed, skippedFiles } = scanAllTaskFiles(taskRoot);
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
      updatedAt: now,
      blocksJson: pt.blocks.length > 0 ? JSON.stringify(pt.blocks) : null,
      critical: pt.critical ? 1 : 0,
      risk: pt.risk,
      specRef: pt.specRef,
      erdRef: pt.erdRef,
      rtmRef: pt.rtmRef,
    };
    // Scope and criteria are sticky too: a file without them must not wipe what was filled in.
    if (pt.filesScope.length > 0) values.filesScopeJson = JSON.stringify(pt.filesScope);
    if (pt.acceptanceCriteria.length > 0) values.acceptanceCriteriaJson = JSON.stringify(pt.acceptanceCriteria);
    // Sticky phase: only overwrite phase if the parsed file explicitly provided a phase
    if (pt.phase) {
      values.phase = pt.phase;
    }
    if (existingTask) {
      // Fields a human edited win over the file. The comment here always said so,
      // but every field was overwritten — an edit in the task modal survived only
      // until the next sync (the tab imports on mount and on file:changed).
      for (const field of manualFields(existingTask.manualFieldsJson)) delete values[field];
      db.update(tasks).set(values).where(eq(tasks.id, existingTask.id)).run();
      updated++;
    } else {
      db.insert(tasks).values({
        id: crypto.randomUUID(),
        projectId: id,
        status: "todo",
        assignee: pt.assignee,
        phase: pt.phase ?? null,
        archived: false,
        ...values,
        createdAt: now,
      } as any).run();
      inserted++;
    }
  }
  // Remove tasks whose source file is gone (keep user-created tasks without code).
  // Guard: only when at least one task parsed — a format regression that makes
  // every file yield 0 tasks would otherwise wipe all existing tasks.
  // IMPORTANT: Archived tasks are NOT removed during cleanup even if deleted from disk!
  let removed = 0;
  if (parsed.length > 0) {
    const stale = existing.filter((t) => t.code && !seenCodes.has(t.code) && !t.archived);
    for (const s of stale) {
      db.delete(tasks).where(eq(tasks.id, s.id)).run();
    }
    // Remove legacy tasks without a code — the app has no manual create flow,
    // so code-less rows are orphans from pre-code imports (unless archived)
    const orphans = existing.filter((t) => !t.code && !t.archived);
    for (const o of orphans) {
      db.delete(tasks).where(eq(tasks.id, o.id)).run();
    }
    removed = stale.length + orphans.length;
  }
  if (skippedFiles.length > 0) {
    console.warn(`[tasks/import] ${skippedFiles.length} file(s) tanpa task terdeteksi (cek heading ## Task / ### T1):`, skippedFiles);
  }
  return json({ inserted, updated, removed, skipped: skippedFiles.length, skippedFiles });
});

// GET /api/projects/:id/tasks/:taskId
router.get("projects/:id/tasks/:taskId", ({ params }) => {
  const result = db.select().from(tasks).where(eq(tasks.id, params.taskId)).get();
  return result ? json(result) : notFound();
});

// PUT /api/projects/:id/tasks/:taskId
router.put("projects/:id/tasks/:taskId", async ({ params, body }) => {
  const data = await body();
  if (data.status !== undefined && !isTaskStatus(data.status)) return badRequest("Status tidak dikenal");
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.status !== undefined) updates.status = data.status;
  if (data.storyPoints !== undefined) updates.storyPoints = data.storyPoints;
  if (data.assignee !== undefined) updates.assignee = data.assignee;
  if (data.module !== undefined) updates.module = data.module;
  if (data.dependenciesJson !== undefined) updates.dependenciesJson = data.dependenciesJson;
  if (data.blocksJson !== undefined) updates.blocksJson = data.blocksJson;
  if (data.critical !== undefined) updates.critical = Boolean(data.critical) ? 1 : 0;
  if (data.risk !== undefined) updates.risk = data.risk;
  if (data.filesScopeJson !== undefined) updates.filesScopeJson = data.filesScopeJson;
  if (data.specRef !== undefined) updates.specRef = data.specRef;
  if (data.erdRef !== undefined) updates.erdRef = data.erdRef;
  if (data.rtmRef !== undefined) updates.rtmRef = data.rtmRef;
  if (data.acceptanceCriteriaJson !== undefined) updates.acceptanceCriteriaJson = data.acceptanceCriteriaJson;
  if (data.code !== undefined) updates.code = data.code;
  if (data.sourcePath !== undefined) updates.sourcePath = data.sourcePath;
  if (data.phase !== undefined) updates.phase = data.phase;
  if (data.archived !== undefined) updates.archived = Boolean(data.archived);
  if (data.execProviderId !== undefined) updates.execProviderId = data.execProviderId;
  if (data.execModel !== undefined) updates.execModel = data.execModel;
  if (data.reposJson !== undefined) updates.reposJson = data.reposJson;

  // Mark what a human actually changed, so the next import from output/task
  // leaves it alone. Only fields whose value differs are marked — the modal
  // always sends every field, and saving just the status must not freeze the
  // title, body and story points against the file. Union with the fields
  // already marked, so editing the title cannot unmark an earlier edit.
  const current = db.select().from(tasks).where(eq(tasks.id, params.taskId)).get() as any;
  const touched = MANUAL_FIELDS.filter(
    (field) => data[field] !== undefined && !sameFieldValue(field, data[field], current?.[field]),
  );
  if (touched.length > 0) {
    updates.manualFieldsJson = JSON.stringify([...new Set([...manualFields(current?.manualFieldsJson), ...touched])]);
  }

  // The .md file is the source the Tasks tab re-imports from, so an edit that
  // changes something the file carries is written back to that task's own
  // section. A failed write does NOT block the save: the row is still stored and
  // the response carries `fileSync`, so the UI can say the file is out of sync
  // instead of losing the edit (a section the locator cannot find must not make
  // the whole save fail).
  const fileFieldsChanged =
    touched.some((field) => field === "title" || field === "description" || field === "storyPoints") ||
    (data.assignee !== undefined && !sameFieldValue("assignee", data.assignee, current?.assignee));

  let fileSync: { synced: boolean; error?: string } | null = null;
  if (fileFieldsChanged && current?.sourcePath) {
    fileSync = writeTaskSectionToFile(params.id, { ...current, ...updates }, current?.title);
    if (fileSync && !fileSync.synced) {
      console.warn(`[tasks] .md write-back skipped for ${params.taskId} (${current.sourcePath}): ${fileSync.error}`);
    }
  }

  db.update(tasks).set(updates).where(eq(tasks.id, params.taskId)).run();
  const updated = db.select().from(tasks).where(eq(tasks.id, params.taskId)).get();
  return json({ ...updated, fileSync });
});

/** Judul tanpa prefix kode: `api-AP-1: Buat login` → `Buat login`. */
function displayTaskTitle(title: unknown, code: unknown): string {
  const full = String(title ?? "");
  const prefix = code ? `${String(code)}: ` : "";
  return prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full;
}

/**
 * Menulis kembali satu kartu ke section-nya di `sourcePath`.
 *
 * @returns null bila tidak ada yang perlu ditulis, atau status sinkronisasinya.
 */
function writeTaskSectionToFile(
  projectId: string,
  row: any,
  previousTitle: unknown,
): { synced: boolean; error?: string } | null {
  if (!row?.sourcePath || !row?.code) return null;

  const project = getProject(projectId);
  const root = project?.rootPath || defaultRoot();
  const content = readFile(root, row.sourcePath);
  if (content === null) {
    return { synced: false, error: `Berkas sumber task tidak ditemukan: ${row.sourcePath}` };
  }

  const code = String(row.code);
  const next = rewriteTaskSection(
    content,
    path.basename(String(row.sourcePath)),
    code,
    {
      title: displayTaskTitle(row.title, code),
      body: String(row.description ?? ""),
      storyPoints: row.storyPoints ?? null,
      assignee: row.assignee ?? null,
    },
    displayTaskTitle(previousTitle, code),
  );

  if (next === null) {
    return {
      synced: false,
      error: `Section task ini tidak ditemukan di ${row.sourcePath} — isi tersimpan di aplikasi, berkas .md tidak diperbarui.`,
    };
  }
  if (next === content) return { synced: true };
  return writeFile(root, row.sourcePath, next)
    ? { synced: true }
    : { synced: false, error: `Berkas ${row.sourcePath} tidak bisa ditulis — isi tersimpan di aplikasi.` };
}

// DELETE /api/projects/:id/tasks/:taskId
router.delete("projects/:id/tasks/:taskId", ({ params }) => {
  // Runs and their repo rows go first: they reference the task, and the foreign keys are on.
  const runIds = db.select({ id: taskRuns.id }).from(taskRuns).where(eq(taskRuns.taskId, params.taskId)).all();
  for (const run of runIds) db.delete(taskRunRepos).where(eq(taskRunRepos.runId, run.id)).run();
  db.delete(taskRuns).where(eq(taskRuns.taskId, params.taskId)).run();
  db.delete(tasks).where(eq(tasks.id, params.taskId)).run();
  return json({ deleted: true });
});

