# Eksekusi task — Plan 5: Review, revisi, dan buang run

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run yang sudah In Review bisa ditinjau: diff per repo dan per file, temuan AI reviewer, dan komentar per baris. User bisa meminta revisi (komentar dan temuan yang dipilih dikirim ke thread yang sama), atau membuang run. Setiap revisi yang lolos validasi disimpan sebagai commit snapshot, sehingga diff tiap revisi bisa dibedakan.

**Keputusan:**
- **Tinjau ditampilkan sebagai dialog besar**, bukan pane split view. Pane butuh tab baru di `PaneBody` dan penanganan window terpisah; itu dikerjakan setelah dialog ini stabil. Isi dialog dirancang supaya bisa dipindah ke pane tanpa diubah.
- **Edit sendiri ditunda.** Membuka worktree di editor dengan file lock adalah pekerjaan terpisah. Ditandai di dialog sebagai belum tersedia.
- **Setujui** belum dihubungkan (Plan 6). Tombolnya ada tetapi nonaktif.
- **Snapshot commit** dibuat hanya saat validasi lolos, sesuai spec: `<KODE>: revisi <n>`. Commit itu dibuat oleh Onesist di worktree run, bukan oleh agen.

**Tasks:**
1. Service diff (`task-diff.ts`): per repo, daftar file dan patch (`git diff <base_commit>` + file untracked), dengan batas ukuran per file. Tes repo git sementara.
2. Service revisi (`task-revision.ts`): `buildRevisionMessage(comments, findings)` murni; `requestRevision(runId, input)` menaikkan `revision`, state → `running`, task → `in_progress`, dan mengembalikan teks pesan. Tes.
3. Snapshot commit di `validateRun` saat lolos (pesan `<KODE>: revisi <n>`), dengan tes bahwa HEAD worktree berubah dan diff tetap dihitung dari `base_commit`.
4. Buang run (`discardRun`): state `discarded`, task kembali ke To Do, worktree tidak dihapus. Tes.
5. Route: `GET …/diff`, `POST …/revise`, `POST …/discard`. Tes route.
6. Klien: `TaskReviewDialog` dengan daftar file, patch, temuan AI (centang untuk dikirim), komentar per baris (klik nomor baris), tombol Minta revisi, Buang run, dan Setujui/Edit sendiri yang nonaktif dengan keterangan. Dibuka dari badge "Lolos cek".
7. Verifikasi: `bun test src`, `bun run typecheck`, commit.

**Batasan yang dilaporkan:** pane split view, Edit sendiri, dan Setujui belum termasuk.
