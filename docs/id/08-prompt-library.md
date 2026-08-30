# 08 — Prompt Library

Kumpulan template prompt **siap salin** per fase. Jalankan di terminal embedded (sesi agent di project root) atau via `opencode run "<prompt>" --dir <root>`.

Ganti placeholder `<...>` sesuai project Anda.

---

## Cara Menjalankan

**Di terminal embedded** (panel Terminal di project):
- Ketik prompt lalu Enter. Agent berjalan di project root dengan 4 skill terpasang (`fsd-analyzer`, `markitdown`, `diagram-svg`, `query-writer`).

**Dari terminal OS (alternatif):**
```bash
cd /path/to/project
opencode run "<prompt>" --auto --dir .
```

---

## P1 — Convert Dokumen ke Markdown (markitdown)

```text
Kamu adalah Senior System Analyst. Gunakan skill markitdown.

Convert file `<input/fsd/sources/fdd_001.pdf>` menjadi Markdown.
Tulis hasilnya ke `<input/fsd/fsd_001.md>`.
Pertahankan struktur heading, tabel, list, dan diagram teks.
Beri catatan di akhir jika ada bagian yang tidak terbaca (gambar/OCR).
JANGAN mengubah file lain.
```

**Batch:**
```text
Convert SEMUA file di `input/fsd/sources/` menjadi Markdown.
Tulis tiap hasil ke `input/fsd/<nama_file>.md`.
Laporkan daftar file yang berhasil dan yang gagal.
```

---

## P2 — Split FSD menjadi FD per Modul/Fitur

```text
Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer.

Baca `<input/fsd/fsd_001.md>` dan pisahkan menjadi Functional Design (FD)
per modul/fitur. Buat satu file per FD:
- input/fsd/fd_001.md — <modul/fitur 1>
- input/fsd/fd_002.md — <modul/fitur 2>
- (dst.)

Setiap FD harus lengkap dan berdiri sendiri. Buat `input/fsd/FD_INDEX.md`
berisi daftar FD + satu baris deskripsi. JANGAN mengubah file lain.
```

---

## P3 — Discovery & Diskusi Kebutuhan (sebelum generate)

```text
Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer dalam MODE DISCOVERY/DISCUSSION.

Baca semua FD di input/fsd/ (mulai dari FD_INDEX.md).
JANGAN generate ERD, spec, atau task dulu.

Analisis kebutuhan bisnis dan buat daftar:
1. QUESTION_FOR_BA — pertanyaan yang harus dijawab sebelum desain final
   (alur, rule bisnis, data wajib, role/otorisasi, edge cases).
2. ASSUMPTION — asumsi yang kamu ambil + alasan.
3. Ringkasan pemahaman per FD (alur utama, aktor, data yang terlibat).

Tulis ke output/reports/discovery_<timestamp>.md.
JANGAN mengubah file lain.
```

**Lanjutan diskusi:**
```text
Jawaban pertanyaan:
- <pertanyaan 1>: <jawaban>
- <pertanyaan 2>: <jawaban>

Perbarui pemahaman dan tulis ulang discovery report. Konfirmasi jika masih ada
pertanyaan kritis yang belum terjawab sebelum saya approve untuk generate.
```

---

## P4 — Generate ERD dari FD (DBML)

```text
Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer.

Dari FD berikut:
- input/fsd/fd_001.md
- input/fsd/fd_002.md
- (dst., atau: rujuk input/fsd/FD_INDEX.md)

Buatkan ERD lengkap:
- Entity/tabel + kolom (tipe, not null, default)
- Primary key & foreign key (Ref: ...)
- Index & unique constraint
- Relasi antar tabel (1-N, N-M) sesuai alur bisnis

Tulis ke `output/erd/erd_<modul>.dbml` format DBML.
Ikuti konvensi penamaan yang ada (mst_*, trn_*) — jika belum, beri NOTE.
JANGAN mengubah file lain (termasuk MASTER_ERD.md).
```

**Revisi:**
```text
ERD `output/erd/erd_<modul>.dbml`: <daftar perubahan, mis. tambahkan tabel X,
kolom Y unique, hapus Z, tambah index (a, b)>. Perbarui file-nya.
```

---

## P5 — Generate Spec API (Markdown)

```text
Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer.

Dari FD dan ERD final:
- input/fsd/FD_INDEX.md (+ fd_*.md relevan)
- output/erd/erd_<modul>.dbml

Buatkan API Spec lengkap untuk modul <modul>:
- Daftar endpoint per resource (Method | Path | Purpose)
- Per endpoint: request body, query params, response (sukses + error),
  validasi, status code, kebutuhan auth/role
- Ikuti konvensi API project (envelope, pagination, error catalog) —
  jika belum, gunakan standar umum dan catat

Tulis ke `output/spec/spec_<modul>.md`.
JANGAN mengubah file lain.
```

---

## P6 — Generate openapi.yaml (OpenAPI 3.0)

```text
Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer.

Generate file OpenAPI 3.0 dari SEMUA spec di output/spec/:
- Gabungkan semua endpoint, path unik, tanpa duplikasi
- Setiap operation wajib punya: summary, description, tags,
  requestBody/parameters, responses
- Status tiap endpoint: x-status: done (lengkap) atau in-develop (berubah);
  jika ada fase (mis. "Phase 2"), tulis x-phase: <angka>
- info.title = <nama project>, info.version = 1.0.0

Tulis ke `output/spec/openapi.yaml`.
JANGAN modifikasi file markdown atau file lain.
```

**Revisi spec + sinkronisasi:**
```text
Update spec `<output/spec/spec_<modul>.md>`:
<perubahan endpoint/body/response>.
Setelah itu perbarui `output/spec/openapi.yaml` agar sinkron.
```

---

## P7 — Generate Task Cards

```text
Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer.

Dari ERD dan Spec API yang final:
- output/erd/erd_<modul>.dbml
- output/spec/spec_<modul>.md

Buatkan Task Cards developer untuk modul <modul>:
- Break down per sub-task: DB, Backend (BE), Frontend (FE), Integration, Test
- Setiap task: Code, Title, Deskripsi, Goals, Scope, Out of scope,
  Acceptance Criteria, Flow Logic (langkah bernomor), Story Points (1 SP=4 jam),
  Assignee (level: BE/FE Senior/Mid/Junior), Module/Phase,
  Dependency (Depends On, Blocks), SQL dasar (blok sql),
  Request/Response contoh (blok json), QC Checklist
- Tabel ringkasan di atas (Code | Task | SP | Assignee | Dependency)

Tulis ke `output/task/task_<modul>.md`.
JANGAN mengubah file lain.
```

---

## P8 — Estimasi & Timeline Paralel

```text
Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer (mode timeline estimation).

Baca semua task di output/task/ (task_*.md).

Buatkan estimasi & timeline pengembangan:
1. Estimasi per task & per modul (person-days / weeks) dari Story Points.
2. Asumsi tim: <jumlah> developer level <BE/FE Senior/Mid/Junior> — komposisi.
3. Karena dikerjakan PARALEL, buatkan:
   - Urutan prioritas pengerjaan (mana duluan, mana barengan)
   - Dependency & critical path
   - Developer utilization (tidak ada nganggur/overload)
4. Generate HTML Gantt chart self-contained ke `output/timeline_<modul>.html`.
5. Tulis ringkasan estimasi + asumsi tim + risiko ke
   output/reports/estimation_<timestamp>.md.

JANGAN mengubah file task atau file lain.
```

**Revisi timeline:**
```text
Ubah komposisi tim: <2 BE Mid + 1 FE Senior>. Prioritas: modul auth dulu.
Regenerate timeline dan estimation report.
```

---

## P9 — Generate Technical Documentation (SRS)

```text
Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer.

Buatkan Technical Documentation / SRS final dari seluruh artefak:
- FD: input/fsd/ (FD_INDEX.md + fd_*.md)
- ERD: output/erd/*.dbml dan/atau MASTER_ERD.md
- API Spec: output/spec/*.md dan openapi.yaml
- Task: output/task/*.md (untuk Effort Estimation)

Metadata:
- Customer Name: <nama customer>
- Project Name: <nama project>
- Project ID: <id>
- Version: <versi>
- Author: <author>

Ikuti template `templates/technical-documentation.md`:
- Ganti SEMUA placeholder ({{customerName}}, {{projectName}}, {{projectId}},
  {{version}}, {{author}}, {{date}}) dengan metadata + tanggal hari ini.
- Pertahankan struktur & marker <!-- pagebreak -->. Jangan hapus section.
- Requirement Detail: pecah per FD terpisah, kelompokkan per modul bernomor;
  per FD: Front End spec, Back End spec, dan per endpoint tabel 2 kolom
  (Field | Value) berisi Type, Status, Description, Endpoint, Method,
  Request, Response, Table Related (+ Note/Validation/Logic jika perlu).
- System Overview & Lampiran ERD: ganti placeholder mermaid dengan diagram
  asli (flowchart bisnis + erDiagram dari tabel final).
- Effort Estimation: dari story points, per modul/fase, dalam person-days/weeks.

Tulis ke `output/td/td_<timestamp>.md`.
Gunakan bahasa Indonesia untuk deskripsi, Inggris untuk istilah teknis.
JANGAN mengubah file artefak sumber.
```

---

## P10 — Update Master Artifacts (pasca-finalisasi)

```text
Merge artefak final berikut ke konteks rolling:
- ERD: output/erd/erd_<modul>.dbml -> MASTER_ERD.md
- Spec: output/spec/spec_<modul>.md -> MASTER_SPEC_API.md

Tambahkan changelog singkat (tanggal + nomor FD) di masing-masing master.
Jangan hapus bagian yang sudah ada.
```

---

## P11 — Gap / Consistency Check (opsional, per FSD baru)

```text
Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer.

Gap analysis: bandingkan `input/fsd/<fsd_baru>.md` dengan
MASTER_ERD.md dan MASTER_SPEC_API.md.
Laporkan: tabel/kolom yang hilang, endpoint yang hilang, konflik desain,
dan kebutuhan migrasi. Tulis ke output/reports/gap_<timestamp>.md.
```

```text
Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer.

Consistency check: bandingkan ERD (output/erd/), Spec API (output/spec/),
dan Task (output/task/). Laporkan inkonsistensi (entity vs field vs endpoint).
Tulis ke output/reports/consistency_<timestamp>.md.
```

---

## P12 — Diagram Premium Markdown-Native (diagram-svg)

Gunakan skill **`diagram-svg`** — diagram vector yang **preview di markdown** dan **export DOCX** tajam (beda dari mermaid HTML yang pecah di DOCX).

### Pipeline FSD → Delivery (untuk SRS / System Overview)

```text
Kamu adalah Senior System Analyst. Gunakan skill diagram-svg.

Buatkan diagram pipeline FSD → Delivery untuk SRS:

```diagram-svg
{
  "type": "pipeline",
  "title": "PIPELINE — FSD → DELIVERY (Artifact-Driven)",
  "steps": [
    { "label": "FSD PDF/DOCX", "sub": "input/fsd/", "badge": "MARKITDOWN" },
    { "label": "Discovery", "sub": "Q & Assumption", "badge": "ALIGNED?" },
    { "label": "ERD (DBML)", "sub": "output/erd/", "badge": "ERD" },
    { "label": "Spec API", "sub": "output/spec/", "badge": "SPEC" },
    { "label": "Tasks + Timeline", "sub": "output/task/", "badge": "TASK" }
  ],
  "footerNote": "File adalah kebenaran · UI hanya viewer"
}
```

Sisipkan fence di atas ke `output/td/td_<timestamp>.md` bagian System Overview
(ganti placeholder mermaid). Pastikan preview di tab Docs render vector dan
Export DOCX rasterize tanpa pecah. Jika butuh custom warna, set bg/stroke per step
(lihat vendor/skills/diagram-svg/references/style_tokens.md).
```

### Arsitektur Tauri + Bun Sidecar (untuk lampiran / README)

```text
Kamu adalah Senior System Analyst. Gunakan skill diagram-svg.

Buatkan diagram arsitektur desktop untuk lampiran TD:

```diagram-svg
{"type":"sidecar","title":"DESKTOP ARCHITECTURE — Tauri 2 + Bun Sidecar"}
```

Sisipkan ke `output/td/td_<timestamp>.md` bagian System Overview / Lampiran.
```

### Raw SVG bespoke (kontrol penuh)

```text
Sisipkan diagram custom berikut ke `output/td/td_<timestamp>.md`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="320" viewBox="0 0 900 320"><rect x="0" y="0" width="900" height="320" rx="16" fill="#f8fafc" stroke="#e2e8f0"/><text x="450" y="160" text-anchor="middle" font-size="14" fill="#0f172a">Diagram custom — edit bebas</text></svg>
```

Pastikan fence mengandung <svg dan viewBox agar preview & DOCX berhasil.
Lihat template lengkap di vendor/skills/diagram-svg/references/diagram_template.md.
```

### Validasi

```bash
python vendor/skills/diagram-svg/scripts/validate_diagrams.py output/td/td_<timestamp>.md
# cek JSON valid, type pipeline/sidecar, svg punya viewBox
```

Lihat detail skill di `vendor/skills/diagram-svg/SKILL.md`.

---

## P13 — SQL Oracle Standar (query-writer)

Gunakan skill **`query-writer`** standalone — bisa tanpa FSD, maupun otomatis dipanggil `fsd-analyzer` untuk Flow Logic / Task SQL. Aturan di `vendor/skills/query-writer/rules/query_rules.md` (urutan `FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → FETCH`, 8-step checklist).

### Buatkan query standar

```text
Kamu adalah Senior System Analyst. Gunakan skill query-writer.

Buatkan query Oracle untuk: <deskripsi kebutuhan, mis. daftar customer dengan jumlah order & total amount, filter tanggal, paging>

Ikuti urutan FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → FETCH:
- Explicit kolom (tanpa SELECT *), alias jelas
- Tanggal pakai range >= / < (DB UTC → WIB)
- Prefix mst_ / trn_ / tmp_ sesuai konvensi
- Verifikasi dengan 8-step checklist di rules/query_rules.md sebelum menjawab

Tampilkan SQL final dalam blok ```sql dan jelaskan singkat GROUP BY & WHERE.
JANGAN mengubah file lain.
```

### Fix query existing

```text
Gunakan skill query-writer. Perbaiki query berikut agar lolos 8-step checklist:

```sql
<query lama>
```

Tulis hasil ke <path jika perlu, mis. catatan di output/reports/query_fix.md>.
```

### Validasi

```bash
python vendor/skills/query-writer/rules/query_rules.md  # baca manual
# atau minta agent: "cek query ini dengan 8-step checklist query-writer"
```

Lihat `vendor/skills/query-writer/SKILL.md` dan mirror `vendor/skills/fsd-analyzer/references/query_rules.md`.

---

## Catatan Umum Prompt

- **Selalu sebutkan peran + skill**: `Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer / markitdown / diagram-svg / query-writer` (pilih yang relevan; Flow Logic SQL bisa `query-writer` saja).
- **Sebutkan path file lengkap** (relatif project root) — jangan cuma nama.
- **Jelaskan output path + format** — agent tidak boleh menebak.
- **Tambah batasan**: `JANGAN mengubah file lain.` / `JANGAN modifikasi MASTER_* tanpa instruksi.`
- **Satu fokus per prompt** — mis. jangan campur generate ERD dan Spec dalam satu prompt.
- **Iterasi review** — hasil generate selalu di-review lalu direvisi via prompt lanjutan, baru dianggap final.

---

Kembali ke [00 — Pendahuluan](00-pendahuluan.md) | Lanjut ke [09 — Best Practices](09-best-practices.md)
