# Eksekusi task — Plan 6: Setujui dan integrasi

> Catatan retrospektif: dokumen ini ditulis setelah kodenya selesai, untuk merangkum apa yang ada dan apa yang belum diverifikasi.

**Yang dibangun:**
- Setujui (`services/task-integration.ts`, route `POST …/runs/:runId/approve`): commit sisa perubahan per repo (identitas Onesist), lalu sesuai `integration` proyek:
  - `branch`: tetap di branch run.
  - `pr`: `git push -u origin <branch>`, lalu `gh pr create` dengan deskripsi dari `lib/run-body.ts`.
  - `merge`: merge `--no-ff` ke base branch, hanya jika repo sedang di base itu dan bersih; konflik dibatalkan (`merge --abort`).
- Hasil per repo disimpan (`commit_sha`, `integrated`, `pr_url`, `integration_error`). Repo yang gagal bisa dicoba lagi tanpa mengulang yang berhasil.
- Run menjadi `approved` dan task `done` hanya jika semua repo berhasil.

**Yang sudah diuji:** mode `branch` dan `merge` dengan repo git sementara; deskripsi PR (pure).

**Yang belum diuji:**
- Mode `pr` belum pernah dijalankan terhadap remote GitHub sungguhan.
- Badge PR di kartu belum ada; link PR hanya tampil di dialog saat Setujui.
