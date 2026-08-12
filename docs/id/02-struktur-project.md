# 02 — Struktur Project & Format File

Pahami di mana artefak tinggal dan format apa yang diharapkan. Semua path berikut **relatif terhadap project root** (folder yang dipilih saat Open Project).

---

## 1. Struktur Folder

```text
<projectRoot>/
├── input/
│   └── fsd/
│       ├── sources/          # File asli (PDF, DOCX, PPTX, dst.) hasil upload/letak manual
│       ├── images/           # Gambar pendukung FSD (mis. dari editor)
│       ├── fsd_001.md        # FSD hasil konversi / buatan
│       └── fd_001.md ...     # Hasil split per fitur (FD1, FD2, ...) — konvensi bebas
├── output/
│   ├── spec/                 # Spec API markdown + openapi.yaml
│   ├── erd/                  # ERD dalam .dbml (atau markdown)
│   ├── task/                 # Task cards markdown
│   ├── td/                   # Technical Documentation / SRS
│   ├── reports/              # (opsional) laporan gap/consistency
│   └── timeline*.html        # Gantt chart (bisa juga di output/)
├── MASTER_ERD.md             # Konteks rolling schema (root project)
├── MASTER_SPEC_API.md        # Konteks rolling API (root project)
├── templates/
│   └── technical-documentation.md   # Template TD (untuk workflow dokumentasi)
└── .agents/
    └── skills/               # Skill project (fsd-analyzer, markitdown)
```

> Dashboard memantau `input/fsd`, `output/spec`, `output/erd`, `output/task`, dan `output/td`. File yang berubah akan memicu auto-refresh di tab terkait.

## 2. Format Artefak

### 2.1 FSD / FD (Markdown)

Dokumen kebutuhan dalam Markdown biasa. Struktur heading berfungsi sebagai pemisah modul/fitur. Konvensi penamaan disarankan:

- `input/fsd/fsd_<no>.md` — dokumen FSD utuh
- `input/fsd/fd_<no>.md` — per fitur (hasil split)

### 2.2 ERD (DBML)

Tab **ERD** merender file `.dbml` dari `output/erd/`. Format DBML:

```dbml
Project MyProject {
  database_type: 'PostgreSQL'
  Note: 'Schema sesuai MASTER_ERD'
}

Table mst_customer {
  id integer [pk, increment]
  name varchar(100) [not null]
  email varchar(255) [unique]
  created_at timestamp [default: `now()`]
}

Ref: trn_order.customer_id > mst_customer.id
```

Aturan singkat DBML yang dipakai agent:

- `Table <nama> { ... }` — definisi tabel
- Kolom: `nama tipe [modifier]` — modifier umum: `pk`, `increment`, `not null`, `unique`, `default: ...`
- `Ref: tabelA.kolom > tabelB.kolom` — relasi foreign key

### 2.3 API Spec (Markdown)

Spec endpoint ditulis dalam Markdown dengan tabel Method | Path | Purpose | Body | Response, dikelompokkan per modul (heading). Contoh ringkas:

```markdown
# Modul Customer

| Method | Path | Purpose | Body | Response |
|--------|------|---------|------|----------|
| GET | /api/customers | List customer | - | 200: array |
| POST | /api/customers | Tambah customer | {name, email} | 201: customer |
```

Tab **API Spec** mem-parse file ini ke kartu-kartu endpoint (view Cards/Document). Agent juga dapat menghasilkan **`openapi.yaml`** (OpenAPI 3.0) di `output/spec/` — tab ini menampilkannya lewat Swagger UI.

### 2.4 Task Cards (Markdown)

Setiap task adalah kartu dengan struktur standar (konvensi skill `fsd-analyzer`):

- **Code** — kode task unik
- **Title** — judul singkat
- **Story Points** — 1 SP = 4 jam
- **Assignee** — nama developer / level (mis. `BE Senior`, `FE Mid`)
- **Module / Phase** — modul & fase pengerjaan
- **Dependency** — `Depends On`, `Blocks`, `Critical Path`
- **Deskripsi / Goals / Scope / Out of scope / Acceptance Criteria**
- **Flow Logic** — langkah logika bernomor
- **SQL** — contoh query dasar (blok ```sql)
- **Request/Response** — contoh JSON

Tab **Tasks** mem-parse task dari `output/task/`.

### 2.5 Timeline (HTML)

Gantt chart **self-contained HTML** (bisa dibuka langsung di browser). Tab **Tasks → Timeline** merender file:

- `output/timeline*.html`
- atau path yang mengandung `timeline` / `gantt` / `roadmap` / `schedule`

### 2.6 Technical Documentation (Markdown)

Dokumen SRS di `output/td/td_<timestamp>.md`, mengikuti template `templates/technical-documentation.md` dengan struktur: Cover → Approvals → Introduction → Scope → Effort Estimation → System Overview (mermaid) → Requirement Detail per FD → Lampiran ERD (mermaid) → Data Specification.

## 3. Master Artifacts (Konteks Rolling)

`MASTER_ERD.md` dan `MASTER_SPEC_API.md` adalah **satu sumber kebenaran** yang di-update incremental per FSD. Ini penting agar saat bekerja FSD per-bagian, agent tidak perlu membaca semua file lama.

- Struktur `MASTER_ERD.md`: `## Baseline` → `## Changelog` → `## Detail per modul` → blok ` ```dbml `
- Struktur `MASTER_SPEC_API.md`: `## Baseline` → `## API summary` (tabel) → `## Detail endpoint` → `## Changelog`

> Aturan: agent **tidak boleh mengubah master tanpa instruksi eksplisit** dari Anda (lihat [09 — Best Practices](09-best-practices.md)).

---

Lanjut ke [03 — Workflow FSD](03-workflow-fsd.md)
