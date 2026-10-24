# Eksekusi task oleh agen: roadmap implementasi

**Spec:** `docs/superpowers/specs/2026-10-24-task-execution-design.md`

Spec ini mencakup beberapa subsistem, jadi implementasinya dipecah menjadi 7 plan. Setiap plan menghasilkan software yang jalan dan bisa dites sendiri. Plan berikutnya baru ditulis detail setelah plan sebelumnya selesai, karena nama dan bentuk yang benar-benar dipakai baru diketahui setelah kode sebelumnya mendarat.

| # | Plan | Hasil yang bisa dipakai | Status |
|---|------|-------------------------|--------|
| 1 | **Data + Board manual + mode proyek** | Status `in_review`, kolom eksekusi di `tasks`, tabel `project_exec_settings`, Board 4 kolom dengan drag & drop manual, kunci dependensi, urutan timeline, saklar mode `execution \| delivery` | `2026-10-24-task-execution-p1-board.md` |
| 2 | **Readiness + Lengkapi dengan AI + registri repo** | Deteksi repo `input/code/*` + root, readiness (repo/scope/AC/dependensi), badge "Siap"/"Data kurang", dialog usulan AI (read-only turn) untuk repos/scope/AC, `checks` di `.agents/onesist-worktree.json` dengan usulan dari `package.json`. **Catatan:** impor ulang task saat ini menimpa `filesScopeJson`/`acceptanceCriteriaJson` dengan null kalau file tidak punya nilainya, jadi harus dibuat sticky di plan ini. | belum |
| 3 | **Memulai run + mode izin `execute` + drawer Live** | Tabel `task_runs`/`task_run_repos`, folder run + worktree per repo, workspace `run_bundle`, thread eksekusi + prompt dari server, mode `execute` di Claude/Codex/OpenCode/Pi (agy ditolak), state `running/waiting_input/failed`, event SSE `task:run`, drawer (Live, Chat, jawab pertanyaan, Stop, Ulangi), pengecualian di AGENTS.md | belum |
| 4 | **Validasi + AI reviewer** | Cek mekanis per repo (env bersih, timeout), cek scope, parse `onesist-report`, perbaikan otomatis sekali, thread reviewer read-only dengan temuan JSON, transisi ke `in_review`, tab Validasi | belum |
| 5 | **Pane review + revisi + edit sendiri** | Tab pane `task` (split/window), diff per repo/file, komentar baris, temuan AI di baris (Minta perbaiki/Abaikan/Balas), Minta revisi → thread yang sama + snapshot commit per revisi, Edit sendiri + Validasi ulang, Buang run | belum |
| 6 | **Setujui + integrasi** | Commit akhir, `pr` (push + `gh pr create`, PR per repo saling menautkan) / `branch` / `merge`, laporan sebagai body PR (tanpa secret), badge PR + refresh saat board dibuka | belum |
| 7 | **Antrian paralel + "Jalankan yang siap"** | `queued` + scheduler berbasis event (urutan timeline), batas paralel dari setting, tombol batch, ringkasan "n berjalan · n butuh jawaban · n antri" | belum |

Urutan ini mengikuti dependensi: 3 butuh readiness dan repo dari 2, 4 butuh run dari 3, 5 dan 6 butuh hasil validasi dari 4, dan 7 bisa setelah 3, tapi paling berguna setelah 6.
