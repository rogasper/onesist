# Eksekusi task oleh agen dari board — desain

Tanggal: 2026-10-24 · Status: desain, belum ada kode · Menggantikan catatan "C. Eksekusi kode (diparkir)" di `plan/SPLIT-VIEW-CLI-EKSEKUSI-PLAN.md`

## Intent

Task yang sudah tergenerate dari FSD (per fase, berurutan menurut timeline) sekarang hanya bisa dikerjakan manusia atau diekspor sebagai paket handoff. Tujuannya: task bisa **dikerjakan oleh agen CLI milik user** terhadap repo di `input/code/<repo>`, langsung dari **board kanban**, dengan pemantauan live, jalur tanya-jawab saat ada yang kurang jelas, validasi otomatis, review yang nyaman, dan hasil akhir berupa **PR** yang di-merge sendiri oleh user atau lead.

Sukses = user menggeser card To Do → In Progress, lalu agen bekerja di worktree terpisah. Kalau agen bingung, ia bertanya dan card memberi tanda. Setelah selesai, Onesist memvalidasi (cek mekanis, scope, AC, AI reviewer yang menangkap hal seperti *"kenapa bikin fungsi baru padahal helper sudah ada?"*). User mereview di panel diff, meminta revisi atau menyetujui, dan Onesist membuat PR yang deskripsinya sudah siap dibaca lead.

## Keputusan user (dari diskusi)

1. **Board 4 kolom**: To Do → In Progress → In Review → Completed.
2. **Menggeser card ke In Progress = mulai eksekusi.** Selesai → otomatis In Review. Completed setelah disetujui.
3. **Urutan mengikuti timeline/dependensi**: task yang dependensinya belum selesai tidak jalan (tidak ada blocker).
4. **Paralel**: task yang tidak saling bergantung boleh jalan bersamaan.
5. **Agen dan model bisa dipilih**: default proyek, bisa di-override per task (provider/agen dan model).
6. **Review** menampilkan perubahan (diff) dan proses validasi, termasuk pengecekan duplikasi helper.
7. **Setujui** → dibuatkan PR, merge sendiri, atau lead diminta review lewat PR. Cara integrasi "bebas", jadi dijadikan pengaturan.
8. **Pemantauan model C**: klik card → drawer kanan (Live, ringkasan, jawab pertanyaan). "Buka penuh"/"Review diff" → task yang sama terbuka sebagai pane di split view (bisa ke window terpisah). Isi tab sama, hanya ukurannya yang beda.
9. **Task tanpa file scope/acceptance criteria tidak bisa dieksekusi**: ada tombol **"Lengkapi dengan AI"** yang mengusulkan isinya untuk disetujui user.
10. **Kompatibel ke belakang**: tampilan List dan data lama tetap berfungsi. Board tetap bisa dipakai manual tanpa agen.
11. **Basis branch = selalu base branch repo.** Dependensi dianggap selesai saat task-nya `done` (PR dibuat). Kode dependensi yang belum di-merge memang tidak ikut, dan itu diterima.
12. **Mode izin khusus eksekusi**: bebas di dalam worktree, bertanya untuk apa pun di luar worktree. Ini pengecualian yang disetujui atas aturan "thread task mulai di `ask`" di AGENTS.md.
13. **Satu task boleh mengubah beberapa repo** (misalnya backend + frontend): satu run, beberapa worktree/branch/PR.
14. **Mode proyek "delivery saja"**: task hanya untuk dilihat dan dikelola seperti sekarang (lalu diserahkan tim ke Monday/Jira/Trello dll secara manual), tanpa eksekusi. Tidak ada integrasi ke tool eksternal.

Dari diskusi sebelumnya (`plan/SPLIT-VIEW-CLI-EKSEKUSI-PLAN.md`): eksekusi **tidak lewat native chat**, melainkan agen CLI (runtime di `server/agent/runtime/`). Tidak ada push, PR, atau merge tanpa klik user.

## Goals

- Board view baru di tab Tasks (di samping List dan Timeline) dengan status card yang informatif.
- Eksekusi per task: worktree sendiri + thread chat sendiri (provider CLI), memakai infrastruktur yang sudah ada.
- Pemantauan live dan jawab pertanyaan agen dari drawer, tanpa harus membuka chat.
- Validasi otomatis: perintah cek repo, cek scope, checklist AC, dan AI reviewer read-only.
- Review: diff per file, komentar per baris, temuan AI menempel di baris, revisi ke thread yang sama, edit manual.
- Setujui → PR (default) / branch lokal / merge lokal, dengan laporan lengkap sebagai deskripsi PR.
- Antrian paralel dengan batas jumlah yang jalan bersamaan.
- "Lengkapi dengan AI" untuk scope, AC, dan repo target.

## Non-goals

- Eksekusi lewat native chat/API provider (bisa ditambah nanti, tapi tidak di desain ini).
- Merge PR otomatis, push tanpa klik, atau auto-merge.
- Mode server/multi-user.
- Planner → executor dua tahap (ide C4 lama). Satu agen per task. Pemilihan model per task sudah menutupi kebutuhan "model kuat untuk task berat".
- Polling status PR atau CI di latar belakang.
- Integrasi ke Monday/Jira/Trello. Saklar mode proyek `execution | delivery` cukup: di mode `delivery`, semua kontrol eksekusi (tombol Jalankan, dropdown agen/model, kesiapan eksekusi, "Lengkapi dengan AI" untuk eksekusi) disembunyikan. Tab Tasks berperilaku seperti sekarang ditambah Board manual, dan ekspor handoff yang ada tetap tersedia.

## Anti-goals (gagal walau "jalan")

- Agen menulis ke working tree user atau branch utama repo.
- Card diam saja padahal agen menunggu jawaban atau sudah gagal (kegagalan yang tidak terlihat).
- Tampilan List, ekspor handoff, atau task lama rusak; status `done` lama hilang dari pandangan.
- Mengubah konfigurasi agen milik user (`~/.claude`, config OpenCode/agy/Codex/Pi).
- Secret repo (`.env`) ikut ke prompt atau ke deskripsi PR.

## Kondisi sekarang yang dipakai

| Kebutuhan | Sudah ada |
|---|---|
| Data task untuk agen | `tasks`: `filesScopeJson`, `acceptanceCriteriaJson`, `specRef`/`erdRef`/`rtmRef`, `dependenciesJson`, `blocksJson`, `phase`, `critical`, `risk` |
| Paket konteks task | `routes/projects/handoff.ts` `buildPromptMd(task, specSnippet, erdSnippet)` |
| Menjalankan agen CLI | `cliRuntimeFor(provider)`, runtime OpenCode/Claude/Codex/Pi/agy, `run-registry.ts` (banyak thread berjalan) |
| Pertanyaan ke user | `awaitQuestion` di semua runtime |
| Worktree | `server/agent/workspace/` (`setThreadWorkspace`, `worktrees.ts`, setup `.agents/onesist-worktree.json`) |
| Pola halaman → thread → refresh | `POST /api/projects/:id/agent-tasks`, `lib/chat-task.ts`, `lib/use-agent-task.ts` |
| Split pane / window terpisah | `lib/split-layout.ts`, `PaneBody`, `/pane/$projectId/$tab`, `doc-locks` |
| Index simbol untuk deteksi duplikasi | `index_files`/`symbols`/`index_fts` + tool MCP read-only |
| GitHub CLI | `server/mcp/gh.ts` (state `gh`) |
| Real-time | event bus SSE (`server/realtime/events.ts`) |

## Desain

### 1. Model data

**Status task** tetap string di `tasks.status`. Nilai baru: `in_review`. Pemetaan kolom: `todo` → To Do, `in_progress` → In Progress, `in_review` → In Review, `done` → Completed. `done` **tidak di-rename**, supaya List view, filter, ekspor, RTM, dan data lama tetap jalan. Filter status di List mendapat opsi "In Review".

**Kolom baru di `tasks`** (via `ALTER TABLE` runtime + migrasi SQL + `schema.ts`):
- `exec_provider_id`, `exec_model`: override agen/model. Null = default proyek.
- `repos_json`: daftar repo target relatif (`input/code/<repo>` atau `.` untuk root), bisa lebih dari satu. Null = tentukan otomatis kalau proyek hanya punya satu repo.

**Tabel baru `task_runs`**: satu baris per percobaan eksekusi, dengan revisi di run yang sama.
- `id`, `task_id`, `project_id`, `thread_id` (thread chat eksekusi), `reviewer_thread_id`
- `bundle_path`: folder run (lihat §3), tempat agen bekerja
- `provider_id`, `model`, `model_options_json`
- `state`: `queued | running | waiting_input | validating | failed | in_review | approved | discarded`
- `revision` (mulai 1, naik setiap "Minta revisi")
- `validation_json` (hasil cek mekanis, scope, dan AC per revisi), `review_json` (temuan AI reviewer + keputusan user: diterapkan/diabaikan + alasan), `comments_json` (komentar baris dari user)
- `report_json` (laporan akhir agen: ringkasan, bukti AC)
- `integration` (`pr | branch | merge`)
- `error`, `created_at`, `started_at`, `ended_at`

**Tabel baru `task_run_repos`**: satu baris per repo di sebuah run. Isinya `run_id`, `repo`, `worktree_path`, `branch`, `base_branch`, `base_commit`, `commit_sha`, `diff_stats_json`, `pr_url`, `pr_number`, `pr_state`. Validasi, scope, diff, commit, dan PR dikerjakan per baris ini.

Hanya satu run aktif (bukan `approved`/`discarded`) per task. **Penghapusan proyek** harus menghapus `task_run_repos` (by `run_id`) lalu `task_runs` (keyed by project), dan delete per task juga ikut. Section G `verify-api.ts` ditambah.

**Pengaturan proyek** (tabel `project_exec_settings`, lihat "Keputusan builder check"): mode proyek `execution | delivery` (default `execution`), agen + model default eksekusi, agen + model AI reviewer, batas paralel (default 2), cara integrasi (default `pr`), base branch per repo (default branch saat ini di repo).

**Perintah validasi per repo**: disimpan di `<project>/.agents/onesist-worktree.json`, di sebelah `setup` yang sudah ada, sebagai `checks[<repo>] = [{ name, command }]`. Saat pertama kali, Onesist mengusulkan isinya dari `package.json` scripts (`typecheck`, `lint`, `test`) atau `Cargo.toml`/`Makefile`, lalu user menyetujui. Perintah tidak pernah dikarang agen saat run.

### 2. Kesiapan task (readiness) dan "Lengkapi dengan AI"

Task **siap** kalau: punya `repos_json` (atau proyek hanya punya satu repo), `filesScopeJson` tidak kosong, `acceptanceCriteriaJson` tidak kosong, semua dependensi berstatus `done`, dan repo target ada, berupa git, serta punya base branch. Card menampilkan **Siap**, **🔒 menunggu X, Y**, atau **Data kurang: scope/AC/repo**.

Task yang belum siap tidak bisa digeser ke In Progress:
- Dependensi belum selesai: konfirmasi "Jalankan tetap?". Run tetap dimulai dari base branch.
- Data kurang: geseran dibatalkan, lalu muncul dialog dengan tombol **"Lengkapi dengan AI"**.

**Lengkapi dengan AI** (per task, atau batch untuk semua task data-kurang di satu fase): satu turn read-only dengan agen default. Inputnya task, FSD terkait, spec/ERD (`specRef`/`erdRef`), dan struktur repo/index simbol. Outputnya JSON usulan `{ repos[], filesScope[], acceptanceCriteria[] }`, dengan path scope diawali repo-nya, yang tampil sebagai dialog diff "sekarang vs usulan" per task. Tidak ada yang ditulis ke DB atau file sumber task sebelum user menekan Simpan. Kalau task berasal dari file markdown (`sourcePath`), perilaku impor ulang mengikuti aturan impor yang sudah ada: kolom yang diisi user tidak tertimpa kecuali file memang punya nilainya.

### 3. Memulai run

Dipicu oleh geser card → In Progress, tombol "Jalankan" di drawer, atau "Jalankan yang siap".

1. Validasi readiness (server, bukan hanya UI).
2. Kalau jumlah run `running`/`waiting_input`/`validating` sudah mencapai batas paralel → `state = queued`. Card masuk In Progress dengan badge "Antri #n".
3. Buat **folder run** `<worktrees-dir>/runs/<run-id>/` (di luar project root, mengikuti aturan lokasi worktree Fase 4C). Untuk setiap repo task, buat worktree dari base branch repo itu di `<folder run>/<repo>` dengan branch `onesist/<task-code-atau-id>-<slug>` (pakai jalur `worktrees.ts`, jalankan `setup` per repo). Satu repo tetap memakai folder run, supaya bentuknya sama.
4. Buat thread chat (`chat_threads`) dengan provider/model = override task atau default proyek, workspace = folder run (jenis workspace baru `run_bundle` di `server/agent/workspace/`, divalidasi server seperti jenis lain), judul `"<CODE> · <judul>"`, dan tanda bahwa ini thread eksekusi milik `task_run`.
5. Kirim prompt eksekusi, satu kali, dari server (bukan `autoSend` di client), supaya jalan walau tidak ada view yang terbuka:
   - Paket konteks dari `buildPromptMd` (deskripsi, spec, ERD) + bagian FSD terkait + AC + file scope + daftar dependensi yang sudah selesai (beserta branch/PR-nya). Kalau PR dependensi belum di-merge, prompt menyebutkan bahwa kodenya belum ada di base dan agen harus bertanya, bukan membuat ulang.
   - Aturan: kerja hanya di worktree, patuhi `AGENTS.md`/`CLAUDE.md` repo, gunakan helper yang ada sebelum membuat baru, **tanya kalau ada yang ambigu** (jangan menebak keputusan bisnis), jangan push.
   - Penutup wajib: blok laporan ber-fence ` ```onesist-report ` berisi JSON `{ summary, acceptance: [{ criterion, met, evidence: [path:line] }], notes, questionsAsked }`.
6. `tasks.status = in_progress`, `task_runs.state = running`, lalu emit event SSE `task:run`.

Saat agen bertanya (`awaitQuestion`), run → `waiting_input`, card mendapat badge **❓ Butuh jawaban**, dan drawer menampilkan pertanyaan dengan tombolnya. Jawaban dari drawer memakai jalur jawaban yang sama dengan chat. Setelah dijawab, run kembali ke `running`.

**Scheduler antrian**: berjalan di server dan dipicu event run selesai/gagal/dibatalkan (bukan interval). Ia mengambil run `queued` tertua yang masih siap, mengikuti urutan timeline (fase, lalu urutan task di timeline/kode).

**Stop**: tombol di drawer menghentikan turn (jalur Stop runtime), lalu run → `failed` dengan `error = "dihentikan user"`. Worktree tetap ada.

### 4. Validasi (setelah turn agen selesai)

Run → `validating`, lalu jalankan berurutan di worktree:
1. **Cek mekanis**: setiap `checks[repo]` dijalankan dengan env yang dibersihkan seperti tool `bash`, timeout per perintah (default 10 menit), dan output disimpan (dipotong seperti aturan tool output).
2. **Cek scope**: `git diff --name-only <base_commit>` (termasuk file untracked) dibandingkan dengan glob `filesScope`. File di luar scope = peringatan, bukan gagal.
3. **Checklist AC**: parse blok `onesist-report`. Kriteria tanpa bukti atau `met:false` ditandai. Kalau blok tidak ada, ditandai "laporan tidak ada" (peringatan).
4. **AI reviewer**: thread terpisah, read-only (permission mode read-only), dengan agen/model reviewer dari setting (disarankan beda dari pengeksekusi). Inputnya diff, task + AC, `AGENTS.md` repo, dan akses ke index simbol (tool `onesist_*` read-only bila runtime mendukung MCP; selain itu disertakan daftar simbol yang mirip, hasil pencarian index oleh Onesist sebelum prompt). Tugasnya: duplikasi helper/fungsi, pelanggaran konvensi, bug jelas, celah AC. Outputnya JSON `[{ file, line, severity: info|warn|error, message, suggestion, relatedSymbol? }]`.

**Perbaikan otomatis sekali**: kalau cek mekanis gagal, output kegagalannya dikirim ke thread eksekusi sebagai satu pesan ("perbaiki ini"), lalu validasi diulang. Gagal lagi → run `failed`, card tetap di In Progress dengan badge **⚠ Gagal: <nama cek>** dan tombol Lihat/Ulangi. Temuan AI reviewer **tidak** memicu perbaikan otomatis; itu bagian user saat review.

Semua cek lolos (peringatan boleh) → run `in_review`, `tasks.status = in_review`.

### 5. UI board dan pemantauan

**Board view** (`components/tasks/`, ditambah pada toggle List/Board/Timeline yang sudah ada; pilihan view diingat per proyek). Bar atas: filter Fase dan FSD, agen default (shortcut ke setting), ringkasan "n berjalan · n butuh jawaban · n antri", dan tombol **"Jalankan yang siap (n)"**. Kolom diurutkan menurut urutan timeline. Drag & drop antar kolom; geser manual juga boleh untuk task "manual" (tanpa eksekusi), seperti mengubah status sekarang.

**Isi card** (lihat mockup `.superpowers/brainstorm/*/content/board.html`): kode, judul, label `critical`/risk, status kesiapan atau kunci, SP, jumlah AC, agen/model (dengan dropdown override). Saat berjalan: langkah terakhir agen (satu baris), progres, durasi, jumlah tool/file. Saat butuh jawaban: kutipan pertanyaannya. In Review: chip validasi + jumlah temuan AI + `+x −y · n file`. Completed: badge PR. Task lama tanpa data agen tampil sebagai card biasa berlabel "manual".

Progres saat running = jumlah AC yang sudah disebut agen, kalau ada; selain itu indikator aktivitas tanpa persen palsu. Builder memutuskan detailnya.

**Drawer (model C)**: klik card → drawer kanan di atas board, dengan tab **Live** (langkah agen dari thread + pertanyaan), **Ringkasan**, **Changes**, **Validasi**, **Chat** (thread eksekusi yang sama, bisa diketik untuk koreksi lewat diskusi). Tombol **⤢ Buka penuh / Review diff** membuka task yang sama sebagai pane di split view (tab baru `task` di `PaneBody`, mengikuti aturan "Tab content": View menerima `projectId` + `taskId` sebagai prop), dan dari sana bisa ke window terpisah (Fase 5E). Komponen tab dipakai bersama oleh drawer dan pane.

**Pane review** (lihat mockup `monitor-abc.html` bagian B):
- Daftar file + diff (base_commit..worktree, termasuk perubahan belum di-commit).
- Klik baris → tambah komentar. Temuan AI reviewer menempel di barisnya dengan aksi **Minta perbaiki**, **Abaikan (alasan)**, **Balas**.
- Footer: **Edit sendiri**, **Minta revisi (n)**, **Setujui**, plus menu **Buang run** (hapus worktree setelah konfirmasi; branch tetap ada, mengikuti aturan clean-up yang sudah ada).
- **Minta revisi**: komentar user + temuan AI yang dipilih "Minta perbaiki" dikumpulkan menjadi satu pesan ke thread eksekusi, `revision++`, run → `running`, task → `in_progress` dengan badge "Revisi #n". Riwayat revisi dan validasi per revisi disimpan.
- **Edit sendiri**: membuka file worktree di editor yang ada (CodeMirror) dengan file lock biasa, lalu tombol **Validasi ulang** (mekanis + scope; AI reviewer opsional).

Semua pembaruan lewat SSE (`task:run`, ditambah event chat yang sudah ada). Tidak ada polling.

### 6. Setujui dan integrasi

1. Commit sisa perubahan di worktree (pesan: `<CODE>: <judul>` + trailer task), lalu simpan `commit_sha`.
2. Menurut setting `integration`:
   - **pr** (default): push branch ke remote dan `gh pr create` dengan base = base branch dan body = **laporan**. Butuh remote + `gh` login. Kalau tidak tersedia, turun ke **branch** dengan pesan yang jelas.
   - **branch**: hanya commit di branch lokal, lalu tampilkan nama branch + perintah untuk membuat PR sendiri.
   - **merge**: merge ke base branch lokal (refuse kalau base punya perubahan lokal atau konflik), worktree dibiarkan.
3. Run → `approved`, task → `done`, emit event. Worktree tidak dihapus otomatis (aturan Fase 4C).

**Laporan (body PR)**: ringkasan, tautan task/FSD/spec (path di repo Onesist), checklist AC + bukti, hasil validasi, temuan AI reviewer beserta status (diterapkan/diabaikan + alasan), riwayat revisi, dan agen/model yang dipakai. Tanpa isi `.env` atau secret, tanpa transcript penuh. Laporan yang sama bisa disalin dari pane, untuk dikirim ke lead lewat jalur lain.

**Status PR** di card disegarkan saat board dibuka atau saat card dibuka (`gh pr view`), tanpa polling.

### 7. Mode izin eksekusi dan keamanan

**Mode izin baru `execute`** (pengecualian yang disetujui user atas aturan "thread task mulai di `ask`"; AGENTS.md diperbarui saat implementasi). Edit file dan perintah shell di dalam folder run diizinkan tanpa bertanya. Penulisan atau perintah yang menyasar path di luar folder run akan bertanya lewat `awaitQuestion`. Pemetaan per runtime:
- **Claude Code**: `canUseTool` mengizinkan Edit/Write/Bash yang path-nya di dalam folder run, dan bertanya untuk sisanya.
- **Codex**: `approvalPolicy: on-request` + `sandbox: workspace-write` dengan cwd = folder run, sehingga eskalasi ke luar sandbox menjadi approval.
- **OpenCode**: rules mengizinkan edit/bash, dengan `external_directory` = ask.
- **Pi**: `onesist-approval.ts` menerima policy `execute`, mengizinkan di dalam folder run, dan bertanya di luar.
- **agy**: tidak bisa membatasi per path (pilihannya hanya semua atau tidak sama sekali). *Keputusan penulis:* agy tidak ditawarkan sebagai agen eksekusi sampai mendukungnya, dan dropdown menandainya "belum didukung untuk eksekusi".

Karena itu, `waiting_input` seharusnya jarang dan berisi pertanyaan nyata (bisnis/ambiguitas).

- Agen hanya bekerja di folder run-nya (`cwd` = folder run). Validasi dan reviewer tidak pernah menulis.
- Perintah cek berasal dari file konfigurasi yang disetujui user, bukan dari agen.
- Env dibersihkan, dan `.env`/secret tidak dimasukkan ke prompt, laporan, atau body PR.
- Push, PR, dan merge hanya lewat klik **Setujui**.
- Semua path, repo, dan branch dari client divalidasi server (`server/agent/workspace/`).
- MCP Onesist tetap read-only. Tidak ada tool baru yang menulis.

## Yang diserahkan ke builder

- Library drag & drop (atau HTML5 DnD native) dan detail visual card, mengikuti token kumo (mockup hanya acuan tata letak).
- Bentuk persis API route (`/api/projects/:id/task-runs/...`) dan nama event SSE.
- Cara parse diff dan komponen tampilannya.
- Penentuan langkah-langkah fase implementasi, dengan saran urutan: (1) data + status `in_review` + Board manual, (2) readiness + Lengkapi dengan AI, (3) memulai run + drawer Live/jawab, (4) validasi + AI reviewer, (5) pane review + revisi + edit sendiri, (6) Setujui/PR, (7) antrian paralel + "Jalankan yang siap".
- Tes: runtime dipalsukan seperti `test-fixtures.ts` agy, tanpa memanggil CLI asli. Git dites di repo sementara.

## Keputusan builder check (keputusan penulis desain, bisa dikoreksi)

- **Commit**: agen dilarang commit, rebase, atau amend (aturan di prompt). Onesist membuat satu commit snapshot di branch setiap kali sebuah revisi lolos validasi (`<CODE>: revisi n`), sehingga diff per revisi = commit itu, dan Setujui hanya meng-commit sisa perubahan. Kalau agen tetap commit, Onesist mendeteksi bahwa HEAD bergeser dari snapshot terakhir dan menampilkan peringatan; diff tetap dihitung dari `base_commit`.
- **Pengaturan proyek**: tabel baru `project_exec_settings` (per proyek, di DB = personal per mesin). Hanya `checks` yang ada di `.agents/onesist-worktree.json`, supaya dibagikan tim lewat repo.
- **Ulangi** (run gagal): memakai worktree dan thread run yang sama (pesan "lanjutkan/perbaiki"). "Buang run" lalu jalankan lagi = worktree baru.
- **Readiness "repo bersih"** dihapus: worktree tidak butuh working tree utama yang bersih. Syaratnya cukup repo ada, berupa git, dan base branch ada.

- **Multi-repo**: validasi, scope, dan diff ditampilkan per repo (dikelompokkan di pane review). Setujui membuat satu PR per repo, dan body PR saling menautkan PR pasangannya. Kalau satu repo gagal push/PR, repo lain tetap dibuat dan status run mencatat per repo.

## Pertanyaan terbuka

Tidak ada.
