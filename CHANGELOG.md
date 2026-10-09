# Changelog

## v0.2.0 — Chat agent yang lengkap, capture desain Figma, dan performa yang lebih ringan

Rilis besar: tab **Chat** per project kini punya antrean pesan di server, tanya-balik ke user di tengah run, edit dan kirim ulang, cabang thread, dan undo perubahan file per giliran. Tautan desain Figma bisa dibaca lewat browser yang dikelola Onesist.

### Feat — Chat agent (paritas dengan alur ZCode)
- **Antrean dan run di server:** pesan yang dikirim saat agent masih bekerja masuk antrean di server, dan run yang sedang berjalan bisa disambung kembali setelah halaman dimuat ulang. Persetujuan tool lewat SSE.
- **Tanya-balik saat run (`ask_user`), edit dan kirim ulang, coba lagi jawaban, dan cabang thread** dari giliran mana pun.
- **Undo perubahan file per giliran**, dan approval diingat sesuai cakupannya.
- **Transkrip:** hasil tool dikelompokkan per jenis, ada rel giliran, pencarian dalam thread, dan riwayat dimuat per halaman.
- **Composer:** referensi berkas, meter konteks, pilihan tingkat berpikir, lampiran gambar (untuk provider yang bisa membaca gambar), kutipan jawaban, draf tersimpan per thread, dan recall prompt dengan ↑/↓.
- **Saran langkah berikutnya** untuk project, dan badge pada thread yang sedang berjalan.

### Feat — Mention folder dan berkas root
- `@` di composer kini juga menampilkan folder dan berkas di root project. Memilih folder menyisipkan `@nama/`.

### Feat — Baca tautan desain Figma
- Tool `browser_capture` membuka tautan di jendela browser yang dikelola Onesist (Chrome atau Edge, profil terpisah), lalu menyimpan screenshot ke `input/assets/captures/`.
- Untuk tautan dengan `node-id`, hanya frame yang dipilih yang di-crop, dan UI serta komentar Figma disembunyikan.
- Login hanya diminta untuk tautan privat, dan dilakukan sendiri di jendela itu. Onesist tidak mengetik atau menyimpan password.
- Pengaturan provider baru: **Model bisa melihat gambar**. Hanya model yang ditandai begitu yang menerima gambar hasil capture.

### Feat — Layout chat dan project
- Panel chat bisa dibuka bersamaan dengan area project tanpa menutupi tab-nya. Di lebar yang sempit, chat menjadi overlay.
- Sidebar otomatis terlipat saat chat dibuka dan kembali seperti semula saat ditutup.

### Perf — Lag di Windows
- **Satu stream event untuk seluruh tab** menggantikan beberapa koneksi SSE per komponen, sehingga permintaan biasa tidak lagi antre.
- **Watcher berkas tanpa polling sinkron:** scan berjalan asinkron dan di-debounce, dan GC memori hanya jalan saat batas terlampaui.

### Fix
- Transkrip tidak lagi bisa digeser ke samping, dan bubble pesan membungkus teks panjang.
- Daftar berkas project ikut berubah saat isi folder berubah.
- Pesan yang hanya berisi gambar tidak lagi hilang di server.

### Verifikasi
- `bun run typecheck` bersih. Tes komponen dan lib (61 tes di 9 berkas) lulus.
- Capture Figma dijalankan di aplikasi desktop yang di-build (debug): tool terpanggil, screenshot tersimpan dan di-crop ke frame, dan thumbnail tampil di chat.
- **Belum diuji:** jalur Windows (tidak dilakukan selama pengembangan di macOS), dan jawaban model yang bisa membaca gambar desain (model uji yang tersedia belum ditandai bisa melihat gambar).
- **Bump `0.1.47 → 0.2.0`**.

## v0.1.47 — macOS: quit instan, folder picker lepas dari osascript, provider BYOK dipilih saat buka project

### Fix — Quit macOS ~2 menit → di bawah 1 detik
- **`src-tauri/src/sidecar.rs` + `lib.rs` + `tray.rs` — jalur terminate tidak lagi mengirim event ke WebView.** Dock Quit / Cmd+Q masuk sebagai `RunEvent::Exit` (bukan `ExitRequested`), dan di sana `state.stop()` memancarkan `sidecar-status` ke WebView yang justru sedang dibongkar macOS. Pengirimannya memblokir main thread di dalam semaphore milik tao, dan quit terukur **~123 detik**. Sekarang ada `stop_quiet()` — mematikan sidecar tanpa mengumumkannya — dan itulah yang dipakai jalur terminate (`RunEvent::Exit`, `ExitRequested`, dan `Drop`), sementara `tray::watch_sidecar_status` melewati penerusan selama `QUITTING`. **Terukur di mesin ini pada bundle rilis: quit 0,48 detik dan tidak ada proses yang tertinggal** (penulis PR mengukur 0,65 detik pada bundle debug).
- **Klik ikon Dock kini memunculkan jendela** yang sedang tersembunyi ke tray (handler `RunEvent::Reopen`; sebelumnya ikonnya tampak mati).

### Fix — Folder picker macOS: "Load failed" (osascript tidak lagi dipakai di aplikasi desktop)
- **Desktop tidak pernah lagi jatuh ke osascript.** Rantainya: `invoke("pick_folder")` gagal (perintah milik app ini tidak punya entri izin app-level, jadi Tauri menjawab "Plugin not found"), lalu jatuh ke `POST /api/helpers/choose-folder` → `osascript "tell me to activate"` → aktivasi direbut → proses web-content di-suspend → setiap fetch yang sedang jalan mati dengan "Load failed" (itu kata-kata WebKit, bukan pesan Onesist) dan muncul dialog kedua. Sekarang `OpenProjectDialog` mencoba perintah native sekali lagi, lalu **beralih ke folder browser bawaan aplikasi** yang bicara langsung ke sidecar lewat HTTP (`/api/helpers/list-dirs`) tanpa proses anak; `system.ts` menolak jalur darwin saat `SA_DESKTOP=1` dengan pesan yang jelas, dan setiap kegagalan picker dicatat ke `logs/server.err.log` (`reportClientError`) sehingga rantai kegagalannya kelihatan.
- **Konsekuensi yang disengaja:** sheet folder bawaan macOS tidak lagi terjangkau di aplikasi desktop sampai `pick_folder` diberi izin app-level (atau dipindah ke dialog plugin). Ini keputusan desain yang masih terbuka — untuk sekarang folder browser bawaan aplikasi yang berlaku.

### Feat — Pilih provider BYOK saat membuka project
- Dialog **Open Project** kini punya dropdown provider (hanya provider buatan Anda yang siap pakai; bootstrap environment bukan konfigurasi tersimpan, jadi tidak bisa dijadikan default). Pilihannya **disimpan sebagai default aplikasi saat project dibuka**, jadi project berikutnya memakai provider yang sama tanpa ditanya lagi; tombol **Kelola** membuka pengaturan provider sebagai modal di atas dialog, dan **Batal tidak mengubah apa pun**.

### Catatan — DMG macOS sekarang ter-seal (rilis pertama setelah #5)
- Mulai rilis ini bundle macOS ditandatangani **ad-hoc** (`bundle.macOS.signingIdentity: "-"`), jadi Gatekeeper menampilkan dialog yang menawarkan **Open Anyway** alih-alih vonis "damaged" yang tidak punya jalan masuk. Belum ada Developer ID/notarization, jadi halaman rilis tetap membawa catatan pemasangan; jalur `xattr -cr /Applications/Onesist.app` tetap berlaku sebagai cadangan yang dijamin bekerja.

### Verifikasi
- `bun run typecheck` bersih, `bun run build` sukses, dan sidecar + shell Rust terkompilasi lewat `bunx tauri build --bundles app`.
- Bundle hasil build dijalankan: aplikasi boot, sidecar melayani `/api/health` 200, dan **quit terukur 0,48 detik** tanpa proses yatim.
- Penjaga picker diuji lewat sidecar produksi: dengan `SA_DESKTOP=1`, `POST /api/helpers/choose-folder` menjawab `{"path":null,"error":"Folder picker native gagal — jalur osascript dinonaktifkan di aplikasi desktop"}` (tidak ada osascript yang dijalankan), `POST /api/helpers/list-dirs` mengembalikan daftar direktori, dan jejak `[client] folder-picker/…` benar-benar mendarat di `logs/server.err.log` aplikasi.
- **Belum diuji:** jalur picker secara klik-nyata di macOS (yang diperiksa sisi server + peruteannya) dan perilaku di Windows — penulis PR juga belum mengujinya; cabang `win32` tidak berubah perilakunya dan penjaga di `system.ts` hanya berlaku untuk darwin.
- **Bump `0.1.46 → 0.1.47`**.

## v0.1.46 — Fix: skema DB memulihkan diri + hapus project yang pernah dipakai chat

### Fix — `no such table: business_requirements` setelah `data.db` dipindah antar mesin
- **`src/server/db/client.ts` — penjaga skema saat startup.** Folder project yang dipindah lewat zip (SQLite WAL belum di-checkpoint) membawa jurnal migrasi yang mengklaim revisi yang tidak ada di berkas `data.db`-nya, sementara Drizzle tidak pernah menjalankan ulang revisi yang sudah tercatat — tabel yang hilang tetap hilang dan aplikasi melempar `no such table: business_requirements`. Sekarang, saat runtime-migration berjalan, nama tabel yang seharusnya ada dibaca dari berkas migrasi; bila ada yang kurang, pernyataan `CREATE`/`ALTER` idempoten diputar ulang (pernyataan destruktif seperti `DROP`/`INSERT`/`UPDATE`/`DELETE`/`RENAME` dilewati) dan hasilnya dicatat di log server. Bila tabel masih kurang, langkah pemulihan ditulis ke log, bukan gagal senyap. Biaya terukur: 0,54 ms saat skema sehat (tanpa memutar ulang apa pun), 2,6 ms saat pemulihan penuh. Diverifikasi `verify-schema-repair.ts` — 11 check.

### Fix — Project tidak bisa dihapus bila pernah dipakai chat
- **`src/server/routes/projects/index.ts` — `DELETE /api/projects/:id` kini ikut menghapus thread chat.** `chat_threads.project_id` menunjuk ke `projects.id`, dan tidak ada satu pun penghapusan sebelumnya yang menyentuhnya, sehingga project yang punya percakapan selalu gagal dihapus dengan `FOREIGN KEY constraint failed` (HTTP 500 di dasbor). Terukur sebelum perbaikan: project dengan 5 thread → 500, tanpa thread → 200. Sekarang setiap thread project dihapus lewat `deleteThread` yang sudah ada (pesan, tool call, berkas, bacaan, run, dan baris FTS ikut bersih), dan baris index kode (`index_files`/`chunks`/`symbols`/`index_fts`, tanpa foreign key) dibersihkan lewat `clearProject` supaya tidak tertinggal yatim.

### Fix — Galat route API dijawab JSON, bukan halaman HTML 500
- **`src/server/api-router.ts`** — error yang dilempar handler route dulu lolos ke handler SSR dan kembali sebagai halaman HTML 500, sehingga `res.json()` di klien gagal pada HTML-nya alih-alih menampilkan pesan aslinya. Sekarang handler dibungkus dan membalas JSON `{"error": …}` 500 sekaligus mencatat penyebabnya di log server.

### Verifikasi
- `bun run typecheck` bersih dan build produksi (`bun run build:server`) hijau.
- `verify-api.ts` naik 35 → **41 check** dengan bagian G yang mereproduksi kegagalan FK hapus project. Bukti bahwa check-nya benar-benar menangkap kelas bug ini: dengan perbaikan di-revert sementara, bagian G gagal 5 check (`status=500`, `FOREIGN KEY constraint failed`, thread/baris index tertinggal); setelah perbaikan dipasang kembali, hijau.
- `verify-schema-repair.ts` — 11 check; `GET /api/projects/:id/rtm` pada DB yang dipulihkan menjawab 200.
- **Bump `0.1.45 → 0.1.46`**.

## v0.1.45 — Agent native di dalam aplikasi (chat, tool, BYOK) + gambar di markdown

Rilis besar: tab **Chat** per project menjalankan agent langsung di dalam Onesist memakai provider BYOK Anda — tanpa CLI agent. Fitur ini sebelumnya hidup di branch `feat/agent-native-chat`; rilis ini adalah kali pertama masuk ke `main`.

### Feat — Chat agent native (BYOK)
- **Runtime & provider**: Vercel AI SDK v7 di dalam aplikasi; dialog provider dengan 23 preset + custom (endpoint, gaya API, header HTTP tambahan), key hanya tersimpan di perangkat Anda, uji koneksi dengan hasil yang tersimpan.
- **Mode & izin**: tanya-jawab / kerja / **rencana** (read-only; rencananya bisa disetujui lalu dijalankan) dan 4 mode izin — Tanya dulu (kartu izin per penulisan), Otomatis, Tanpa shell, Read-only.
- **Tool agent**: baca/tulis/cari berkas, `bash` (environment dibersihkan), index FTS5 + `code_search`, subagent read-only, memory lintas percakapan, dan akses aplikasi: `db_query`/`db_schema` read-only plus `app_write` ke Tasks/RTM/Wiki.
- **UX chat**: panel bisa di-resize (lebar diingat), pesan bisa disalin, isi tool terlipat sampai diklik, **antrian pesan** dan **pesan sisipan** ke run yang sedang berjalan, pencarian lintas percakapan, slash command, serta token & perkiraan biaya per percakapan.
- **Notifikasi native**: dua pemicu — run mencapai status akhir saat jendela tidak fokus, dan run menunggu izin. Catatan: di `tauri dev` plugin mengarahkan notifikasi ke Terminal, jadi uji banner harus memakai aplikasi ter-bundle, dan macOS hanya menanyakan izin sekali — jawab **Allow** (jangan Return, defaultnya Don't Allow).

### Feat — Gambar di markdown (input/assets)
- Editor markdown (FSD, Wiki, Overview) kini punya tombol gambar, paste, dan drag-drop; berkas disimpan ke `input/assets/` dan markdown menyimpan path relatif (`![UI](input/assets/foo.png)`).
- Semua viewer merendernya: FSD, Wiki, Spec, Docs, SIT, chat, dan **kartu task FE/fullstack** — task yang menunjuk gambar desain menampilkan UI-nya di samping link Figma (skill `fsd-analyzer` 1.5.0 → 1.6.0).
- Ekspor DOCX belum memuat gambar (menyusul).

### Fix — Tiga tab (Tasks/RTM/Wiki) ikut berubah dari jalur berkas
- Peta permukaan di prompt menyuruh agent memanggil endpoint impor (`tasks/import`, `rtm/import/apply`) setelah menulis artefak, sehingga hasil kerja berbasis berkas muncul di tab berbasis DB tanpa aksi manual — lewat panggilan yang terlihat di transcript, bukan penulisan database senyap.

### Fix — Keamanan: whitelist `app_write` tidak bisa lagi ditembus
- Penjaga whitelist memeriksa path mentah sementara URL dinormalisasi setelahnya, sehingga `projects/<id>/tasks/../../../chat/threads/<tid>` lolos pemeriksaan (terukur sebelum perbaikan: thread chat benar-benar terhapus dan `PUT …/../settings` diterima). Sekarang path di-decode, pemisah diseragamkan, `..` ditolak sebelum pemeriksaan, dan placeholder `:id`/`<projectId>` diselesaikan. Suite `verify-db-access` naik 66 → 80 check.

### Fix — lain-lain
- **Banner skills tidak lagi jalan buntu**: project dengan sebagian skill terpasang (status `pending`) kini punya tombol Install, nama skill diambil dari payload, polling 250 ms, dan kegagalan nyata ditampilkan.
- **Uji koneksi provider bertahan** setelah menekan Kembali, dan daftar provider disegarkan.
- **Kegagalan notifikasi tercatat di log server** (sebelumnya ditelan senyap); UX tetap tidak terganggu.

### Verifikasi
- `bun run typecheck`, build produksi (`bun run build:server`), dan **16 suite verifikasi** hijau. Aplikasi ter-bundle diuji untuk notifikasi: jendela fokus → senyap, jendela tidak fokus → event sampai, plugin dimuat, dan notifikasi terkirim (banner menunggu izin OS di System Settings → Notifications → Onesist).

## v0.1.44 — Fix: skill diagram-svg & query-writer tidak pernah sampai ke aplikasi

### Fix — dua skill baru selalu gagal terinstal (project baru tidak bisa lanjut)
- **`src-tauri/src/sidecar.rs` — `ensure_skills_dir()` disegarkan setiap kali aplikasi dibuka.** Sebelumnya fungsi ini hanya menyalin `resources/vendor-skills` ke appData **satu kali seumur instalasi** (penjaganya: "kalau `fsd-analyzer/SKILL.md` belum ada"). Akibatnya, begitu aplikasi pernah dijalankan, penambahan skill baru di rilis berikutnya tidak pernah ikut tersalin: salinan di appData tetap berisi `fsd-analyzer` + `markitdown` saja. Installer lalu melaporkan `Vendored skill missing: vendor/skills/<nama>/SKILL.md` untuk `diagram-svg` dan `query-writer` — 2 dari 4 skill gagal, dan project baru tidak bisa melewati langkah setup skill. Sekarang perilakunya sama seperti `ensure_server_dir`: direktori dibersihkan lalu disalin ulang tiap launch.

### Fix — project duplikat saat percobaan diulang
- **`src/server/routes/projects/index.ts` — `POST /api/projects` kini idempoten per folder.** Setiap percobaan membuka folder mengirim POST baru dan tiap POST menyisipkan baris baru, jadi folder yang sama menumpuk menjadi beberapa project identik ketika langkah setup skill gagal dan diulang. Sekarang folder yang sudah terdaftar (dibandingkan lewat `path.resolve`, mengabaikan garis miring di akhir) mengembalikan baris yang sudah ada.

### Verifikasi
- Route API asli di server uji, dengan salinan database aplikasi dan `SA_VENDOR_SKILLS_DIR` menunjuk ke salinan appData asli: POST folder yang sama dua kali mengembalikan **id yang sama** (1 baris di DB), lalu `POST /skills/install` mencapai `ready` dengan keempat skill (`fsd-analyzer`, `markitdown`, `diagram-svg`, `query-writer`) terpasang dan `SKILL.md` benar-benar ada di `.agents/skills/` project.
- Salinan appData yang basi juga sudah disinkronkan langsung, sehingga aplikasi yang sedang berjalan bisa menginstal tanpa menunggu rilis.
- **Bump `0.1.43 → 0.1.44`**.

## v0.1.43 — Fix: hapus project + banner skills yang macet

### Fix — Project tidak bisa dihapus
- **`src/server/routes/projects/index.ts`** — hapus project gagal total begitu project punya baris anak. Penyebabnya snapshot/endpoint anak dihapus memakai **id project**, padahal kolomnya menunjuk ke id baris induknya (`erd_snapshots.erd_id → erds.id`, `api_snapshots`/`api_endpoints.spec_id → api_specs.id`, `wiki_snapshots.page_id → wiki_pages.id`, `task_snapshots.task_id → tasks.id`). Penghapusan itu tidak mengenai apa pun, lalu penghapusan baris induk melanggar foreign key (`PRAGMA foreign_keys = ON`) sehingga seluruh request gagal — tidak ada project yang bisa dihapus selama ada baris anak. Sekarang id anak dikumpulkan dulu, baru dihapus berdasarkan id tersebut.

### Fix — Banner "Installing required project skills" tidak pernah selesai
- **`src/server/routes/projects/skills.ts`** — `skillsStatus` di DB bisa tertinggal bernilai `installing` (mis. app ditutup saat install berjalan) dan tidak pernah dibersihkan; route install lalu menolak setiap percobaan dengan 409 "Installation already in progress", jadi bannernya macet permanen. Status sekarang dihitung dari keadaan disk dan `installing` hanya dilaporkan selama install benar-benar berjalan di proses ini (penanda in-memory per project), sehingga retry selalu bisa dan kegagalan tampil sebagai `failed` beserta pesannya, bukan menggantung.

### Verifikasi
- Route API asli dijalankan pada server uji dengan **salinan database aplikasi**: `DELETE` untuk project berisi anak (36 spec + 105 task, dan 1 spec + 21 task) menjawab HTTP 200 dan baris bersih; `GET /skills` menjawab `pending` ketika kolom DB dipaksa `installing`; alur install selesai `ready` dengan `fsd-analyzer`, `markitdown`, `diagram-svg`, `query-writer` terpasang.
- **Bump `0.1.42 → 0.1.43`**.

## v0.1.42 — ERD canvas performance + dev window loads Vite

### Perf — ERD canvas (86 tables / 702 columns)
- **Viewport-only mounting** (`src/components/erd/ErdCanvas.tsx`): `onlyRenderVisibleElements` — hanya tabel di dalam viewport yang di-mount.
- **`content-visibility: auto`** pada baris kolom (`src/styles.css` `.erd-col-row` + `TableNode.tsx`) — baris di luar layar dilewati layout/paint-nya, sehingga pan/zoom tidak lagi membayar ~700 baris tiap frame.
- **Seleksi tidak lagi mahal**: layout (`src/lib/erd-layout.ts`) tidak bergantung pada tabel terpilih, node/edge hanya dibuat ulang bila hasilnya berubah, dan efek styling dibuat idempoten (sebelumnya memicu React #185 "Maximum update depth exceeded" pada schema 86 tabel).
- **Transisi opacity inline & animasi dash edge dihapus** — keduanya memaksa style-recalc/repaint tiap frame saat viewport bergerak.
- **`TableNode` di-memo** + tabel bisa digeser lewat header (`.erd-drag-handle`, `dragHandle` per node) tanpa membuat nama kolom tidak bisa diblok.
- **Parse di-debounce + dedupe** (`src/routes/projects.$id.erd.tsx`) — file yang tidak berubah tidak di-parse ulang; ganti file tidak lagi membawa seleksi lama.

### Fix — SSE stream putus tiap ~12 detik
- **`keepAlive` 15s → 5s** (`src/server/routes/sse.ts`). `Bun.serve` menutup koneksi tanpa byte selama 10 detik, jadi stream mati sebelum keepalive-nya sendiri sempat terkirim; EventSource di WebView menyambung ulang diam-diam dan memutar ulang handler `file:changed` — inilah yang membuat halaman ERD seolah me-refresh sendiri terus-menerus (terukur: mati di 12.0s, setelah perbaikan hidup 45s).

### Fix — `bunx tauri dev` memuat build lama (halaman tanpa CSS)
- **Window dev memuat devUrl Vite**, bukan salinan statis sidecar (`src-tauri/src/lib.rs`, debug build; `SA_DEV_SERVER_URL` opsional, divalidasi http/https). Sebelumnya window selalu diarahkan ke port sidecar, sehingga HTML/CSS dari build produksi terakhir yang dilayani — hash aset tidak pernah cocok dengan kode dev dan halaman tampil tanpa CSS. Pakai `localhost`, bukan `127.0.0.1`: Vite (Bun) hanya listen di IPv6 `[::1]`.

### Chore
- `beforeDevCommand` (`src-tauri/tauri.conf.json`): pola `pkill` di-bracket (`'[o]nesist-server'`) supaya tidak mencocokkan shell-nya sendiri, plus pembersih port 4321.
- `.gitignore`: state security-scan `.mimosa/` + `agent-approval.secret` (kredensial lokal).
- **Bump `0.1.40 → 0.1.42`** (0.1.41 sudah dipakai di branch lain).

## v0.1.41 — Pi agent + Task H1/H3 general fallback

### Feat — Agent
- **Pi CLI (pi.dev) as 5th agent** (`src/lib/agent-cli.ts`, `agent-command.ts`, `server/services/agent-runner.ts`, `server/routes/system.ts`, `public/images/pi.*`) — detect `pi` via `resolveExecutable`, headless `pi --mode json` + session `id` capture from `{"type":"session"}` header, stream parser `message_update` (`text_delta`/`thinking_delta`/`toolcall_*`) + `tool_execution_*`, `pi --list-models`, logo SVG (prefers-color-scheme) + 128 PNG, Settings chip, manual `pi --mode json` fallback in `/api/agent/prompt`.
- **System prompt fallback** — OpenAPI/RTM/SIT manual commands support `pi` in `src/server/routes/system.ts`.

### Fix — Tasks
- **General H1/H3 fallback** (`src/lib/task-parser.ts`) — AI via `fsd-analyzer` kadang tulis `output/task/*.md` sebagai `# Task \[FE]: Title` (H1 bracket) + `### T1 — ...` Action List (H3) bukan `## Task`. Fallback: jika `## Task` 0, scan `### T1` → card `tracking_leads_skip_duplicate_000-T1` dengan `Goals/Scope/AC/Flow Logic`; jika tanpa `T1`, fallback H1 single-task tolerant bracket `\[FE]`/`[BE]`, code=`moduleName`.
- **Scanner** — root `output/task` sekarang scan semua `*.md` (exclude `README`/`index`) prioritas `task_*` dulu, jadi `lepas_validasi_fe.md` tanpa prefix tetap ter-parse.
- **H2 kanonik** — pattern `## Task \[FE]:` dengan escaped bracket sebagai auto-number.
- **SP/AC toleran** — `Story Point` regex toleran `0.5 SP (2 jam)` (capture angka saja), `Acceptance Criteria` heading `#{2,}` agar `## Acceptance Criteria` (H2) ke-capture, bullet `[-*]` agar `* [ ]` dan `- [ ]` keduanya ke-capture.
- **Observability** — `POST /api/projects/:id/tasks/import` return `skippedFiles` + `console.warn`, UI Tasks badge tooltip list file kosong.

## v0.1.40 — Skills: query-writer (Oracle) for Spec & Task

### Feat — Skills
- **query-writer v1.0.0 (Oracle CRM Dashboard)** (`vendor/skills/query-writer/SKILL.md` + `rules/query_rules.md` 8-section: FROM→JOIN→WHERE→GROUP BY→HAVING→SELECT→ORDER BY→FETCH, per-clause rules, 8-step checklist, `FETCH FIRST / OFFSET FETCH NEXT`, `mst_/trn_/tmp_`, no `SELECT *`, tanggal range `>= / <` WIB)
- **fsd-analyzer v1.4.0 → 1.5.0** — integrate query-writer: `references/query_writer.md` + `references/query_rules.md`, description/modes/trigger phrases/core responsibilities/output/quality gates updated; Spec Flow Logic & Task SQL base now enforce Oracle standard
- **Sync** → `/Users/user/Documents/Work/fsd-analyzer` (SKILL.md + 2 refs, no new folder) + `src-tauri/vendor-skills/fsd-analyzer`
- **Bump `0.1.39 → 0.1.40`**.

## v0.1.39 — Theme: light parity with landing

### Feat — Theme
- **Light mode sync `landing (#fcfcfa / #6d7cff)`** (`src/styles.css:10` `html:not([data-mode=dark])` overrides `--color-kumo-brand #6d7cff`, `recessed #fcfcfa`, `elevated/base #fff` + `glass` white translucent gradients matching `landing/src/styles.css`, `src/lib/theme.ts:24` default `dark → light` + `WINDOW_BG light #fcfcfa` for Tauri)
- **Bump `0.1.38 → 0.1.39`**.

## v0.1.38 — Brand: real logo for Tauri + splash + web

### Feat — Brand
- **Logo `logo.png` (glossy blue glass) → `public/logo.png` + `logo-icon.png` + `logo-square.png` (1024)** — `src-tauri/icons` regenerated via `tauri icon` (all sizes, icon.png 512, icns/ico), `src/routes/__root.tsx:38` sidebar header `OS` badge → `<img src="/logo-icon.png">`, `public/splash.html:26` white rounded `logo-wrap` with `img src="logo-icon.png"` (relative, 72→padding 6, transparent fallback), `dist/client/logo*.png` verified 860k/710k/516k.
- **Bump `0.1.36 → 0.1.38`** for icon change.

## v0.1.36 — Fix splash logo broken on Windows

### Fix — Desktop
- **Logo splash rusak `src not found` di Windows** (`public/splash.html:124` `src="/icons/icon.png"` → hapus `img`, pakai `logo-fallback OS` saja) — `dist/client/splash.html` load via `tauri://localhost/client/splash.html`, absolute `/icons/...` jadi `dist/icons/...` tidak ada (file di `dist/client/icons/...`), `onerror` tidak ke-trigger di WebView2. Sekarang pure `OS` badge tanpa external image, no broken src.

## v0.1.35 — Fix splash not showing

### Fix — Desktop
- **Splash first-open tidak muncul** (`src-tauri/src/lib.rs:119` `mut` + `always_on_top` + `client/splash.html` path + `app_data` dir create) — `E0384` mut sudah fix di `v0.1.33` tapi `transparent` dihapus, `center` tetap, tambah `always_on_top(true)` + `create_dir_all` + log `eprintln!` untuk debug. Splash hanya first open (`app_data/.first_run_done` marker, `sampai selesai` `wait_healthy`), next open skip.

## v0.1.34 — CI: avoid macos-14 runner queue

### CI — Release
- **max-parallel 1** (`.github/workflows/release.yml:13`) — `macos-14` free tier cuma 1 concurrent runner. Matrix sebelumnya butuh 2× `macos-14` paralel → `Waiting for a hosted runner...` lama. Sekarang sequential.

## v0.1.33 — Chore: sanitasi + LICENSE + fix splash mut

### Chore — Sanitization
- **Hapus `docs/SIT - EHS FIF.xlsx`** (3M) — `git rm --cached` + `.gitignore` `docs/SIT - EHS FIF.xlsx`, file tetap ada lokal ter-ignore, tidak ikut commit lagi. History lama `cd83c51` masih ada — jika perlu purge total kabari.
- **Placeholder `PT Maju Bersama` → `Example Corp`** (`src/routes/projects.$id.docs.tsx:24`) — hilangkan pattern `PT` agar tidak ke-flag.
- **`ehs_xxx` → `example_table`** (`vendor/skills/fsd-analyzer/references/sit_instructions.md:87` + `src-tauri/vendor-skills/...`) — generic, bukan client.

### Fix — Build
- **E0384 `cannot assign twice to immutable`** (`src-tauri/src/lib.rs:119` `is_first_run`/`splash_marker`/`splash_window`) — tambah `mut`. `cargo check` pass.

### Feat — Legal
- **LICENSE MIT** (`LICENSE`) — `Copyright (c) 2026 rogasper.com`, sebelumnya tidak ada file LICENSE di root (package.json `license: MIT` saja).

## v0.1.32 — Fix build + RTM delete

### Fix — Build
- **E0599 `transparent` not found** (`src-tauri/src/lib.rs:138` `WebviewWindowBuilder::transparent`) — Tauri 2.11 `WebviewWindowBuilder` tidak ada method `transparent` (hanya `decorations`/`center`), hapus `.transparent(true)` (splash tetap opaque `#0a0a0a`). Verified `cargo check` pass (sebelumnya fail di `v0.1.31`).

### Feat — RTM
- **Delete RTM** (`src/components/rtm/RtmMatrix.tsx:91` + `EntityDialog.tsx:26`) — sebelumnya hanya `Edit`/`Create`. Sekarang `Trash` di cell `BR`/`FR` + card `Design`/`Test` (disamping `X` unlink) + tombol `Delete` di dialog `Edit`. `DELETE /api/projects/:id/rtm/:kind/:itemId` sudah ada (cascade `rtmLinks` / `brId=null`), tinggal expose UI. `bun run typecheck` pass.

## v0.1.31 — Feat: first-open splash + ERD silent auto-import

### Feat — Desktop
- **Splash first-open pure CSS** (`public/splash.html` + `src-tauri/src/lib.rs:122`) — centered `logo 72 + ONESIST + by rogasper.com` + `dot bounce` + `progress bar`, `decorations:false` `center` `480×320` (tanpa `transparent` agar build pass). Hanya tampil di first open (marker `app_data/.first_run_done`), `sampai selesai` (`wait_healthy` selesai baru `splash.close()` + `main.show()` + tulis marker). Next open skip.
- **ERD new project silent** (`src/routes/projects.$id.erd.tsx:22`) — `useFileList` `output/erd` + `refresh` retry 3× 900ms jika `files.length===0` (Windows path race), `useFileWatch("erd")` + `useFileWatch("master")` auto `refreshFiles()` + `refreshContent()` saat `erd.dbml`/`MASTER_ERD.md` baru muncul (tanpa banner, silent).

## v0.1.30 — Fix build: url crate + type annotation for multi-window

### Fix — Build
- **E0282 type annotations needed** (`src-tauri/src/lib.rs:52` `url.parse().map_err(|e| e.to_string())`) — `String::parse` butuh `::<url::Url>` turbofish, tambah `url = "2"` dep di `src-tauri/Cargo.toml`. Verified `cargo check` pass (sebelumnya fail di `v0.1.29`).

## v0.1.29 — Feat: multiple window (share port, limit 5, dashboard) + taller cards + sidebar overflow

### Feat — Desktop & Dashboard
- **Multiple window** (`src-tauri/src/lib.rs:18`, `src/lib/window.ts`) — `open_project_window` command `WebviewWindowBuilder` share 1× sidecar (port 4321/4331), limit 5 window (`win-{uuid}`), default `Dashboard` (`/`). `Window → New Window (Cmd+N)` menu, `right-click / Ctrl+Click` project card → new window, `main` close-to-tray, `win-*` close langsung. `single_instance` tidak block window kedua, `tray` hanya untuk `main`.
- **Sidebar overflow** (`src/routes/__root.tsx:151`) — `Sidebar.Content` `overflow-y-auto scrollbar-thin`, tanpa search (sesuai request).
- **Dashboard revamp** (`src/routes/index.tsx`) — grid `h-[260px]` taller card (header + meta `rootPath`/`company`/`description` + stats `createdAt`/`ID` + preview placeholder + footer `Open` / `New Window` / `Delete`), pagination 12/page (`PER_PAGE=12`, `page` state, `Prev/Next` + `Badge`), `Ctrl/Cmd+Click` / `right-click` → new window.

## v0.1.28 — Fix handoff: strict context + single combined prompt

### Fix — Handoff (planner → executor)
- **Strict `context/`** (`src/server/routes/projects/handoff.ts:278` + `src/lib/file-router.ts:133`) — `GET /handoff?format=zip` sekarang validasi `MASTER_ERD.md` / `MASTER_SPEC_API.md` / `project_context.md` via `findMasterFile` (cek `root`, `output/`, `docs/` + shallow scan depth 2). Jika hilang dan `force!=true`, return `400 {missing, prompt}` dan UI block export.
- **Satu prompt gabungan** (`buildCombinedMissingPrompt`) — untuk semua file hilang sekaligus (baca `output/erd/*.dbml`, `output/spec/*.md`, `project_context_template.md`), Indonesian deskripsi, English tech. Copy 1-klik di dialog, paste ke agent → agent buat semua file di root → Export lagi tanpa `force`.
- **Export dengan placeholder** — jika SA pilih `force=true`, zip tetap dibuat dengan `context/` placeholder + `manifest.warnings` + `README` note, jadi zip selalu ada `context/` (real atau placeholder).
- **UI Tasks Export** (`src/routes/projects.$id.tasks.tsx:342`) — dialog `kumo Dialog` tampilkan `missing` list + preview prompt + `[Copy Prompt]` (guard `copied`) + `Batal` / `Export dengan placeholder`.

## v0.1.27 — Fix terminal: pure-terminal Shift+Enter / Ctrl+Enter, block select, paste

### Fix — Terminal (pure interaction, no UI buttons)
- **`Shift+Enter` / `Ctrl+Enter` / `Cmd+Enter` → newline** (`src/components/agent/AgentTerminal.tsx:339`) — sebelumnya `Shift+Enter` kirim `\r` identik dengan `Enter` (submit). Sekarang `attachCustomKeyEventHandler` + fallback `keydown` capture di container (guard `shiftEnterBoundRef`) deteksi `Enter` dengan `shift/ctrl/meta/alt` via `e.key`/`e.code`/`keyCode` dan kirim `"\n"` ke PTY; `Enter` polos tetap `"\r"`. Enable kitty `\\x1b[?2017h` untuk TUI kitty-aware (`opencode`/`claude`/`codex`). Verified `Ctrl+Enter` newline, `Shift+Enter` kini juga newline (sebelumnya hanya `Ctrl+Enter` yang ke-detect).
- **`Block tulisan` (drag select) bisa** — tambah handler `Ctrl+C`/`Cmd+C` + `term.hasSelection()` → `return false` (biarkan browser copy) vs tanpa selection → `0x03` SIGINT. Sebelumnya `Ctrl+C` selalu `SIGINT`, selection tidak ke-copy.
- **`Paste` `Ctrl+V`/`Cmd+V` tanpa button** — `attachCustomKeyEventHandler` `return false` untuk `Ctrl/Cmd+V` + `paste` listener di `container` (`pasteBoundRef`) baca `e.clipboardData` / `navigator.clipboard.readText()` (Tauri) lalu `ws.send({type:"input"})`. `Ctrl+Shift+V` / right-click tetap via xterm default.

## v0.1.26 — Fix desktop PlantUML: bundled converter (no node_modules)

### Fix — Desktop macOS
- **`ERR_MODULE_NOT_FOUND @grethel-labs/excaliplant`** at `app_data/server/server/scripts/plantuml-convert.mjs` — the Tauri sidecar copies the *source* converter to appData where there is no `node_modules`, so Node cannot resolve the excaliplant package. Now `scripts/post-build.mjs` bundles the converter into a **single self-contained `plantuml-convert.js`** (`bun build ... --target node --minify`, 1.69MB embedding excaliplant + elkjs) which runs standalone anywhere. `src/server/routes/canvas.ts` prioritizes `plantuml-convert.js` (bundled) over `plantuml-convert.mjs` (source, dev). Verified standalone at `/tmp` without node_modules.

## v0.1.25 — Fix desktop PlantUML & icons (Tauri)

### Fix — Desktop macOS
- **PlantUML `MODULE_NOT_FOUND /scripts/plantuml-convert.mjs`** (`src/server/routes/canvas.ts:22`) — `process.cwd()` di Tauri adalah `/` (macOS GUI), jadi `path.resolve(cwd, "scripts/...")` → `/scripts/...` tidak ada. Sekarang resolve via `import.meta.url` (`src/server/routes/canvas.ts` → `../../../scripts`), `SA_CLIENT_DIR` (`app_data/server/client` → `../server/scripts`), dan `dist/server/scripts` (post-build). `scripts/post-build.mjs:32` copy `plantuml-convert.mjs` ke `dist/server/scripts` + `dist/server/assets/scripts` agar ikut `web-dist` dan sidecar.
- **Icons tidak muncul di desktop** (`src/server.ts:138`) — `ASSET_PREFIXES` hanya `["/assets/","/images/"]` sehingga `/icons/manifest.json` & `/icons/...svg` jatuh ke SSR (HTML). Tambah `"/icons/"` → `serveStatic` serve dari `SA_CLIENT_DIR` (`app_data/server/client/icons` via `prepare-resources` copy `dist/client/icons`).

## v0.1.24 — Canvas HLD: dual-engine Mermaid+PlantUML, tech icons, Icon Library

### Canvas — Sketch & Wireframe → HLD Architecture
- **Dual-engine import** — dialog `Import Diagram` kini punya tab **Mermaid** dan **PlantUML (excaliplant)**. Mermaid tetap via `@excalidraw/mermaid-to-excalidraw`, PlantUML via `@grethel-labs/excaliplant` → ELK layout → Excalidraw JSON. PlantUML dijalankan server-side (`POST /api/canvas/plantuml` → Node subprocess `scripts/plantuml-convert.mjs`) agar tidak kena Bun Worker bug (`elk.bundled.js:6567`). Template baru: Deployment (VPC/DB/Queue), Nwdiag (network lanes), Component/C4.
- **Tech icon enrichment** — `src/lib/arch-icons/tech-keyword-map.ts` mapping `postgres→postgresql.svg`, `redis→redis.svg`, `kafka→kafka.svg`, `react→reactjs.svg`, `bun→bunjs.svg`, `aws/ec2→EC2.svg` dst. Saat import Mermaid, label node yang match otomatis disisipkan `image` 28×28 di sebelah shape (`ExcalidrawInner.tsx:enrichMermaidWithIcons`).
- **Icon Library 2100+** — `public/icons/{aws,azure,cncf,developer}` (18 MB, `manifest.json` 2103 shapes) dari OpenFlowKit `assets/third-party-icons`, plus `scripts/sync-icons.mjs` untuk sync ulang. Picker `src/components/canvas/IconPicker.tsx` searchable, filter pack (`aws/azure/cncf/developer`), lazy `fetch("/icons/manifest.json")`, insert sebagai `image` 56×56 + label + box. `src/lib/arch-icons/registry.ts` (`getIconDataUrl` base64 `data:image/svg+xml`).
- **Architecture presets** — `src/components/canvas/ArchPresets.ts` (`createTechNode`, `createPostgresNode`, `createRedisNode`, `createBunNode`, `createReactNode`, `createTauriNode`, `createKafkaNode`, `createDockerNode`, `createNginxNode`, `createC4SystemBox`, `createVpcFrame`, `createMicroserviceLane`). Toolbar `Architecture` dropdown di `ExcalidrawInner.tsx:886` (tech nodes dengan icon SVG via `getIconDataUrl` + placeholder 32×32 → `image` + `restoreElements`).
- **Fixes** — `image` element kini lengkap (`angle,fillStyle,strokeWidth,strokeStyle,roughness,opacity,frameId,roundness,crop` + `restoreElements`) agar tidak blank putih; `IconPicker` filter diperbaiki (load `allShapes` lalu `useMemo` scoring, bukan limit-60-dulu); `vite.config.ts` `optimizeDeps.exclude` & hapus alias `node:fs` yang merusak SSR `path.resolve`; `src/types/excaliplant.d.ts` stubs.

## v0.1.18 — Import tasks_*.md (plural prefix), file tree terbaca di folder dalam

### Import Tasks
- **Terima prefix `tasks_` (jamak)** (`src/lib/task-parser.ts`) — scanner hanya mengenali `task_*.md` (tunggal, sesuai skill); file yang dihasilkan agent sebagai `tasks_001.md`/`tasks_002.md` tidak pernah di-scan sama sekali (0 task, tanpa feedback). Kini `/^tasks?_/i` diterima (case-insensitive).
- **Kode unik per file** — sisa angka setelah prefix (`tasks_001` → `001`) dipertahankan sebagai module, sehingga kode task `001-1..001-5` / `002-1..002-6` tidak bertabrakan antar file (sebelumnya diruntuhkan ke `task-*` → dedupe membuang task file kedua). Terverifikasi dengan 2 file riil (11 task, SP benar).

### File Tree (Overview)
- **Indentasi per level dikurangi** ±27-29px → ±19px (wrapper 15px→10px, per-level 12-14px→9px) dan **panel diperlebar** `w-56` (224px) → `w-64` (256px) — nama di kedalaman 7 kini terbaca ±10-12 karakter sebelum ellipsis (sebelumnya 1-3 karakter).
- Perilaku tetap standar (seperti Windows File Explorer): ellipsis + tooltip nama lengkap saat hover, tanpa scroll horizontal di tree.

---

## v0.1.17 — Fix Dock Quit macOS tidak benar-benar keluar (sumber kebocoran RAM 80-100 GB)

### Bugfix / Hardening (macOS)
- **Observer terminasi macOS** (`src-tauri/src/quit_observer.rs`) — Tauri tidak selalu memicu `RunEvent::ExitRequested` untuk Dock right-click Quit / Cmd+Q (isu resmi tauri-apps/tauri#9198, masih open). Tanpa hook ini, handler close-to-tray melihat `QUITTING=false` dan **menyembunyikan jendela alih-alih keluar** — aplikasi terus berjalan dengan WebView tersembunyi yang bocor tanpa kendali (teramati 80-100 GB). Kini `NSApplicationWillTerminateNotification` di-observe (objc2): saat macOS menghentikan aplikasi, proses langsung hard-exit.
- **Aman untuk update relaunch** — flag `RESTARTING` di-set di jalur restart (`ExitRequested` kode `i32::MAX`); observer mengeceknya sebelum exit sehingga Tauri tetap bisa men-spawn instance baru (aplikasi tetap terbuka kembali setelah update).
- Deps baru: `objc2` + `objc2-foundation` (sudah ada di tree via tauri).

---

## v0.1.16 — Memory watchdog proses utama + destroy window saat keluar (fix RAM 80 GB saat update)

### Bugfix / Hardening memori (macOS)
- **Watchdog memori untuk proses utama** (`src-tauri/src/memory.rs`) — thread sampling RSS proses Onesist (Tauri shell + WebView) tiap 10 detik; melewati `SA_MAX_MAIN_RSS_MB` (default 6000 MB) → log + exit. Sebelumnya hanya sidecar Bun yang punya watchdog (`SA_MAX_RSS_MB`) — WebView yang bocor bisa tumbuh tanpa kendali (teramati **80 GB** saat memasang update/relaunch di macOS). RSS dibaca via `task_info`/`mach_task_basic_info` (macOS) dan `GetProcessMemoryInfo` (Windows, `windows-sys`).
- **Destroy window di jalur keluar** (`src-tauri/src/lib.rs`) — handler `ExitRequested` (user quit maupun restart update) kini menghancurkan jendela utama terlebih dahulu, sehingga WKWebView melepas memorinya seketika alih-alih hidup selama teardown update/relaunch (sumber kebocoran). Aplikasi tetap terbuka kembali setelah update (jalur restart `i32::MAX` tidak berubah).
- Deps baru: `libc` (macOS) + `windows-sys` 0.52 (Windows, target-gated).

---

## v0.1.15 — Fix spec API card tidak terdeteksi (heading `NO 1 —` tanpa titik dua)

### Bugfix
- **Parser spec menerima `### NO 1 — POST \`/path\`` (spasi, tanpa titik dua)** (`src/lib/spec-parser.ts`) — colon pada prefix `NO` dibuat opsional (`NO:?`). Sebelumnya hanya format kanonik skill `### NO: 1 — …` yang dikenali; file yang ditulis model dengan `NO 1` (spasi) menghasilkan 0 endpoint → card kosong, hanya tampilan Document yang bisa dibaca. Terverifikasi dengan 3 file riil (`spec_api_001.md` → 2 endpoint, `spec_api_004.md` → 5, `spec_api_pa.md` → 4, method/path tepat) + uji regresi 10 kasus.

---

## v0.1.14 — Fix agent stuck, update banner progress, spec parser toleran, macOS update relaunch, UI fixes

### Agent & SSE — UI tidak lagi stuck "berjalan" padahal proses selesai
- **`AgentStream` replay berbasis delta timestamp** (`src/components/agent/AgentStream.tsx`) — guard replay satu-kali diganti cursor `appliedTsRef` yang persisten: setiap init/reconnect/`onopen` menerapkan ulang event yang lebih baru dari kursor (idempotent). Sebelumnya, event selesai (`completed`/`done`) yang direkam server saat jendela di-hide (SSE ditutup `usePageVisible`) tidak pernah di-replay → UI stuck "Agent berjalan…" sampai refresh. Kini event selesai langsung ter-replay saat jendela kembali terlihat.
- **Reconnect dengan ticket baru** — koneksi yang putus tidak lagi memakai ticket basi (auto-reconnect EventSource → 401 selamanya); setiap reconnect fetch ticket baru + delta replay, dengan backoff dan cap retry. Jaring pengaman terakhir: stream mati permanen → polling `/api/agent/status` → UI un-stick dengan pesan peringatan.
- **TTL ticket SSE 60s → 30 menit** (`src/server/realtime/events.ts`) — membantu semua konsumen SSE (FSD/tasks/spec) yang mengandalkan auto-reconnect.

### Auto-update
- **Progress download di banner update** (`src/components/UpdateBanner.tsx`) — alur baru: "Unduh & Pasang" → bar progress dengan persentase (indeterminate bila server tidak kirim Content-Length) → "Update siap dipasang" → tombol "Install & Restart". Error dibedakan fase: error pengecekan vs error download/install (menampilkan pesan aslinya).
- **Fix macOS: aplikasi tidak terbuka lagi setelah update** (`src-tauri/src/lib.rs`) — handler `ExitRequested` kini membedakan user quit (hard-exit tetap) vs restart dari `relaunch()` (kode `i32::MAX`): hard-exit di-skip untuk restart agar jalur Tauri `process::restart()` berjalan dan aplikasi terbuka kembali di versi baru. Windows tidak terpengaruh (NSIS yang relaunch sendiri).

### Spec API — parser toleran + auto-sync
- **Parser toleran** (`src/lib/spec-parser.ts`) — endpoint kini terdeteksi untuk berbagai varian heading yang dihasilkan model: `### NO: 1 — GET /api/users` (kanonik), `### 1. GET /api/users — judul` (titik), `### GET /api/users` (tanpa ID), `#### POST /api/v1/login | desc` (pipe), `## GET /api/users` (H2 rata), dan fallback modul H1 (judul dokumen dilewati). Method/path di heading diteruskan ke card; legacy table & SKIP_SECTIONS tetap.
- **Auto-sync seperti Tasks** (`src/routes/projects.$id.spec.tsx`) — import otomatis saat halaman dibuka + live via SSE `file:changed` (filter `output/spec`); tombol "Sync to DB" tetap sebagai refresh manual. Badge menampilkan `· N file kosong` saat ada file gagal parse; card kosong kini menampilkan peringatan + saran tampilan Document (tidak lagi senyap).

### Overview & FileTree
- **Context menu pada pill tab** (Overview) — klik kanan: Close tab / Close other tabs / Close all tabs, dengan guard "Discard unsaved changes?" bila ada edit belum disimpan.
- **Scrollbar strip tab disembunyikan** (`.no-scrollbar`) — scrollbar horizontal tidak lagi menimpa pill sehingga klik kanan berfungsi penuh; scroll tetap via wheel.
- **Fix nama terpotong di FileTree** (`FileTree.tsx`/`FileRow.tsx`) — ellipsis kini benar-benar berfungsi (label div `min-w-0 truncate`, nama folder `flex-1 min-w-0`), nama lengkap tersedia via tooltip hover; folder sedalam apa pun tidak lagi ter-clip.

---

## v0.1.13 — Fix cursor MDXEditor melompat ke awal (Windows, halaman FSD)

### Bugfix
- **Cursor editor tidak lagi melompat ke awal dokumen** (`src/components/mdx/MdxEditorClient.tsx`) — guard `lastPushed` kini membandingkan **bentuk canonical** (`escapeMdxContent(unescapeMdxContent(v))`) di kedua sisi, bukan serialisasi mentah editor. Sebelumnya MDXEditor mengeluarkan `<` sebagai `\<`/raw `<` dan `>` raw (LF), sementara guard membandingkannya dengan bentuk escaped (`&lt;`/`&gt;`, kemungkinan CRLF dari file Windows) — keduanya tidak pernah sama untuk dokumen berisi `<`/`>` di luar code block (SQL `layer < 7`, HTML rusak hasil konversi Word) atau ber-`\r\n`, sehingga `setMarkdown()` terpanggil di hampir tiap ketikan → re-parse penuh → kursor reset ke posisi 0. Terjadi terutama di Windows (file FSD dari konversi Word/agent ber-`\r\n`). Sekarang `setMarkdown` di-skip saat konten tidak berubah, cursor & undo tetap utuh.
- Escape `<`/`>` saat push ke editor dan round-trip `<`/`>` saat save tetap dipertahankan.

---

## v0.1.12 — Overview bisa edit markdown (pola FSD)

### Edit file markdown di halaman Overview
- **Editor FSD full di Overview** — file `.md` yang terbuka di tab sekarang bisa diedit dengan `FsdEditor` (komponen yang sama dengan halaman FSD): mode **Edit / Split / Preview** (chips di baris tab), preview dengan render Mermaid, dan pintasan **Ctrl/Cmd+S** untuk menyimpan.
- **Simpan via `/api/files/write`** — file dibuat otomatis kalau belum ada; file kosong yang tadinya hanya "File is empty" kini bisa langsung ditulis. Indikator "Unsaved" (amber) dan "Saving…" di baris tab; tombol Save disabled saat tidak ada perubahan.
- **Guard kehilangan perubahan** — klik tab lain / klik file di tree / tutup tab aktif saat ada edit belum disimpan → dialog konfirmasi "Discard unsaved changes?" (Discard / Keep editing). Draft dibersihkan otomatis saat ganti file atau ganti project.
- Baris tab di-restructure (tabs `flex-1 min-w-0` + kontrol `shrink-0`) agar toolbar tidak ikut scroll.

---

## v0.1.11 — Import Tasks toleran format + auto-sync (seperti SIT)

### Import Tasks
- **Parser toleran terhadap varian heading** (`src/lib/task-parser.ts`) — `task_fe.md`/`task_be.md`/`task_*.md` kini bisa diimport meski format heading-nya berbeda-beda tergantung model yang menghasilkan file: `## Task <ID>: <judul>` (sep `:` `：` `—` `–` `-`), `## Task: <judul>` tanpa ID (auto-code deterministik `fe-1`, `fe-2`, …), dan `## FE-1: <judul>` tanpa kata "Task". Heading non-task seperti `## Request:` tidak ter-matching.
- **Smart code** — `## Task FE-1:` di `task_fe.md` menghasilkan code `FE-1` (sebelumnya dobel prefix `fe-FE-1`).
- **Feedback "file kosong"** — import melaporkan `skipped` (file yang ter-scan tapi 0 task); badge di header menampilkan `· N file kosong` — kegagalan tidak lagi diam-diam "+0 new".
- **Guard penghapusan** — stale/orphan deletion hanya berjalan jika ada task yang berhasil di-parse (mencegah format regression menghapus massal task yang sudah ada).

### Auto-sync Tasks (seperti SIT)
- Halaman Tasks kini **auto-import saat dibuka** dan **live re-import via SSE `file:changed`** (difilter `output/task/`, debounce 400ms, pola yang sama dengan halaman FSD) — task langsung muncul saat agent menulis file, tanpa klik "Import from artifacts".
- Import tetap idempotent dan mempertahankan status/assignee hasil edit user; tombol manual tetap ada untuk refresh + menampilkan badge hasil.

---

## v0.1.10 — Halaman SIT, fix terminal Windows (nvm), bar chip file konsisten

### Fitur Baru: SIT (System Integration Test)
- **Halaman SIT baru** (tab "SIT" per project) — lihat, filter, dan kelola hasil test SIT dari dokumen (`output/sit/*.md` atau file yang di-upload): metadata test case (ID, title, status, progress, tester, environment), hasil per browser, dan langkah-langkah (data input / expected / actual).
- **API lengkap** — `/api/projects/:id/sit` (list + read per file), `/quality` (ringkasan kualitas), `/normalize` + `/normalize-all` (perbaiki format), `/feedback`, dan `/export-xlsx` (unduh hasil sebagai file Excel via `buildSitXlsx`).
- **Prompt SIT** — `buildSitPrompt` untuk mode `sit` di "Agent bantu" + fallback `/api/agent/prompt`; parser `src/lib/sit-parser.ts` memetakan dokumen ke tipe terstruktur (`src/shared/sit-types.ts`).
- **Skill fsd-analyzer** — referensi baru `references/sit_format.md` + `sit_instructions.md` (+ `rtm_format.md`/`openapi_format.md` untuk versi skill lama), disalin ke `src-tauri/vendor-skills` untuk desktop.
- **Contoh input** — `docs/SIT - EHS FIF.xlsx` sebagai sampel dokumen SIT.

### Terminal (Windows) — TUI opencode mati di sebagian mesin
- **Resolusi node nvm-aware** (`src/lib/resolve-node.ts`, dipakai server terpaket + dev): terminal server kini mencari `node.exe` langsung di layout nvm-windows (`%NVM_HOME%`/`%APPDATA%\nvm` — folder `v<versi>` tertinggi + junction `current`), direktori instalasi standar (Program Files / LOCALAPPDATA), scoop & winget — baru terakhir fallback PATH. Sebelumnya hanya `spawn("node")` via PATH, yang bisa basi untuk aplikasi yang diluncurkan dari GUI (PATH Explorer tersimpan saat login; `nvm use` setelah login tidak terlihat) → ConPTY tidak aktif → TUI opencode "keyboard mati" (hanya local echo) + scroll & resize mati.
- **Diagnosa yang terlihat** — log path node yang dipilih (`[server] terminal server node: ...`), handler error spawn (fallback langsung, tidak tunggu 10 detik), log saat node-pty gagal dimuat (sebelumnya silent), dan **banner peringatan di panel terminal** saat backend `cmdpipe` aktif (fallback tanpa PTY) dengan petunjuk `nvm list` / `nvm use`.

### UI — konsistensi bar chip file
- Bar chip file di halaman ERD, RTM (FdPills), Spec (fullscreen OpenAPI), dan TimelineViewer diubah ke `flex-1 min-w-0`: lebar & posisi bar selalu konsisten, tidak bergantung jumlah file (sebelumnya `max-w-[X%] shrink` membuat posisi melompat — "kadang di kanan kadang di kiri"); file berlebih di-scroll horizontal. TimelineViewer juga tidak lagi mendorong tombol Refresh keluar layar.

### Bugfix
- **Parser RTM resilient terhadap urutan kolom** — `src/lib/rtm-parser.ts` kini membaca header tabel dan memetakan kolom berdasarkan label (ID/Title/Description/BR/Design Solution/Test Case + sinonim), dengan fallback ke layout posisional kanonik. Sebelumnya memakai indeks tetap: jika agent menghasilkan FR dengan urutan `ID | Title | Description | BR | ...`, kolom BR terbaca sebagai Description dan Description sebagai Title.
- **Prompt RTM self-contained** — `buildRtmPrompt` menyertakan blok format tabel kanonik inline + catatan fallback "jika `references/rtm_format.md` tidak ada di skill, gunakan format di bawah ini". Menangani project dengan skill `fsd-analyzer` versi lama (belum punya `references/rtm_format.md`/`openapi_format.md`).
- **Prompt OpenAPI fallback** — `buildOpenapiPrompt` menambahkan catatan agar tetap mengikuti instruksi prompt bila `references/openapi_format.md` tidak tersedia.

---

## v0.1.9 — Integrasi Antigravity CLI, logo agent, Help popup per halaman

### Antigravity CLI (`agy`)
- **Agent CLI ke-4: Antigravity (`agy`)** — terdeteksi otomatis (`/api/agent/detect`), bisa jadi default agent per proyek (Settings / Open Project), dan dipakai di semua mode run (generate/gap/td/openapi/rtm).
- **Headless run + streaming** — `agy -p <prompt> --output-format stream-json --dangerously-skip-permissions --print-timeout 30m`; event `agent_response` (text_delta) di-streaming ke AgentStream, tool steps (`run_command`→bash, `write_to_file`→write, dst.) tampil di Tools.
- **Resume sesi** — `conversation_id` ditangkap dari event init/result; feedback follow-up lanjut via `--conversation <id>`.
- **Model picker** — `agy models` menyediakan daftar model (slug Gemini/Claude/GPT) di dialog pilih model, tidak hanya opencode.
- **Manual-run fallback** — `/api/agent/prompt` mengembalikan command `agy -p ...` untuk tempel di terminal.
- **Auth note** — AGY butuh login interaktif sekali (`agy`) untuk kredensial keyring sebelum headless bisa jalan.

### Logo agent
- **Logo per agent CLI** — gambar `public/images/{opencode,claude,codex,antigravity}.png` ditampilkan di Open Project dialog, chip Default Agent di Settings, dan header Terminal; helper `agentLogo()` di `lib/agent-command.ts`.
- **`/images/*` di-production** — `serveStatic` (desktop) kini melayani `/images/` (sebelumnya hanya dev via Vite).

### Help popup per halaman
- **Tombol "?" di header tiap halaman** — popup best practices / petunjuk pemakaian (bilingual ID/EN dengan toggle, persist pilihan bahasa) di semua 10 halaman (Projects, Overview, FSD, ERD, Spec, Tasks, RTM, Docs, Wiki, Settings).
- **Konten** — `lib/page-helpers.ts` (registry tips per halaman) + `components/ui/PageHelpButton.tsx`; tips didistilasi dari `docs/` (RTM/Wiki/Settings konten baru).

---

## v0.1.8 — RTM multi-FD & scope, skill update otomatis, prompt ringkas

### Fitur Baru RTM
- **RTM per scope (multi-FD)** — satu scope = satu RTM (`output/rtm/RTM_<scope>.md`). Scope dipilih bebas (dropdown + pill multiselect file FSD): 1 FSD/BRD yang dipecah jadi beberapa file bisa ditrace bersama ke satu RTM tanpa harus rename file atau infer phase.
- **Scope selector** — dropdown scope (default + scope yang sudah ada) + pill FSD file toggleable (gaya ERD) untuk memilih file mana yang ditrace; kosong = semua file.
- **ID per scope** — nomor `BR-001`/`FR-001`/`DS-001`/`TC-001` restart di tiap scope, tidak lagi project-global.
- **Import preview menampilkan phase scope** per file (`RTM_<scope>.md`).

### Agent & Prompt
- **Prompt RTM & OpenAPI jadi ringkas** — agent diminta membaca skill `fsd-analyzer` (`.agents/skills/`) + artifacts sendiri, bukan prompt besar (48KB → ~1.4KB). "Copy Prompt" jadi pendek dan bisa dijalankan manual di terminal.
- **Multi-FD ke agent** — mode `rtm` menerima `fsd` (scope) + `fds[]` (file terpilih); `/api/agent/prompt` menerima `?fsd=&fds=a,b`.
- **Model picker** — sebelum generate, bisa pilih model opencode (`/api/agent/models` → `opencode models`); dipakai di tab Traceability & API Spec.
- **Copy Prompt di API Spec** — tombol salin prompt+command OpenAPI untuk fallback terminal.

### Skill auto-update
- **Deteksi skill outdated** — bandingkan `version:` di SKILL.md yang terpasang vs vendor; project lama (tanpa version) otomatis terdeteksi `outdated` dan di-update saat dibuka / tombol "Update now".
- **UI update skill** — banner biru "Skill update available" + dialog "Update now"; pill menampilkan `v0.9.0 → v1.1.0`.
- **Skill fsd-analyzer v1.2.0** — mode RTM scoped (multi-FD) + OpenAPI generation (`references/openapi_format.md`), versioning di frontmatter.

### Infra
- Migrasi DB `0003_jazzy_nextwave`: kolom `fsd` (default `'default'`) di `business_requirements`, `functional_requirements`, `design_solutions`, `test_cases`, `rtm_links`.

---

## v0.1.7 — Fix FSD auto-scan, import task.md, updater andal

### Perbaikan
- **FSD: file langsung terbuka tanpa "Rescan files"** — auto-scan `input/fsd` saat halaman dibuka dan saat ada perubahan file (SSE), sehingga dokumen yang ditulis agent/dijatuhkan ke folder langsung bisa dipilih tanpa scan manual.
- **Tasks: bisa import `output/task/task.md`** — parser kini menyertakan file gabungan `task.md` dan `MASTER_TASK.md` (kode `task-T01`, dst); sebelumnya hanya `task_*.md`.
- **Updater: tidak lagi gampang error "error sending request"** — check update kini retry (3×) dengan timeout per-request, auto-check dilewati di dev build, dan pesan error diubah ramah ("Tidak dapat terhubung ke server update. Periksa koneksi internet."). Mengatasi jaringan dengan koneksi ke GitHub yang fluktuatif (CDN release-asset intermitten).

---

## v0.1.6 — Requirement Traceability Matrix, agent yang andal, menu native

### Fitur Baru
- **Requirement Traceability Matrix (RTM)** — tab baru di project: matriks traceability `BR → FR → Design → Test` dengan status otomatis (Lengkap / Test kurang / Desain kurang / Belum ditracing), cell BR di-merge vertikal, edit/link interaktif per cell, deskripsi Design/Test ditampilkan penuh, plus search di picker link.
  - **Agent-assisted**: generate RTM dari artifacts ke `output/rtm/RTM.md`, import preview + apply (upsert by code, resolve BR).
  - **Box feedback**: setelah agent selesai, kirim koreksi untuk **melanjutkan sesi yang sama** (opencode `--session`, claude `--resume`, codex `exec resume`) — tanpa restart dari nol.
- **Menu native desktop** (macOS + Windows/Linux): menu bar "Onesist" berisi **Check for Update**, **About Onesist**, **Changelog** (buka GitHub Releases), Quit.
- **InstanceWatch** — widget floating untuk deteksi instance dev server duplikat: kill instance basi, **Restart terminal server** (vite plugin auto-respawn, rate-limited), hint saat semua bersih.
- **Startup cleanup**: `bun run dev` membunuh semua instance stale project ini (pohon penuh, kecuali self) — tidak ada lagi zombie ~120MB.

### Perbaikan Agent
- Headless command **per-CLI yang benar**: opencode `run --format json`, claude `-p --output-format stream-json --include-partial-messages`, codex `exec --json --sandbox workspace-write`.
- **Fix agent hang**: stdin di-`ignore` (bukan pipe terbuka) — opencode tidak lagi menggantung tanpa output.
- JSONL parser per-agent (opencode `part.*`, claude `text_delta`/`assistant`/`result`, codex `item.*`) + **log tool ringkas** (hanya path/command, tanpa dump JSON raksasa).
- Tangkap session id agent dari JSONL → mendukung lanjut sesi via feedback.
- Pembersihan proses `opencode run` yatim saat start agent baru.
- Stall watchdog + indikator "menunggu model…" agar tidak tampak mati saat model lambat.

### Perbaikan UI Agent & Terminal
- **AgentStream realtime** — fix SSE payload bersarang (log live dulu tidak tampil sampai refresh), accordion Tools/Messages, streaming text, timer elapsed live, box feedback, tombol tutup panel.
- **Terminal**: fix crash `insertBefore not a child` (single-root element, xterm deferred ke layout effect, offscreen holder detached dari `document.body`, indikator running via class toggle), error boundary lokal, auto-respawn terminal server.
- **ErrorStack diagnostic** — error runtime menampilkan component stack (untuk commit-phase error sekalipun).

### Infra / API
- Endpoint `/api/system/instances` + `/api/system/instances/kill`; startup cleanup di `vite.config.ts`.
- Refactor API layer: declarative mini-router, per-resource route modules.
- Server memory safety: cap SSE streams, prune agent buffer, watchdog.
- UI kit: dedupe komponen, extract dashboard dialogs, harden client SSE.

---

## v0.1.5
- Auto-update (Phase 3): updater config + manifest CI, UpdateBanner.
- Fix updater banner, terminal echo, FSD editor parsing, desktop ACL.

## v0.1.4
- (Log dipertahankan dari rilis sebelumnya.)

## v0.1.3
- (Log dipertahankan dari rilis sebelumnya.)

## v0.1.2
- (Log dipertahankan dari rilis sebelumnya.)

## v0.1.1
- (Log dipertahankan dari rilis sebelumnya.)
