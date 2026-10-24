# Eksekusi task — Plan 2: Repo, kesiapan, dan Lengkapi dengan AI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Board tahu repo target dan kesiapan tiap task (repo, file scope, acceptance criteria). Task yang belum siap tidak bisa digeser ke In Progress; dialognya menawarkan **Lengkapi dengan AI**, yang membuat usulan dari thread read-only dan baru ditulis setelah user menyimpan. Impor ulang tidak lagi menghapus scope/AC yang sudah diisi.

**Architecture:** Deteksi repo dan pembacaan konfigurasi ada di service server (`services/task-repos.ts`, `services/task-checks.ts`). Aturan kesiapan adalah fungsi murni di `src/lib/task-readiness.ts` yang dipakai board. Lengkapi memakai pola Generate yang sudah ada: server membuat thread `readonly` dan prompt-nya (`services/task-fill.ts`), client membukanya lewat `openChatTask`, lalu usulan dibaca dari jawaban agen terakhir dan divalidasi server sebelum ditulis.

**Tech Stack:** Bun test, Drizzle, `git` lewat `execFileSync`, React 19 + kumo. Tidak ada dependensi baru.

**Spec:** `docs/superpowers/specs/2026-10-24-task-execution-design.md` (bagian 2 Kesiapan task, dan bagian 1 `checks`). Plan 1: `2026-10-24-task-execution-p1-board.md`.

## Global Constraints

- Komentar, identifier, dan log dalam bahasa Inggris. Teks yang dilihat user dan semua `json({ error })` dalam bahasa Indonesia.
- Tidak ada yang ditulis ke `tasks` atau berkas repo sebelum user menekan Simpan. Thread Lengkapi selalu `permissionMode: "readonly"`.
- Client memakai `{ cache: "no-store" }` di setiap `fetch`. Tidak ada polling: hasil run datang lewat `chat:run`.
- Tidak ada push. Tidak ada perubahan di repo user kecuali `.agents/onesist-worktree.json` di root proyek, dan itu hanya lewat endpoint checks.

## Review Focus

1. **Impor ulang menghapus scope/AC manual** ketika file task tidak punya nilainya. → Task 3.
2. **Repo tanpa `.git`, atau `input/code/` tidak ada**: deteksi tetap jalan dan tidak melempar error. → Task 1.
3. **JSON usulan agen rusak, kosong, atau berisi path `../`/absolut**: ditolak tanpa menulis apa pun. → Task 5.
4. **Usulan menyebut repo yang tidak ada**: ditolak untuk repo itu, sisanya tetap diproses. → Task 5.
5. **`.agents/onesist-worktree.json` rusak atau tidak ada**: dibaca sebagai kosong, dan saat disimpan `setup` yang sudah ada tidak hilang. → Task 4.

---

### Task 1: Deteksi repo

**Files:**
- Create: `src/server/services/task-repos.ts`, `src/server/services/task-repos.test.ts`
- Create: `src/server/routes/projects/task-repos.ts` (GET `/api/projects/:id/repos`)
- Modify: `src/server/routes/index.ts` (daftarkan router)

**Interfaces:**
- Produces: `export interface RepoInfo { id: string; path: string; isGit: boolean; baseBranch: string | null }`, `export function listRepos(root: string): RepoInfo[]`. `id` = `"."` untuk root (hanya jika `<root>/.git` ada), atau `input/code/<nama>` untuk folder di `input/code/` yang punya `.git`. Urutan: root dulu, lalu nama. `baseBranch` = `git rev-parse --abbrev-ref HEAD` (null jika gagal).
- Route GET → `{ repos: RepoInfo[] }`, 404 jika proyek tidak punya root.

- [ ] **Step 1: Tes gagal** (`task-repos.test.ts`): buat root sementara dengan `git init -b main`, commit kosong (`git -c user.name=t -c user.email=t@t commit --allow-empty -m init`), satu repo di `input/code/api` yang juga di-init, dan folder `input/code/notes` tanpa `.git`. Harapan: `listRepos` mengembalikan `["." , "input/code/api"]`, `baseBranch` = `"main"`, dan root kosong tanpa `.git` mengembalikan `[]` tanpa error.
- [ ] **Step 2: Jalankan dan pastikan gagal**.
- [ ] **Step 3: Implementasi.** Gunakan `execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd, stdio: ["ignore", "pipe", "ignore"] })` dalam `try/catch`.
- [ ] **Step 4: Jalankan tes dan typecheck, lalu commit**: `feat(tasks): detect project repos`.

---

### Task 2: Aturan kesiapan (murni)

**Files:**
- Create: `src/lib/task-readiness.ts`, `src/lib/task-readiness.test.ts`

**Interfaces:**
- Produces:
  - `export type ReadinessProblem = "repo" | "scope" | "criteria";`
  - `export function readinessProblems(task: Task, repoCount: number): ReadinessProblem[]`: `repo` jika `reposJson` kosong dan `repoCount !== 1`; `scope` jika `filesScopeJson` tidak berisi array tidak kosong; `criteria` jika `acceptanceCriteriaJson` tidak berisi array tidak kosong. Urutan: repo, scope, criteria. JSON rusak dihitung sebagai kosong.
  - `export const PROBLEM_LABELS: Record<ReadinessProblem, string>` = `{ repo: "repo", scope: "file scope", criteria: "acceptance criteria" }`.

- [ ] **Step 1: Tes gagal**: task lengkap (repo satu, scope, AC) → `[]`; repo kosong dengan `repoCount=2` → `["repo", ...]`; repo kosong dengan `repoCount=1` → tidak ada `repo`; JSON rusak `"{"` di scope → `scope`; AC `"[]"` → `criteria`.
- [ ] **Step 2–4:** jalankan gagal, implementasi, jalankan lolos. Commit: `feat(tasks): readiness rules for execution`.

---

### Task 3: Impor ulang tidak menghapus scope/AC yang sudah diisi

**Files:**
- Modify: `src/server/routes/projects/tasks.ts` (rute `tasks/import`, bagian `values`)
- Modify: `src/server/routes/projects/tasks.test.ts`

**Interfaces:**
- Consumes: parser (`pt.filesScope`, `pt.acceptanceCriteria`).
- Produces: aturan baru: `filesScopeJson` dan `acceptanceCriteriaJson` hanya ditulis saat file punya isinya (`length > 0`). Kolom lain tidak berubah.

- [ ] **Step 1: Tes gagal**: di `tasks.test.ts`, set `acceptanceCriteriaJson = '["Login memakai OTP"]'` dan `filesScopeJson = '["input/code/api/src/auth.ts"]'` untuk `api-AP-1`, jalankan import (file fixture tidak punya keduanya), lalu harapkan kedua nilai tetap.
- [ ] **Step 2: Jalankan dan pastikan gagal** (saat ini ditimpa `null`).
- [ ] **Step 3: Implementasi**: ubah dua baris di `values` menjadi kondisional:

```ts
if (pt.filesScope.length > 0) values.filesScopeJson = JSON.stringify(pt.filesScope);
if (pt.acceptanceCriteria.length > 0) values.acceptanceCriteriaJson = JSON.stringify(pt.acceptanceCriteria);
```
Hapus dua baris lama dari objek literal. Tambahkan komentar satu baris yang menjelaskan alasannya.
- [ ] **Step 4: Jalankan tes dan typecheck.** Commit: `fix(tasks): re-import keeps scope and criteria that were filled in`.

---

### Task 4: Konfigurasi checks per repo

**Files:**
- Create: `src/server/services/task-checks.ts`, `src/server/services/task-checks.test.ts`
- Modify: `src/server/routes/projects/task-repos.ts` (tambah PUT `/api/projects/:id/repo-checks`, dan `checks` + `suggestedChecks` di GET repos)

**Interfaces:**
- Produces:
  - `export interface CheckCommand { name: string; command: string }`
  - `export function readWorktreeConfig(root: string): { setup: Record<string, string>; checks: Record<string, CheckCommand[]> }`: tolerant; file hilang atau rusak → kosong.
  - `export function suggestChecks(repoPath: string): CheckCommand[]`: dari `package.json` `scripts` untuk nama `typecheck`, `lint`, `test`, `build` yang ada. Prefix `bun run` jika `bun.lock` ada, selain itu `npm run`.
  - `export function saveChecks(root: string, repoId: string, checks: unknown): { ok: true; checks: CheckCommand[] } | { ok: false; error: string }`: validasi (nama 1–40 karakter, perintah 1–300 karakter, maksimal 10 item), lalu tulis ke `checks[repoId]` dan pertahankan `setup` dan key lain. Buat folder `.agents` bila perlu.

- [ ] **Step 1: Tes gagal**: baca file rusak → kosong; `saveChecks` mempertahankan `setup.<repo>` yang sudah ada; perintah kosong → `ok:false`; `suggestChecks` dari package.json dengan `typecheck` dan `test` tetapi tanpa `lint` menghasilkan dua item dengan prefix `npm run` (tanpa `bun.lock`).
- [ ] **Step 2–4:** gagal, implementasi, lolos. Di route: GET repos mengisi `checks` (dari konfigurasi) dan `suggestedChecks` (hanya jika `checks` untuk repo itu kosong). Commit: `feat(tasks): per-repo check commands`.

---

### Task 5: Lengkapi dengan AI (prompt, baca, validasi, tulis)

**Files:**
- Create: `src/server/services/task-fill.ts`, `src/server/services/task-fill.test.ts`
- Create: `src/server/routes/projects/task-fill.ts`, `src/server/routes/projects/task-fill.test.ts`
- Modify: `src/server/routes/index.ts`

**Interfaces:**
- Consumes: `listRepos` (Task 1), `messageText` dan `listMessages` (`~/server/agent/store`), `createThread`, `getThread`.
- Produces:
  - `export interface FillProposal { repos: string[]; filesScope: string[]; acceptanceCriteria: string[] }`
  - `export function buildFillPrompt(task: Task, repoIds: string[]): string`: prompt Indonesia yang meminta agen membaca FSD/spec yang disebut di task (`specRef`, `erdRef`, `rtmRef`, `description`), **tidak mengubah berkas**, dan menjawab dengan tepat satu blok ` ```onesist-fill ` berisi JSON `FillProposal`.
  - `export function parseFillProposal(text: string): { ok: true; proposal: FillProposal } | { ok: false; error: string }`: ambil blok terakhir `onesist-fill`, JSON.parse, lalu validasi (lihat Review Focus 3).
  - `export function validateFillProposal(p: FillProposal, repoIds: string[]): { proposal: FillProposal; dropped: string[] }`: buang repo tak dikenal (dicatat di `dropped`), buang path yang absolut, mengandung `..`, atau kosong; batasi 200 path dan 30 AC; buang AC kosong.
  - Route:
    - `POST /api/projects/:id/tasks/:taskId/fill` → buat thread `permissionMode: "readonly"`, `mode: "agent"`, judul `Lengkapi · <kode>`; balas 201 `{ threadId, title, text }`.
    - `GET /api/projects/:id/tasks/:taskId/fill/preview?threadId=` → ambil pesan `assistant` terakhir dari thread itu (`messageText`), parse, validasi. Balas `{ proposal, dropped, current: { repos, filesScope, acceptanceCriteria } }`, atau 422 `{ error: "Usulan belum ada di jawaban agen." }`.
    - `POST /api/projects/:id/tasks/:taskId/fill/apply` dengan body `{ proposal }` → validasi ulang, tulis `reposJson`, `filesScopeJson`, `acceptanceCriteriaJson` (hanya yang tidak kosong), balas task yang sudah diperbarui.

- [ ] **Step 1: Tes gagal (`task-fill.test.ts`)**: parse blok terakhir ketika ada dua blok; teks tanpa blok → error; JSON rusak → error; `validateFillProposal` membuang `../x`, `/abs`, repo tak dikenal, dan AC kosong, dan melaporkan repo yang dibuang.
- [ ] **Step 2: Tes route (`task-fill.test.ts` di folder routes)**: POST membuat thread dengan `permissionMode` `readonly`; apply dengan path `../secret` tidak menulis `filesScopeJson`; apply yang valid menulis; preview tanpa pesan asisten → 422. Untuk preview, sisipkan pesan asisten lewat `appendMessage` dengan `parts: [{ type: "text", text: "...```onesist-fill\n{...}\n```" }]`.
- [ ] **Step 3–5:** gagal, implementasi, lolos, typecheck. Commit: `feat(tasks): fill a task's readiness with an agent proposal`.

---

### Task 6: Board dan client

**Files:**
- Create: `src/lib/use-repos.ts` (`useRepos(projectId)` → `{ repos, loading }`)
- Create: `src/components/tasks/TaskFillDialog.tsx` (dialog: mulai, tunggu, pratinjau diff, Simpan)
- Modify: `src/components/tasks/TaskBoardCard.tsx` (chip "Data kurang: …" saat `taskMode` execution dan ada problem)
- Modify: `src/components/tasks/TaskBoard.tsx` (prop `executionEnabled`, `repoCount`, `onFilled`; geser ke In Progress saat ada problem → dialog dengan tombol **Lengkapi dengan AI**)
- Modify: `src/components/tasks/TasksView.tsx` (pakai `useExecSettings` dan `useRepos`, teruskan props; `onFilled` menggabungkan task yang diperbarui ke `tasks`)

**Interfaces:**
- `TaskFillDialog` props: `{ projectId: string; task: Task | null; onClose(): void; onSaved(task: Task): void }`.
- Alur: POST fill → `openChatTask({ threadId, text })` → dengarkan `chat:run` untuk `threadId` dengan status `done` → GET preview → tampilkan proposal + `current` → Simpan memanggil apply. Status `failed`/`error` menampilkan pesan "Lengkapi gagal: buka chat untuk melihat jawaban agen."
- Board: `executionEnabled=false` (delivery) menyembunyikan chip readiness dan mematikan blokir geser.

- [ ] **Step 1: `use-repos.ts`** dengan pola `useExecSettings`.
- [ ] **Step 2: `TaskFillDialog.tsx`** mengikuti pola `useAgentTask` (subscribe `chat:run`, guard ref saat memulai). Pratinjau: daftar repo, file scope, dan AC, masing-masing dengan "sekarang" vs "usulan". Tombol: **Simpan**, **Batal**. Jika `dropped` tidak kosong, tampilkan "Dibuang: …".
- [ ] **Step 3: Board**: tambahkan chip readiness (pakai `readinessProblems`) dan dialog kedua di `TaskBoard` untuk task yang punya problem. Dialog ini bertujuan memberi pilihan **Lengkapi dengan AI** (membuka `TaskFillDialog`) atau **Batal**.
- [ ] **Step 4: Verifikasi**: `bun run typecheck` dan `bun test src` hijau. Browser: karena dev server masih punya error xterm (lihat catatan Plan 1), verifikasi UI ditunda dan dilaporkan sebagai belum diverifikasi.
- [ ] **Step 5: Commit**: `feat(tasks): readiness chips, blocked drag, and the fill dialog`.

---

## Selesai =

`bun test src` dan `bun run typecheck` hijau. Impor ulang tidak menghapus scope/AC manual. Task tanpa data tidak bisa digeser ke In Progress tanpa dialog. Lengkapi hanya menulis setelah Simpan. Mode delivery tidak menampilkan kontrol readiness.
