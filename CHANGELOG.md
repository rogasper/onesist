# Changelog

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
