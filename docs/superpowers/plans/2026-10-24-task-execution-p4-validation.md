# Eksekusi task — Plan 4: Validasi dan AI reviewer

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run yang selesai (state `validating`) dicek dulu sebelum masuk In Review: perintah cek repo dijalankan di worktree, file yang diubah dibandingkan dengan file scope, dan acceptance criteria dicocokkan dengan laporan agen. Hasilnya tersimpan per run. Jika lolos, run masuk `in_review` dan task ikut pindah. Jika gagal, run `failed` dengan nama cek yang gagal. AI reviewer memberi temuan read-only dalam thread terpisah.

**Keputusan (dari spec):** cek mekanis memblokir; cek scope dan AC hanya peringatan (ditampilkan, tidak memblokir); AI reviewer tidak memicu perbaikan otomatis. Perbaikan dikerjakan user lewat chat (diminta lewat tombol yang membuka chat dengan pesan siap kirim). Perbaikan otomatis sekali dari spec ditunda ke Plan 5 bersama "Minta revisi".

**Penyesuaian dari spec:** verifikasi dijalankan lewat tombol (bukan otomatis saat `chat:run` selesai), supaya run yang masih dipakai user di chat tidak tiba-tiba divalidasi. Ini bisa diubah nanti.

**Architecture:**
- Modul murni: `lib/run-report.ts` (parse blok `onesist-report`), `lib/file-scope.ts` (cocokkan file dengan scope), `lib/run-review.ts` (parse blok `onesist-review`). Dipakai server dan client.
- `services/task-validation.ts`: menjalankan cek (spawn `sh -c`, env dibersihkan, timeout 10 menit per perintah, output dipotong 4000 karakter terakhir), menghitung file yang berubah (`git diff --name-only <base_commit>` + untracked), lalu menyimpan `validationJson` dan memindahkan state.
- `services/task-review.ts`: membuat prompt AI reviewer (read-only), dan membaca temuan dari jawaban agen.
- Kolom baru di `task_runs`: `validation_json`, `review_json`, `reviewer_thread_id`.
- Route: `POST …/runs/:runId/validate`, `POST …/runs/:runId/review` (buat thread read-only, balas prompt), `GET …/runs/:runId/review/findings?threadId=` (baca temuan), `GET …/runs/:runId` (detail).

**Tasks:**
1. Modul murni `run-report`, `file-scope`, dan `run-review` dengan tes.
2. Migrasi kolom baru dan tipe `RunSummary` (`validation`, `review`).
3. `task-validation` dengan tes memakai repo git sementara: cek lulus → `in_review`; cek gagal → `failed` dengan nama cek; file di luar scope tercatat sebagai peringatan.
4. `task-review` (prompt + parse) dengan tes.
5. Route dan tes route.
6. Klien: tombol "Validasi" pada run yang `validating` atau `failed`; hasil ringkas di card (nama cek yang gagal atau "Lolos"); tombol "Tinjau AI" membuka chat dengan prompt reviewer.
7. Verifikasi: `bun test src`, `bun run typecheck`, commit.

**Batasan yang dilaporkan:** perbaikan otomatis dan tombol "Minta revisi" ada di Plan 5. Alur sampai agen menanggapi temuan belum diuji end-to-end.
