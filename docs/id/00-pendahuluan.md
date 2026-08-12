# 00 — Pendahuluan

Dokumen ini menjelaskan **Onesist (SA Dashboard)** dari sudut pandang pengguna: cara aplikasi membantu System Analyst bekerja, filosofi penggunaannya, dan bagaimana agent CLI digunakan sebagai "mesin" utama di balik aplikasi.

---

## 1. Tentang Aplikasi

Onesist adalah dashboard untuk **System Analyst** yang bekerja dengan dokumen kebutuhan fungsional dan menghasilkan artefak pengembangan:

| Artefak | Deskripsi | Lokasi default |
|---------|-----------|----------------|
| **FSD (Functional Specification Document)** | Dokumen kebutuhan (PDF/DOCX/PPTX/MD) yang diubah menjadi Markdown dan dipecah per fitur (FD) | `input/fsd/` |
| **ERD** | Entity Relationship Diagram dalam format **DBML** | `output/erd/` |
| **API Spec** | Spesifikasi endpoint dalam Markdown + **openapi.yaml** (OpenAPI 3.0) | `output/spec/` |
| **Task Cards** | Kartu tugas developer dengan Story Points, assignee, dependency | `output/task/` |
| **Timeline** | Gantt chart HTML (estimasi minggu, prioritas, paralel) | `output/timeline*.html` |
| **Technical Documentation** | Dokumen SRS / TD final untuk klien | `output/td/` |
| **Master artifacts** | Konteks rolling: `MASTER_ERD.md`, `MASTER_SPEC_API.md` | root project |

## 2. Filosofi: Agent-CLI First

Alur kerja di dokumentasi ini **tidak bergantung pada tombol-tombol UI**. Semua transformasi dilakukan dengan **memberi perintah (prompt) ke agent CLI** — biasanya **OpenCode** — yang:

- berjalan **di dalam folder project** (cwd = project root),
- memakai skill terpasang: **`fsd-analyzer`** (menghasilkan artefak SA) dan **`markitdown`** (konversi dokumen ke Markdown),
- membaca/menulis file di `input/`, `output/`, dan `MASTER_*` secara langsung.

Alasan pendekatan ini:

1. **Kontrol penuh** — Anda menentukan persis apa yang digenerate, ke file mana, dan dalam format apa.
2. **Transparan** — semua artefak adalah file Markdown/DBML/HTML biasa yang bisa dibuka di editor apa pun.
3. **Hindari UI yang belum stabil** — beberapa tombol aksi di UI masih eksperimental; alur agent-CLI lebih dapat diandalkan.

UI (dashboard) tetap berguna sebagai **penampil / viewer**: file yang dihasilkan agent di `output/` otomatis dirender (via file watcher / SSE), misalnya diagram ERD, kartu spec, task, dan timeline.

## 3. Cara Kerja Terminal Embedded

Tombol **Terminal** (di header project) membuka panel terminal yang berisi sesi interaktif **agent CLI**:

```mermaid
flowchart LR
  UI[Panel Terminal di dashboard] -->|WebSocket| WS[Terminal Server]
  WS -->|PTY spawn| CLI[Agent CLI: opencode / claude / codex]
  CLI -->|cwd = project root| SK[Skills: fsd-analyzer, markitdown]
  SK -->|baca/tulis file| FS[input/ output/ MASTER_*]
  FS -->|file watcher + SSE| UI2[Tab dashboard auto-refresh]
```

- Saat panel dibuka, sesi **`opencode`** (atau agent default project) langsung di-spawn di project root.
- Anda mengetikkan **prompt** langsung di terminal itu — tidak perlu menjalankan `opencode run` manual (tapi itu juga bisa, lihat §4).
- Terminal bisa **ditutup lalu dibuka lagi** tanpa kehilangan sesi berjalan (session di-attach ulang).
- Jangan menjalankan agent yang sama dari luar secara bersamaan untuk folder yang sama.

## 4. Alternatif: Menjalankan dari Terminal Eksternal

Jika ingin menjalankan dari terminal OS biasa:

```bash
cd /path/to/project
opencode run "<prompt>" --auto --dir .
```

Atau bentuk umum (sesuai agent):

| Agent | Perintah |
|-------|----------|
| opencode | `opencode run "<prompt>" --auto --dir <projectRoot>` |
| claude | `claude -p "<prompt>"` (jalankan dari project root) |
| codex | `codex exec "<prompt>"` (jalankan dari project root) |

> Penting: jalankan dari **project root** agar skill `.agents/skills/` dan file `input/`, `output/`, `MASTER_*` ditemukan.

## 5. Prasyarat

- **Agent CLI terpasang** di sistem (opencode disarankan) — dicek otomatis saat membuka project (tab project menampilkan peringatan jika skill gagal terpasang).
- **Skills project terpasang** ke `.agents/skills/` (fsd-analyzer, markitdown) — auto-install saat project pertama dibuka.
- **Project folder** berisi (atau akan berisi) `input/fsd/`, `output/`, dan opsional `MASTER_ERD.md` / `MASTER_SPEC_API.md`.

---

Lanjut ke [01 — Mulai Cepat](01-mulai-cepat.md)
