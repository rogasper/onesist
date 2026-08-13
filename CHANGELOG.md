# Changelog

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
