# Changelog

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
