# Eksekusi task — Plan 1: Data, Board manual, mode proyek

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fondasi eksekusi tanpa eksekusi: status `in_review`, kolom eksekusi di `tasks`, pengaturan eksekusi per proyek (termasuk mode `execution | delivery`), dan Board 4 kolom dengan drag & drop manual, kunci dependensi, serta urutan timeline.

**Architecture:** Aturan status dan urutan ditaruh di dua modul murni di `src/lib/` (`task-status.ts`, `task-board.ts`) yang dipakai server dan client. Pengaturan proyek disimpan di tabel baru `project_exec_settings` dan diakses lewat service kecil + route `/api/projects/:id/exec-settings`. Board adalah view baru di `components/tasks/` dan memakai `handleStatusChange` yang sudah ada di `TasksView`.

**Tech Stack:** Bun test, Drizzle + Bun SQLite (migrasi drizzle-kit), React 19, kumo + Tailwind 4, HTML5 drag & drop native (tanpa dependensi baru).

**Spec:** `docs/superpowers/specs/2026-10-24-task-execution-design.md` (bagian 1 Model data, 2 Kesiapan, khusus kunci dependensi, 5 UI board, dan keputusan #10/#14). Roadmap: `docs/superpowers/plans/2026-10-24-task-execution-roadmap.md`.

## Global Constraints

- Nilai status: `todo`, `in_progress`, `in_review`, `done`. `done` **tidak di-rename**. Kolom board: To Do / In Progress / In Review / Completed.
- Source code (komentar, identifier, log) dalam bahasa **Inggris**. Semua teks yang dilihat user, termasuk `json({ error })`, dalam bahasa **Indonesia**.
- Setiap migrasi: `schema.ts` + file SQL di `src/server/db/migrations/` (via `bun run db:generate`) harus sinkron. Tes dengan DB baru.
- Setiap `fetch("/api/...")` di frontend memakai `{ cache: "no-store" }`. Tidak ada polling. Pembaruan lewat SSE yang sudah ada.
- Warna memakai token kumo (`kumo-default`, `kumo-subtle`, `kumo-brand`, `kumo-elevated`, `kumo-line`). Hindari hex.
- Menghapus proyek harus menghapus baris anak baru sebelum baris `projects`.
- `bun run typecheck` dan `bun test src` hijau sebelum setiap commit.
- Default pengaturan: `taskMode = "execution"`, `maxParallel = 2`, `integration = "pr"`.

## Review Focus

1. **Status lama atau aneh** (`null`, `"review"`, `"blocked"`, string kosong) dari DB lama: card harus tetap muncul di To Do, tidak hilang dari board maupun List. → tes `normalizeStatus` di Task 1.
2. **Siklus dependensi** (A butuh B, B butuh A) atau self-dependency: pengurutan tidak boleh loop atau crash, dan semua task tetap tampil. → tes `orderTasks` di Task 4.
3. **Dependensi ke kode yang tidak ada** (task dihapus atau salah ketik): tidak boleh mengunci task selamanya. Card menampilkan "dependensi tidak ditemukan", tapi tidak terkunci. → tes `dependencyState` di Task 4.
4. **`dependenciesJson` rusak** (bukan JSON, bukan array, berisi angka): diperlakukan sebagai tanpa dependensi, tanpa crash. → tes di Task 4.
5. **Impor ulang task** setelah user mengisi status `in_review` dan field eksekusi: status, `execProviderId`, `execModel`, dan `reposJson` tidak boleh tertimpa. → tes di Task 2.

---

### Task 1: Modul status task

**Files:**
- Create: `src/lib/task-status.ts`
- Create: `src/lib/task-status.test.ts`

**Interfaces:**
- Produces:
  - `export const TASK_STATUSES = ["todo", "in_progress", "in_review", "done"] as const;`
  - `export type TaskStatus = (typeof TASK_STATUSES)[number];`
  - `export function isTaskStatus(v: unknown): v is TaskStatus`
  - `export function normalizeStatus(v: unknown): TaskStatus`: nilai tak dikenal menjadi `"todo"`.
  - `export const STATUS_LABELS: Record<TaskStatus, string>` = `{ todo: "To Do", in_progress: "In Progress", in_review: "In Review", done: "Completed" }`

- [ ] **Step 1: Tulis tes yang gagal**

```ts
import { expect, test } from "bun:test";
import { TASK_STATUSES, isTaskStatus, normalizeStatus, STATUS_LABELS } from "./task-status";

test("the four statuses keep done as the stored value for Completed", () => {
  expect(TASK_STATUSES).toEqual(["todo", "in_progress", "in_review", "done"]);
  expect(STATUS_LABELS.done).toBe("Completed");
  expect(STATUS_LABELS.in_review).toBe("In Review");
});

test("unknown or legacy statuses fall back to todo", () => {
  for (const v of [null, undefined, "", "review", "blocked", 3]) expect(normalizeStatus(v)).toBe("todo");
  expect(normalizeStatus("in_review")).toBe("in_review");
  expect(isTaskStatus("done")).toBe(true);
  expect(isTaskStatus("review")).toBe(false);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**: `bun test src/lib/task-status.test.ts`. Harapan: FAIL (module not found).
- [ ] **Step 3: Implementasikan `src/lib/task-status.ts`** sesuai Interfaces.
- [ ] **Step 4: Jalankan dan pastikan lolos**: `bun test src/lib/task-status.test.ts`. Harapan: PASS.
- [ ] **Step 5: Commit**: `git add src/lib/task-status.ts src/lib/task-status.test.ts && git commit -m "feat(tasks): shared task status model with in_review"`

---

### Task 2: Skema, migrasi, dan route task

**Files:**
- Modify: `src/server/db/schema.ts` (tabel `tasks`, ditambah tabel baru `projectExecSettings`)
- Create: `src/server/db/migrations/0024_*.sql` + snapshot/journal (hasil `bun run db:generate`)
- Modify: `src/shared/types.ts` (`Task`)
- Modify: `src/server/routes/projects/tasks.ts` (POST, PUT, bulk)
- Modify: `src/server/routes/projects/index.ts` (delete proyek)
- Create: `src/server/routes/projects/tasks.test.ts`

**Interfaces:**
- Consumes: `isTaskStatus`, `normalizeStatus` (Task 1).
- Produces:
  - Kolom `tasks`: `execProviderId: text("exec_provider_id")`, `execModel: text("exec_model")`, `reposJson: text("repos_json")`, semuanya nullable.
  - Tabel `projectExecSettings = sqliteTable("project_exec_settings", { projectId: text("project_id").primaryKey().references(() => projects.id), taskMode: text("task_mode").notNull().default("execution"), execProviderId: text("exec_provider_id"), execModel: text("exec_model"), reviewerProviderId: text("reviewer_provider_id"), reviewerModel: text("reviewer_model"), maxParallel: integer("max_parallel").notNull().default(2), integration: text("integration").notNull().default("pr"), baseBranchesJson: text("base_branches_json"), updatedAt: text("updated_at") })`
  - `Task` di `shared/types.ts` mendapat `execProviderId: string | null; execModel: string | null; reposJson: string | null;`
  - PUT `/api/projects/:id/tasks/:taskId` menerima `execProviderId`, `execModel`, `reposJson`, dan menjawab `400 { error: "Status tidak dikenal" }` untuk status di luar `TASK_STATUSES`. Bulk dan POST memakai aturan yang sama.

- [ ] **Step 1: Tulis tes yang gagal** di `tasks.test.ts`, dengan pola setup seperti `agent-tasks.test.ts` (`SA_DB_PATH` sementara, `router.handle(new Request(...))`):

```ts
test("PUT accepts in_review and the execution fields", async () => {
  // seed project 'p-tasks' + task 't1' via db.insert
  const res = await put("p-tasks", "t1", { status: "in_review", execProviderId: "prov-1", execModel: "m-1", reposJson: '["input/code/api"]' });
  expect(res.status).toBe(200);
  expect(res.body.status).toBe("in_review");
  expect(res.body.execModel).toBe("m-1");
  expect(res.body.reposJson).toBe('["input/code/api"]');
});

test("PUT and bulk reject an unknown status", async () => {
  expect((await put("p-tasks", "t1", { status: "review" })).status).toBe(400);
  expect((await post("p-tasks/tasks/bulk", { ids: ["t1"], patch: { status: "blocked" } })).status).toBe(400);
});

test("re-import keeps status and execution fields", async () => {
  // root fixture: output/task/T-01.md parsed as code T-01; seed task code T-01 with status in_review + execModel 'm-1' + reposJson
  await post("p-tasks/tasks/import", {});
  const row = db.select().from(tasks).where(eq(tasks.code, "T-01")).get()!;
  expect(row.status).toBe("in_review");
  expect(row.execModel).toBe("m-1");
  expect(row.reposJson).toBe('["input/code/api"]');
});

test("deleting a project removes its exec settings first", async () => {
  // seed project 'p-del' + project_exec_settings row; call projects router DELETE /api/projects/p-del
  expect(status).toBe(200);
  expect(db.select().from(projectExecSettings).where(eq(projectExecSettings.projectId, "p-del")).all()).toHaveLength(0);
});
```

Format file task untuk fixture impor diambil dari tes atau fixture `task-parser` yang sudah ada (`src/lib/task-parser.ts`). Pakai satu file minimal yang menghasilkan kode `T-01`.

- [ ] **Step 2: Jalankan dan pastikan gagal**: `bun test src/server/routes/projects/tasks.test.ts`. Harapan: FAIL (kolom atau tabel tidak ada, 400 belum ada).
- [ ] **Step 3: Ubah `schema.ts`** sesuai Interfaces, lalu jalankan `bun run db:generate`. Periksa file `0024_*.sql`: harus berisi `ALTER TABLE tasks ADD ...` ×3 dan `CREATE TABLE project_exec_settings`.
- [ ] **Step 4: Ubah route**: PUT/POST/bulk memvalidasi status dengan `isTaskStatus` dan meneruskan tiga field baru. Delete proyek di `routes/projects/index.ts` menjalankan `db.delete(projectExecSettings).where(eq(projectExecSettings.projectId, id))` sebelum `db.delete(projects)`. Delete per task tidak perlu berubah di plan ini. Tambah tiga field ke `Task`.
- [ ] **Step 5: Jalankan dan pastikan lolos**: `bun test src/server/routes/projects/tasks.test.ts && bun run typecheck`. Harapan: PASS, tanpa error tipe.
- [ ] **Step 6: Tes DB baru**: `SA_DB_PATH=$(mktemp -d)/fresh.db bun -e "await import('./src/server/db/client.ts'); console.log('ok')"`. Harapan: `ok` tanpa `no such table`/`no such column`.
- [ ] **Step 7: Commit**: `git add src/server/db src/shared/types.ts src/server/routes/projects && git commit -m "feat(tasks): in_review status, execution columns, project_exec_settings table"`

---

### Task 3: Service dan route pengaturan eksekusi

**Files:**
- Create: `src/server/services/exec-settings.ts`
- Create: `src/server/routes/projects/exec-settings.ts`
- Create: `src/server/routes/projects/exec-settings.test.ts`
- Modify: `src/server/routes/index.ts` (daftarkan router)
- Modify: `AGENTS.md` (tabel API Endpoints: tambah baris `/api/projects/:id/exec-settings | GET, PUT | Pengaturan eksekusi task per proyek (mode, agen/model default, reviewer, paralel, integrasi)`)

**Interfaces:**
- Consumes: `projectExecSettings` (Task 2).
- Produces:
  - `export type TaskMode = "execution" | "delivery";`
  - `export type Integration = "pr" | "branch" | "merge";`
  - `export interface ExecSettings { taskMode: TaskMode; execProviderId: string | null; execModel: string | null; reviewerProviderId: string | null; reviewerModel: string | null; maxParallel: number; integration: Integration; baseBranches: Record<string, string>; }`
  - `export function getExecSettings(projectId: string): ExecSettings`: tanpa baris, mengembalikan default (`execution`, null ×4, `2`, `"pr"`, `{}`).
  - `export function updateExecSettings(projectId: string, patch: Partial<ExecSettings>): { ok: true; settings: ExecSettings } | { ok: false; error: string }`: upsert. Validasi: `taskMode` ∈ dua nilai, `integration` ∈ tiga nilai, `maxParallel` bilangan bulat 1–8. Error dalam bahasa Indonesia, misalnya `"Batas paralel harus 1–8"`.
  - Route: `GET /api/projects/:id/exec-settings` → `ExecSettings` (404 kalau proyek tidak ada). `PUT` → `ExecSettings` atau `400 { error }`.
  - Tipe `ExecSettings`, `TaskMode`, dan `Integration` juga diekspor dari `src/shared/types.ts` supaya client tidak mengimpor kode server. Service mengimpor dari sana.

- [ ] **Step 1: Tulis tes yang gagal**:

```ts
test("a project without a row gets the defaults", async () => {
  const { status, body } = await get("p-exec");
  expect(status).toBe(200);
  expect(body).toEqual({ taskMode: "execution", execProviderId: null, execModel: null, reviewerProviderId: null, reviewerModel: null, maxParallel: 2, integration: "pr", baseBranches: {} });
});

test("PUT stores a partial patch and returns the merged settings", async () => {
  const { body } = await putSettings("p-exec", { taskMode: "delivery", maxParallel: 3 });
  expect(body.taskMode).toBe("delivery");
  expect(body.maxParallel).toBe(3);
  expect(body.integration).toBe("pr");
  expect((await get("p-exec")).body.taskMode).toBe("delivery");
});

test("PUT rejects invalid values", async () => {
  expect((await putSettings("p-exec", { taskMode: "auto" })).status).toBe(400);
  expect((await putSettings("p-exec", { maxParallel: 0 })).status).toBe(400);
  expect((await putSettings("p-exec", { integration: "push" })).status).toBe(400);
});

test("an unknown project is 404", async () => {
  expect((await get("nope")).status).toBe(404);
});
```

- [ ] **Step 2: Jalankan dan pastikan gagal**: `bun test src/server/routes/projects/exec-settings.test.ts`. Harapan: FAIL.
- [ ] **Step 3: Implementasikan service + route** sesuai Interfaces (`getProject` dari `http/route-utils` untuk 404), lalu daftarkan router di `routes/index.ts` dan tambah baris di tabel AGENTS.md.
- [ ] **Step 4: Jalankan dan pastikan lolos**: `bun test src/server/routes/projects/exec-settings.test.ts && bun run typecheck`. Harapan: PASS.
- [ ] **Step 5: Commit**: `git commit -am "feat(tasks): per-project execution settings API"` (sertakan file baru dengan `git add` dulu).

---

### Task 4: Urutan board dan kunci dependensi

**Files:**
- Create: `src/lib/task-board.ts`
- Create: `src/lib/task-board.test.ts`

**Interfaces:**
- Consumes: `Task` (Task 2), `normalizeStatus`, `TaskStatus` (Task 1).
- Produces:
  - `export function parseDependencies(json: string | null): string[]`: hanya string tidak kosong. JSON rusak atau bukan array menghasilkan `[]`.
  - `export function taskKey(t: Task): string`: `t.code ?? t.title.split(":")[0].trim()` (sama dengan kunci impor).
  - `export interface DependencyState { locked: boolean; waitingOn: string[]; missing: string[] }`
  - `export function dependencyState(task: Task, byKey: Map<string, Task>): DependencyState`: `waitingOn` = dependensi yang ada dan statusnya bukan `done` (task archived dianggap selesai). `missing` = kode yang tidak ditemukan atau menunjuk dirinya sendiri, dan tidak mengunci. `locked = waitingOn.length > 0`.
  - `export function orderTasks(tasks: Task[]): Task[]`: urutan timeline: fase (natural sort, `null` di akhir), lalu topologis menurut dependensi di dalam daftar, lalu kode (natural sort, `localeCompare` dengan `{ numeric: true }`). Siklus diputus dengan mengambil node tersisa berkode terkecil. Tidak pernah membuang task.
  - `export function groupByStatus(tasks: Task[]): Record<TaskStatus, Task[]>`: memakai `normalizeStatus` dan mempertahankan urutan input.

- [ ] **Step 1: Tulis tes yang gagal**, dengan helper `mk(code, { status?, deps?, phase?, archived? })` yang membangun `Task`:

```ts
test("dependencies that are done or archived do not lock; others do", () => {
  const a = mk("A", { status: "done" }), b = mk("B", { archived: true, status: "todo" }), c = mk("C", { status: "in_review" });
  const t = mk("T", { deps: ["A", "B", "C"] });
  const by = new Map([a, b, c, t].map((x) => [taskKey(x), x]));
  expect(dependencyState(t, by)).toEqual({ locked: true, waitingOn: ["C"], missing: [] });
});

test("missing and self dependencies are reported but never lock", () => {
  const t = mk("T", { deps: ["T", "GONE"] });
  expect(dependencyState(t, new Map([["T", t]]))).toEqual({ locked: false, waitingOn: [], missing: ["T", "GONE"] });
});

test("malformed dependency json reads as none", () => {
  for (const j of ["not json", '{"a":1}', "[1, null, \"\"]", null]) expect(parseDependencies(j)).toEqual([]);
});

test("order is phase, then dependencies, then code", () => {
  const out = orderTasks([mk("P2-1", { phase: "Fase 2" }), mk("B", { phase: "Fase 1", deps: ["C"] }), mk("C", { phase: "Fase 1" }), mk("A10", { phase: "Fase 1" }), mk("A2", { phase: "Fase 1" }), mk("X", {})]);
  expect(out.map(taskKey)).toEqual(["A2", "A10", "C", "B", "P2-1", "X"]);
});

test("a dependency cycle keeps every task and terminates", () => {
  const out = orderTasks([mk("A", { deps: ["B"] }), mk("B", { deps: ["A"] }), mk("C", {})]);
  expect(out.map(taskKey).sort()).toEqual(["A", "B", "C"]);
});

test("grouping puts legacy statuses in todo", () => {
  const g = groupByStatus([mk("A", { status: "review" as any }), mk("B", { status: "done" })]);
  expect(g.todo.map(taskKey)).toEqual(["A"]);
  expect(g.done.map(taskKey)).toEqual(["B"]);
  expect(g.in_review).toEqual([]);
});
```

Catatan untuk tes urutan: di Fase 1, A2 dan A10 tidak punya dependensi, C tidak punya dependensi, dan B butuh C. Topological sort yang stabil (ambil yang siap, dengan kode terkecil lebih dulu) menghasilkan A2, A10, C, B.

- [ ] **Step 2: Jalankan dan pastikan gagal**: `bun test src/lib/task-board.test.ts`. Harapan: FAIL.
- [ ] **Step 3: Implementasikan `src/lib/task-board.ts`** sesuai Interfaces. Topological sort Kahn per fase, dengan antrian yang selalu diurutkan menurut kode natural sort, dan pemutus siklus seperti di atas. Dependensi ke task di fase lain diabaikan untuk urutan di dalam fase.
- [ ] **Step 4: Jalankan dan pastikan lolos**: `bun test src/lib/task-board.test.ts`. Harapan: PASS.
- [ ] **Step 5: Commit**: `git add src/lib/task-board.* && git commit -m "feat(tasks): timeline ordering and dependency lock for the board"`

---

### Task 5: Board view dan pembaruan List

**Files:**
- Create: `src/components/tasks/TaskBoard.tsx`
- Create: `src/components/tasks/TaskBoardCard.tsx`
- Modify: `src/components/tasks/TaskList.tsx` (`TaskViewMode` menjadi `"list" | "cards" | "board"`, `STATUS_STYLES` memakai `STATUS_LABELS` + gaya untuk `in_review`)
- Modify: `src/components/tasks/TasksView.tsx` (toggle Board, `STATUS_FILTERS` ditambah `in_review`, mode view diingat per proyek)

**Interfaces:**
- Consumes: `orderTasks`, `groupByStatus`, `dependencyState`, `taskKey` (Task 4), `STATUS_LABELS`, `TaskStatus` (Task 1), `handleStatusChange(taskId: string, status: string)` yang sudah ada di `TasksView`, `ConfirmDialog` dari `components/ui/`.
- Produces: `export function TaskBoard(props: { tasks: Task[]; allTasks: Task[]; onStatusChange: (taskId: string, status: TaskStatus) => void; onOpenTask: (task: Task) => void })`. `tasks` = hasil filter yang ditampilkan. `allTasks` = semua task proyek (untuk menghitung dependensi, supaya filter tidak membuat task tampak tidak terkunci).

- [ ] **Step 1: Implementasikan `TaskBoardCard`**: kode, judul, label `critical`/`risk`, SP, jumlah AC (`acceptanceCriteriaJson` di-parse aman), dan assignee. Kalau `locked`, tampilkan chip `🔒 menunggu <kode, kode>` dan card diredupkan. Kalau `missing` tidak kosong, tampilkan chip `dependensi tidak ditemukan: <kode>`. Task tanpa scope dan AC mendapat chip `manual`. Klik card memanggil `onOpenTask`, dengan perilaku yang sama seperti membuka task di List.
- [ ] **Step 2: Implementasikan `TaskBoard`**: empat kolom sesuai `TASK_STATUSES` dengan judul `STATUS_LABELS` dan jumlahnya. Isi kolom = `groupByStatus(orderTasks(tasks))`. Drag & drop HTML5 (`draggable`, `onDragStart` menyimpan id, `onDrop` di kolom). Drop ke kolom yang sama tidak melakukan apa-apa. Menggeser card yang `locked` ke `in_progress` membuka `ConfirmDialog` dengan judul `"Dependensi belum selesai"` dan isi `"<kode> masih menunggu <kode, kode>. Pindahkan tetap?"`, lalu `onStatusChange` dipanggil hanya kalau dikonfirmasi. Kolom bisa di-scroll sendiri. Board bisa di-scroll horizontal di lebar sempit, dan setiap kolom minimal 240px.
- [ ] **Step 3: Sambungkan di `TasksView`**: tombol chip ketiga `Board` (ikon `Kanban` dari `@phosphor-icons/react`) di sebelah List/Cards. Kalau `viewMode === "board"`, render `TaskBoard` dengan `filteredTasks` dan semua task non-archived. Pilihan view disimpan di `localStorage` dengan kunci `onesist:tasks-view:<projectId>`, dan setiap baca/tulis dibungkus `try/catch`. `STATUS_FILTERS` ditambah `{ value: "in_review", label: "In Review" }`, dan label `done` menjadi `"Completed"`.
- [ ] **Step 4: Perbarui badge List**: `STATUS_STYLES` di `TaskList.tsx` memakai `STATUS_LABELS` dan menambah `in_review` dengan gaya sky/cyan, mengikuti pola kelas yang sudah ada di file itu. Badge memanggil `normalizeStatus` dulu.
- [ ] **Step 5: Verifikasi**: `bun run typecheck && bun test src`. Harapan: hijau. Lalu jalankan `bun run dev`, buka tab Tasks di proyek yang punya task, dan cek:
  1. Board tampil dengan 4 kolom.
  2. Card bisa digeser antar kolom, dan statusnya tersimpan setelah reload.
  3. Card terkunci memunculkan konfirmasi.
  4. List menampilkan badge "In Review"/"Completed".
  5. Filter status "In Review" berfungsi.
  6. Pilihan Board tetap terpilih setelah reload.
- [ ] **Step 6: Commit**: `git add src/components/tasks && git commit -m "feat(tasks): kanban board view with dependency lock"`

---

### Task 6: Panel pengaturan task dan mode proyek

**Files:**
- Create: `src/lib/use-exec-settings.ts`
- Create: `src/components/settings/TaskExecutionPanel.tsx`
- Modify: `src/routes/projects.$id.settings.tsx` (tab baru `task`, label `"Task"`)

**Interfaces:**
- Consumes: route `GET/PUT /api/projects/:id/exec-settings` (Task 3), `ExecSettings` dari `src/shared/types.ts`.
- Produces: `export function useExecSettings(projectId: string): { settings: ExecSettings | null; loading: boolean; error: string | null; save: (patch: Partial<ExecSettings>) => Promise<boolean> }`. Plan 2–7 memakai `settings.taskMode === "delivery"` untuk menyembunyikan kontrol eksekusi.

- [ ] **Step 1: Implementasikan `useExecSettings`**: fetch dengan `{ cache: "no-store" }` saat mount dan saat `projectId` berubah. `save` memanggil PUT, lalu memperbarui state dari jawaban server. Kalau server menjawab 400, `error` berisi pesan dari server.
- [ ] **Step 2: Implementasikan `TaskExecutionPanel`**: pilihan mode dengan dua opsi, **"Eksekusi oleh agen"** (`execution`) dan **"Delivery saja"** (`delivery`), dengan teks bantu `"Task hanya dilihat dan dikelola seperti biasa, tanpa tombol eksekusi."`. Di plan ini, panel hanya berisi mode. Field agen/model, reviewer, paralel, dan integrasi ditambahkan di plan yang memakainya. Simpan langsung saat pilihan berubah, lalu tampilkan `"Tersimpan"` atau pesan error.
- [ ] **Step 3: Tambahkan tab `task`** di halaman settings proyek, dengan pola `Section` yang sama seperti tab `subagent`.
- [ ] **Step 4: Verifikasi**: `bun run typecheck`. Lalu di `bun run dev`, buka Settings → Task, ganti mode ke "Delivery saja", reload, dan pastikan pilihannya tetap. Cek juga `GET /api/projects/<id>/exec-settings` mengembalikan `taskMode: "delivery"`.
- [ ] **Step 5: Commit**: `git add src/lib/use-exec-settings.ts src/components/settings/TaskExecutionPanel.tsx "src/routes/projects.\$id.settings.tsx" && git commit -m "feat(settings): task execution panel with delivery mode"`

---

## Selesai = 

`bun test src` dan `bun run typecheck` hijau. DB baru bisa boot. Board bisa dipakai manual tanpa agen, List dan data lama tetap sama (kecuali label `done` menjadi "Completed"), dan mode proyek tersimpan. Setelah itu, tulis Plan 2 (Readiness + Lengkapi dengan AI) dari roadmap.
