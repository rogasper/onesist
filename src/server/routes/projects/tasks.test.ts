/**
 * Task routes: the in_review status, the execution fields, re-import, and project delete.
 *
 *   bun test src/server/routes/projects/tasks.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-tasks-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, tasks, projectExecSettings } = await import("~/server/db/schema");
const { sql, eq } = await import("drizzle-orm");
const { router: tasksRouter } = await import("./tasks");
const { router: projectsRouter } = await import("./index");

let root = "";
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-tasks-ws-"));
  fs.mkdirSync(path.join(root, "output", "task"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "output", "task", "task_api.md"),
    "# Task API\n\n## Task AP-1: Buat endpoint login\n\n- Story Points: 3\n\nDeskripsi endpoint login.\n",
  );
  db.insert(projects).values({ id: "p-tasks", name: "Tugas", rootPath: root }).run();
  db.insert(tasks).values({ id: "t1", projectId: "p-tasks", code: "api-AP-1", title: "api-AP-1: Buat endpoint login", status: "todo" }).run();
});

const call = async (r: typeof tasksRouter | typeof projectsRouter, method: string, url: string, body?: unknown) => {
  const res = await r.handle(
    new Request(`http://localhost:4321${url}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  if (!res) throw new Error(`route did not match: ${method} ${url}`);
  return { status: res.status, body: (await res.json()) as any };
};

const put = (taskId: string, body: unknown) => call(tasksRouter, "PUT", `/api/projects/p-tasks/tasks/${taskId}`, body);

test("PUT accepts in_review and the execution fields", async () => {
  const res = await put("t1", {
    status: "in_review",
    execProviderId: "prov-1",
    execModel: "m-1",
    reposJson: '["input/code/api"]',
  });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe("in_review");
  expect(res.body.execModel).toBe("m-1");
  expect(res.body.reposJson).toBe('["input/code/api"]');
});

test("PUT and bulk reject an unknown status with an Indonesian message", async () => {
  const bad = await put("t1", { status: "review" });
  expect(bad.status).toBe(400);
  expect(bad.body.error).toBe("Status tidak dikenal");
  const bulk = await call(tasksRouter, "POST", "/api/projects/p-tasks/tasks/bulk", { ids: ["t1"], patch: { status: "blocked" } });
  expect(bulk.status).toBe(400);
});

test("re-import keeps status and the execution fields of an existing task", async () => {
  const res = await call(tasksRouter, "POST", "/api/projects/p-tasks/tasks/import", {});
  expect(res.status).toBe(200);
  const row = db.select().from(tasks).where(eq(tasks.id, "t1")).get()!;
  expect(row.status).toBe("in_review");
  expect(row.execModel).toBe("m-1");
  expect(row.reposJson).toBe('["input/code/api"]');
});

test("deleting a project removes its execution settings before the project row", async () => {
  db.insert(projects).values({ id: "p-del", name: "Hapus", rootPath: root }).run();
  db.run(sql`INSERT INTO project_exec_settings (project_id, task_mode) VALUES ('p-del', 'delivery')`);
  const res = await call(projectsRouter, "DELETE", "/api/projects/p-del");
  expect(res.status).toBe(200);
  expect(db.select().from(projectExecSettings).where(eq(projectExecSettings.projectId, "p-del")).all()).toHaveLength(0);
});

test("re-import keeps the scope and criteria filled in by hand when the file has none", async () => {
  db.update(tasks)
    .set({ filesScopeJson: '["input/code/api/src/auth.ts"]', acceptanceCriteriaJson: '["Login memakai OTP"]' })
    .where(eq(tasks.id, "t1"))
    .run();
  await call(tasksRouter, "POST", "/api/projects/p-tasks/tasks/import", {});
  const row = db.select().from(tasks).where(eq(tasks.id, "t1")).get()!;
  expect(row.filesScopeJson).toBe('["input/code/api/src/auth.ts"]');
  expect(row.acceptanceCriteriaJson).toBe('["Login memakai OTP"]');
});

test("deleting a task removes its runs first", async () => {
  db.insert(tasks).values({ id: "t-del", projectId: "p-tasks", code: "del-1", title: "del-1: hapus", status: "todo" }).run();
  db.run(sql`INSERT INTO task_runs (id, task_id, project_id, bundle_path) VALUES ('run-del', 't-del', 'p-tasks', '/tmp/run-del')`);
  db.run(sql`INSERT INTO task_run_repos (id, run_id, repo) VALUES ('rr-del', 'run-del', '.')`);
  const res = await call(tasksRouter, "DELETE", "/api/projects/p-tasks/tasks/t-del");
  expect(res.status).toBe(200);
  expect(db.all(sql`SELECT COUNT(*) AS n FROM task_runs WHERE task_id = 't-del'`)[0]).toEqual({ n: 0 });
  expect(db.all(sql`SELECT COUNT(*) AS n FROM task_run_repos WHERE run_id = 'run-del'`)[0]).toEqual({ n: 0 });
});

/** #65: an edit in the task modal must survive the import the Tasks tab runs by itself. */
test("an edit made in the task modal survives the next import", async () => {
  const root2 = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-tasks-manual-"));
  fs.mkdirSync(path.join(root2, "output", "task"), { recursive: true });
  fs.writeFileSync(
    path.join(root2, "output", "task", "task_manual.md"),
    "# Manual\n\n## Task M-1: Judul dari file\n\n- Story Points: 3\n\nIsi dari file.\n",
  );
  db.insert(projects).values({ id: "p-manual", name: "Manual", rootPath: root2 }).run();

  await call(tasksRouter, "POST", "/api/projects/p-manual/tasks/import", {});
  const imported = db.select().from(tasks).where(eq(tasks.projectId, "p-manual")).get()!;

  // The stored body is what the modal edits: no heading, no duplicated metadata,
  // and the `- Story Points` bullet is read (it used to import as null).
  expect(imported.description).toBe("Isi dari file.");
  expect(imported.storyPoints).toBe(3);

  const saved = await call(tasksRouter, "PUT", `/api/projects/p-manual/tasks/${imported.id}`, {
    title: "manual-M-1: Judul diedit manual",
    description: "Konten yang ditulis user di modal edit.\n\n- poin baru",
    storyPoints: 8,
  });
  expect(saved.status).toBe(200);
  expect(JSON.parse(saved.body.manualFieldsJson).sort()).toEqual(["description", "storyPoints", "title"]);

  // What TasksView does on mount and on every file:changed.
  await call(tasksRouter, "POST", "/api/projects/p-manual/tasks/import", {});

  const after = db.select().from(tasks).where(eq(tasks.id, imported.id)).get()!;
  expect(after.title).toBe("manual-M-1: Judul diedit manual");
  expect(after.description).toBe("Konten yang ditulis user di modal edit.\n\n- poin baru");
  expect(after.storyPoints).toBe(8);
});

/** Saving the modal with only the status changed must not freeze the other fields. */
test("an untouched field still follows the file after a modal save", async () => {
  const root3 = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-tasks-partial-"));
  fs.mkdirSync(path.join(root3, "output", "task"), { recursive: true });
  const file = path.join(root3, "output", "task", "task_partial.md");
  fs.writeFileSync(file, "# Partial\n\n## Task P-1: Judul lama\n\nIsi lama.\n");
  db.insert(projects).values({ id: "p-partial", name: "Partial", rootPath: root3 }).run();

  await call(tasksRouter, "POST", "/api/projects/p-partial/tasks/import", {});
  const row = db.select().from(tasks).where(eq(tasks.projectId, "p-partial")).get()!;

  // The modal sends every field; only the status differs from what is stored.
  await call(tasksRouter, "PUT", `/api/projects/p-partial/tasks/${row.id}`, {
    title: row.title,
    description: row.description,
    storyPoints: row.storyPoints,
    status: "in_progress",
  });
  expect(db.select().from(tasks).where(eq(tasks.id, row.id)).get()!.manualFieldsJson).toBeNull();

  fs.writeFileSync(file, "# Partial\n\n## Task P-1: Judul baru dari file\n\nIsi baru dari file.\n");
  await call(tasksRouter, "POST", "/api/projects/p-partial/tasks/import", {});

  const after = db.select().from(tasks).where(eq(tasks.id, row.id)).get()!;
  expect(after.title).toBe("partial-P-1: Judul baru dari file");
  expect(after.description).toBe("Isi baru dari file.");
  expect(after.status).toBe("in_progress");
});

/** #65: an edit in the modal is written back to the task's own .md section. */
test("saving a task writes the edit back to its .md section", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-tasks-write-"));
  fs.mkdirSync(path.join(root, "output", "task"), { recursive: true });
  const file = path.join(root, "output", "task", "task_write.md");
  fs.writeFileSync(
    file,
    [
      "# Write",
      "",
      "## Task W-1: Judul lama",
      "",
      "- Story Points: 3",
      "",
      "Isi lama.",
      "",
      "## Task W-2: Task lain",
      "",
      "Isi lain.",
      "",
    ].join("\n"),
  );
  db.insert(projects).values({ id: "p-write", name: "Write", rootPath: root }).run();

  await call(tasksRouter, "POST", "/api/projects/p-write/tasks/import", {});
  const row = db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, "p-write"))
    .all()
    .find((task: any) => task.code === "write-W-1")!;

  const res = await call(tasksRouter, "PUT", `/api/projects/p-write/tasks/${row.id}`, {
    title: "write-W-1: Judul baru",
    description: "Isi baru dari modal.",
    storyPoints: 5,
  });
  expect(res.status).toBe(200);

  const content = fs.readFileSync(file, "utf8");
  expect(content).toContain("## Task W-1: Judul baru");
  expect(content).toContain("- Story Points: 5");
  expect(content).toContain("Isi baru dari modal.");
  expect(content).not.toContain("Isi lama.");
  // The other card and the header stay untouched.
  expect(content).toContain("## Task W-2: Task lain");
  expect(content).toContain("Isi lain.");
  expect(content.startsWith("# Write")).toBe(true);

  // A status-only save must not rewrite the file.
  const before = fs.readFileSync(file, "utf8");
  await call(tasksRouter, "PUT", `/api/projects/p-write/tasks/${row.id}`, { status: "in_progress" });
  expect(fs.readFileSync(file, "utf8")).toBe(before);
});

/** A card from the H3 fallback (`# Task:` + `### T1 — …`) has no H2 section to match by code. */
test("a card from an H3 fallback file is written back to its own heading", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-tasks-h3-"));
  fs.mkdirSync(path.join(root, "output", "task"), { recursive: true });
  const file = path.join(root, "output", "task", "task_h3.md");
  fs.writeFileSync(
    file,
    ["# Task: Judul induk", "", "### T1 — Ambil data", "", "Isi T1.", "", "### T2 — Simpan data", "", "Isi T2.", ""].join("\n"),
  );
  db.insert(projects).values({ id: "p-h3", name: "H3", rootPath: root }).run();

  await call(tasksRouter, "POST", "/api/projects/p-h3/tasks/import", {});
  const row = db
    .select()
    .from(tasks)
    .where(eq(tasks.projectId, "p-h3"))
    .all()
    .find((task: any) => task.title.includes("Ambil data"))!;
  expect(row).toBeTruthy();

  const res = await call(tasksRouter, "PUT", `/api/projects/p-h3/tasks/${row.id}`, {
    description: "Isi T1 yang baru.",
    storyPoints: 2,
  });
  expect(res.status).toBe(200);
  expect(res.body.fileSync).toEqual({ synced: true });

  const content = fs.readFileSync(file, "utf8");
  expect(content).toContain("### T1 — Ambil data");
  expect(content).toContain("Isi T1 yang baru.");
  expect(content).not.toContain("Isi T1.\n");
  expect(content).toContain("### T2 — Simpan data");
  expect(content).toContain("Isi T2.");
});

/** A section the locator cannot find must not lose the edit. */
test("a missing section still saves the row and reports the file as out of sync", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-tasks-nosync-"));
  fs.mkdirSync(path.join(root, "output", "task"), { recursive: true });
  const file = path.join(root, "output", "task", "task_lost.md");
  fs.writeFileSync(file, "# Lost\n\nTidak ada heading task di sini.\n");
  db.insert(projects).values({ id: "p-lost", name: "Lost", rootPath: root }).run();
  db.insert(tasks)
    .values({
      id: "t-lost",
      projectId: "p-lost",
      code: "lost-1",
      title: "lost-1: Judul hilang",
      description: "Isi lama.",
      status: "todo",
      sourcePath: "output/task/task_lost.md",
    })
    .run();

  const res = await call(tasksRouter, "PUT", "/api/projects/p-lost/tasks/t-lost", { description: "Isi baru." });
  expect(res.status).toBe(200);
  expect(res.body.fileSync.synced).toBe(false);
  expect(res.body.fileSync.error).toContain("tidak ditemukan");

  const saved = db.select().from(tasks).where(eq(tasks.id, "t-lost")).get()!;
  expect(saved.description).toBe("Isi baru.");
  expect(fs.readFileSync(file, "utf8")).toBe("# Lost\n\nTidak ada heading task di sini.\n");
});
