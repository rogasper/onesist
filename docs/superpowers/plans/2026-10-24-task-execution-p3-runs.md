# Eksekusi task — Plan 3: Memulai run (mode `ask`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Geser card ke In Progress (atau "Jalankan") memulai run: satu folder run berisi worktree per repo, satu thread chat dengan agen CLI yang bekerja di folder itu, dan prompt eksekusi yang dikirim lewat chat. Status run mengikuti chat (running, waiting_input, validating, failed) dan tampil di card.

**Scope cut (disetujui sebagai pemisahan):** Plan 3 memakai permission mode `ask` yang sudah ada, supaya tetap sesuai AGENTS.md dan berjalan di semua runtime CLI. Mode `execute` (auto di dalam worktree, tanya di luar) menyentuh 14 file dan lima runtime, jadi dikerjakan sebagai **Plan 3b** setelah ini. Antrian paralel (queued) juga Plan 7: di Plan 3, batas paralel menolak dengan 409.

**Architecture:** Tabel `task_runs` dan `task_run_repos` (migrasi). Service `services/task-runs.ts` berisi logika start, prompt, dan pemetaan event chat ke state run. Worktree dibuat lewat `createWorktree` yang sudah ada, dengan `baseDir` = folder run. Thread dibuat dengan `permissionMode: "ask"` dan workspace diarahkan ke folder run. Client membuka thread lewat `openChatTask`, sama seperti Generate.

**Tech Stack:** Bun test, Drizzle, git lewat `workspace/worktrees.ts`, React 19.

**Spec:** `docs/superpowers/specs/2026-10-24-task-execution-design.md` (bagian 3 Memulai run, 5 Board).

## Global Constraints

- Source code dalam Inggris, teks user dan `json({ error })` dalam Indonesia.
- Run hanya boleh memakai provider CLI (`cliRuntimeFor`). Provider native akan bekerja di root project, jadi ditolak.
- Folder run harus di luar project root (`isInside` yang sudah dipakai `createWorktree`).
- Tidak ada push, PR, atau merge. Tidak ada polling: state run datang dari event `chat:run`, `chat:question`, dan `chat:question-resolved`.

## Review Focus

1. **Run dimulai padahal task belum siap** (scope/AC/repo kosong, atau dependensi belum selesai). → server menolak, bukan hanya UI. Task 2.
2. **Dua run aktif untuk satu task** lewat klik ganda. → cek run aktif per task. Task 2.
3. **Provider native dipilih untuk run**, sehingga agen mengedit root project. → ditolak. Task 2.
4. **Worktree gagal di repo kedua** setelah repo pertama sudah dibuat. → run ditandai `failed` dengan pesan, dan worktree yang sudah dibuat tetap ada dan tercatat. Task 2.
5. **Event chat untuk thread lain** atau event yang tidak dikenal mengubah state run. → hanya thread milik run yang dipetakan. Task 3.

---

### Task 1: Tabel run

**Files:** `src/server/db/schema.ts`, migrasi baru, `src/shared/types.ts`.

- `taskRuns`: `id` (PK), `taskId`, `projectId`, `threadId`, `bundlePath`, `providerId`, `model`, `state` (default `running`), `revision` (default 1), `integration` (default `pr`), `error`, `createdAt`, `startedAt`, `endedAt`, `updatedAt`.
- `taskRunRepos`: `id` (PK), `runId`, `repo`, `worktreePath`, `branch`, `baseBranch`, `baseCommit`.
- Tipe bersama `RunSummary`: `{ id, taskId, threadId, state, bundlePath, repos: { repo, branch, worktreePath }[], error, createdAt, updatedAt }`.
- Tes: DB baru boot tanpa error dan kedua tabel ada. Tambahkan penghapusan run dan run_repos di delete proyek dan delete task (di `index.ts` dan `tasks.ts`), sebelum parent-nya.

### Task 2: Service start run

**Files:** `src/server/services/task-runs.ts`, `task-runs.test.ts`.

- `buildRunPrompt(input)` (murni): memuat judul, deskripsi, AC (daftar), file scope, folder run, daftar repo dengan path worktree-nya, dependensi yang sudah selesai, aturan (kerja hanya di folder run, jangan commit, jangan push, tanya kalau ambigu), dan blok penutup ` ```onesist-report ` (dipakai Plan 4).
- `startTaskRun({ projectId, root, task, baseDir, maxParallel, baseBranches, now })` → `{ ok: true, run, threadId, text, title }` atau `{ ok: false, status, error }`. Urutan cek: provider CLI valid (`execProviderId` dan `getProvider` + `cliRuntimeFor`); task siap (`readinessProblems` dengan jumlah repo); tidak ada run aktif untuk task; jumlah run aktif di proyek < `maxParallel`; repo ditentukan (`reposJson` atau satu-satunya repo) dan semuanya ada di `listProjectRepos`.
- Buat folder `<baseDir>/runs/<runId>`, lalu `createWorktree` per repo dengan branch `onesist/<slug(code)>-<6 karakter akhir runId>`. Gagal di repo mana pun → state `failed`, error ditulis, worktree yang sudah ada tetap tercatat di `task_run_repos`.
- Buat thread (`createThread`, `permissionMode: "ask"`, `providerId`, `model` dari setting) lalu `updateThread` dengan `workspaceStrategy: "worktree"`, `workspaceRepo` (repo pertama), `workspacePath` = folder run, `workspaceBranch` (hanya jika satu repo).
- Set `tasks.status = "in_progress"`.
- Tes: task tanpa AC → 409 dengan pesan Indonesia; provider native → ditolak; dua start berurutan → kedua tapi kedua ditolak 409; repo git sementara dengan dua worktree tercatat dan thread punya `workspacePath` folder run; `buildRunPrompt` memuat folder run dan kriteria.

### Task 3: Event chat → state run

**Files:** `task-runs.ts` (bagian listener), `task-runs.test.ts`.

- `applyRunEvent(type, data)` (murni terhadap DB): `chat:question` untuk thread run → `waiting_input`; `chat:question-resolved` → `running`; `chat:run` status `done` → `validating` (Plan 4 yang memvalidasi); `error`, `stopped`, `interrupted` → `failed` dengan `error` dari event. Thread yang bukan run diabaikan.
- Daftarkan `eventBus.on` sekali di modul ini, sama seperti `queue.ts`.
- Tes: langsung memanggil `applyRunEvent` dengan thread run dan thread lain.

### Task 4: Route

**Files:** `src/server/routes/projects/task-runs.ts`, `task-runs.test.ts`, `src/server/routes/index.ts`.

- `POST /api/projects/:id/tasks/:taskId/runs` → 201 `{ runId, threadId, title, text }`, atau status dari service.
- `GET /api/projects/:id/task-runs` → run terbaru per task untuk proyek (`RunSummary[]`).
- Tes: POST untuk task siap menghasilkan thread, GET mengembalikan run itu; POST untuk task tidak siap → 409.

### Task 5: Client

**Files:** `src/lib/use-task-runs.ts`, `src/components/tasks/TaskBoard.tsx`, `TaskBoardCard.tsx`, `TasksView.tsx`.

- `useTaskRuns(projectId)`: GET saat mount, dan GET ulang saat `chat:run`, `chat:question`, atau `chat:question-resolved` datang (`subscribe` dari `lib/event-stream`). Tidak ada polling.
- Geser ke In Progress (execution aktif, task siap, tidak terkunci) memanggil `startRun`: POST runs, lalu `openChatTask({ threadId, text })`. Task diperbarui di state lokal dengan status `in_progress`.
- Card menampilkan badge state run: "Berjalan", "Butuh jawaban" (klik membuka chat), "Menunggu validasi", "Gagal" (dengan pesan error sebagai `title`).
- Error start tampil sebagai pesan di atas board.

### Task 6: Verifikasi

- `bun test src` dan `bun run typecheck` hijau.
- Browser: karena butuh agen CLI dan repo sungguhan, alur sampai agen bekerja belum bisa diuji di sini. Dilaporkan terbuka.

---

## Selesai =

Geser task siap ke In Progress membuat folder run, worktree, dan thread chat yang bekerja di folder itu. Task tidak siap, provider native, dan run kedua ditolak di server. State run muncul di card. Mode `execute` dan antrian belum termasuk.
