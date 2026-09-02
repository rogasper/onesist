# Changelog

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
