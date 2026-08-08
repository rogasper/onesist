# Developer Task Cards (task.md)

Tasks are **Markdown** (copy to Monday, Jira, Confluence). One card per meaningful unit of work (endpoint, migration slice, atau screen FE).

## Story Points

**1 SP = 4 hours**

| SP | Hours | Criteria |
|----|-------|----------|
| 1 SP | 4h | Single simple CRUD endpoint, no dependency, existing pattern |
| 2 SP | 8h | 1 endpoint + medium logic (validation, 1-2 join), or standard FE page |
| 3 SP | 12h | Multi-related endpoints, medium business logic, light integration |
| 5 SP | 20h | Full feature (BE + DB + seeding), multi-table, approval flow, complex FE |
| 8 SP | 32h | New module, third-party integration, complex state, many edge cases |
| 13 SP | 52h | Epic: cross-module impact, large migration, architecture decision |

## Flow logic vs SQL

- **`### Flow Logic (step by step)`** — **wajib**: urutan kerja bernomor di setiap task (sumber utama dev/QA); jangan diganti hanya oleh potongan SQL.
- **Mermaid diagram** — boleh ditambahkan di dalam Flow Logic dengan ` ```mermaid ` fence jika flow kompleks (multi-branch, async, multi-service).
- **Blok `sql`** — **base query contoh** saja; boleh diadaptasi ke ORM, pagination, dan standar DB project. Beri judul seperti *"base query contoh"* agar tidak dibaca sebagai satu-satunya sumber kebenaran.

## Format untuk copy-paste ke Jira / Monday

Gunakan **fenced code blocks** dengan bahasa eksplisit supaya satu klik copy:

| Bagian | Fence | Alasan |
|--------|-------|--------|
| Query DB | ` ```sql ` | Dev/DBA paste ke tool SQL |
| Request / response API | ` ```json ` | Paste ke deskripsi ticket, contoh Postman, atau comment |
| HTTP mentah (opsional) | ` ```http ` | Dokumentasi method + path + header |

**Jangan** pakai `mailto:` di dalam JSON — email polos saja agar JSON valid saat di-copy.

**Frontend tasks:** bisa sertakan JSON ringkas untuk **urutan API** atau **mapping menu** agar QA/dev mudah tempel ke ticket. Untuk task FE lengkap, lihat `references/frontend_task_format.md`.

## Ringkasan task (tabel)

Tetap boleh pakai tabel ringkas di awal setiap task:

| Field | Detail |
|-------|--------|
| Service | Path atau N/A |
| Method | POST, GET, SQL, N/A |
| Status | New / Update |
| Purpose | Satu kalimat |
| Story Point | 1 / 2 / 3 / 5 / 8 / 13 |
| Duration | Auto = SP × 4h |
| Developer | Assigned developer name |
| Depends On | Task ID(s) atau "—" |
| Blocks | Task ID(s) atau "—" |
| Critical Path | Yes / No |
| Risk Level | Low / Medium / High |

Lalu isi detail dengan heading + code blocks (bukan `Request Body |` satu baris).

## Struktur disarankan per task

Urutan isi tiap task:

1. Heading `## Task N: …` + tabel ringkas (Service, Method, Status, Purpose, SP, Duration, Developer, Depends On, Blocks, Critical Path, Risk).
2. `### Deskripsi` — satu paragraf menjelaskan apa yang dilakukan task ini.
3. `### Goals` — tujuan bisnis/teknis yang ingin dicapai (bullet list).
4. `### Scope` — apa saja yang termasuk dalam task ini (bullet list).
5. `### Out of scope` — apa yang tidak termasuk (bullet list).
6. `### Acceptance Criteria` — checklist spesifik untuk task ini (bullet list).
7. `### Flow Logic (step by step)` — langkah bernomor **lengkap** (implementasi mengikuti ini). Boleh ditambahkan Mermaid diagram (` ```mermaid `) jika flow kompleks.
8. `### SQL — base query contoh` — blok `sql` (ilustrasi; opsional jika task murni FE).
9. `### Request` — blok `json` (jika API).
10. `### Response (200)` — blok `json`; tambahkan `### Response (4xx)` jika perlu.
11. `### Notes` — bullet.
12. `### QC Checklist` — tabel skenario test spesifik untuk task ini.

(Lihat contoh lengkap di `output/task/task_fsd_role_tsl.md`.)

## Frontend task structure

Untuk task **Frontend** (slicing UI/page/component), detail di bawah masuk ke `## Output` atau sebagai sub-section di Action List:

### Output — UI Copy (exact from Figma)

Tabel literal text — **wajib** ambil dari Figma agar wording match.

| Elemen | Teks eksak (dari Figma) |
|--------|------------------------|
| Page title | `Pelacakan Insentif TSA` |
| Column header 1 | `Nama Agen` |
| Button 1 | `Simpan Proses` *(bukan "Simpan Draft Revisi")* |
| Empty state | `Belum ada data insentif` |

> **Kenapa penting:** QC akan verifikasi wording terhadap Figma. Jika tidak eksak, di-flag FAIL.

### Output — Formatting rules

Tentukan display formatting per kolom/field.

| Field | Format | Contoh |
|-------|--------|--------|
| Bonus Aplikasi | Currency: prefix `Rp`, separator 3 digit, no decimal | `Rp 8.030.000` |
| Tanggal Go Live | Date: `DD MMM YYYY` | `20 Apr 2026` |
| Persentase DP | Percent: `0-100%` | `20%` |

### Output — Typography & spacing

> **Font, size, weight, margin, padding:** match Figma node `{node-id}`.
> Jika ada deviasi — deskripsikan perbedaan eksplisit.

### Action List — Modal & overlay behavior

| Elemen | Behavior saat modal buka |
|--------|------------------------|
| Header (logo + user icon) | **Hide** / tetap transparan |
| Sidebar navigation | **Disable interaksi** / tetap |
| Background scroll | **Lock** / allow |
| Close modal trigger | Tombol X + klik luar modal |

### Output — Figma reference

```markdown
Figma: {link}?node-id={node-id}
```

---

## Integration task structure

Untuk task **Integration** (API + FE orchestration, multi-step flow), detail di bawah masuk ke `## Output` atau sub-section di Action List:

### Output — Conditional field handling

Tentukan behaviour setiap field saat ada toggle/opsi yang mengubah kewajiban field.

| Toggle / Opsi | Field | Behaviour |
|--------------|-------|-----------|
| ACP = "Tanpa ACP" | `credit_protection` | Kirim value `0` — **jangan** hilangkan key dari JSON |
| ACP = "Dengan ACP" | `credit_protection` | Wajib, nilai > 0 |
| Insurance type = "TLO" | `insurance_cost` | Opsional — tidak perlu dikirim |
| Insurance type = "Comprehensive" | `insurance_cost` | Wajib, nilai > 0 |

> **Kasus nyata:** QC gagal karena card hanya bilang "field kosong kirim null", tapi saat "Tanpa ACP" API menolak karena key `credit_protection` tidak ada. Solusi: kirim `0`.

### Output — Toast & feedback messages

Tabel per skenario — teks eksak (case-sensitive, termasuk titik/spasi).

| Skenario | Tipe | Teks eksak |
|----------|------|-----------|
| Pilih paket kalkulator | Toast success | `"Paket Basic dengan tenor 12 bulan telah dipilih"` |
| Simpan draft sukses | Pop up | `"Draft berhasil disimpan"` |
| Submit sukses | Toast success | `"Pengajuan berhasil dikirim"` |
| Error 400 validation | Toast error | `"Mohon lengkapi data yang diperlukan"` |
| Error 502 ACC API | Toast error | `"Gagal membuat leads di ACC, silakan coba lagi"` |
| Draft sudah disubmit | Toast error | `"Leads sudah disubmit dan tidak dapat diubah"` |

### Action List — Loading & disabled states

| Komponen | State loading | State disabled |
|----------|-------------|----------------|
| Tombol Kirim | Spinner + teks disabled | — |
| Form field | — | `disabled=true` + opacity |
| Dropdown | Skeleton | — |

---

## QC acceptance criteria (per tipe task)

Gunakan checklist ini sebagai referensi saat menyusun `### QC Checklist` di **setiap task**. Pilih sesuai tipe sub-task.

### Backend task

| # | Check | Expected |
|---|-------|----------|
| 1 | Edge cases | null, empty, duplikat, not-found, already-exists, limit exceeded |
| 2 | Error codes | HTTP status + pesan eksak tiap skenario |
| 3 | Role & auth | Role diizinkan vs di-reject (401 vs 403) |
| 4 | Response format | JSON envelope konsisten (`message`, `data`/`errors`) |

### Frontend task

| # | Check | Expected |
|---|-------|----------|
| 1 | UI copy | Wording eksak title, column, button, empty state → **match Figma** |
| 2 | Formatting | Currency (prefix `Rp`, separator), date (`DD MMM YYYY`), percent |
| 3 | Typography & spacing | Match Figma node |
| 4 | Modal behavior | Header/sidebar/scroll saat modal terbuka |
| 5 | Number-only fields | Input number, max-length, block alphabet |
| 6 | Loading & disabled | Spinner, skeleton, disabled prop |

### Integration task

| # | Check | Expected |
|---|-------|----------|
| 1 | Conditional field handling | Per toggle: field → wajib/optional/kirim default |
| 2 | Toast & feedback | Teks eksak tiap skenario (success, error, confirmation) |
| 3 | Loading state | Spinner, form disabled, skeleton |
| 4 | Error mapping | Setiap status code → pesan toast/inline |

## Contoh referensi di repo

Lihat **P3M1-T7-BE-01** di `output/task/phase3-mvp1/p3m1-t7_ph_tenor_columns.md` — pola lengkap per-sub-task dengan Deskripsi, Goals, Scope, Out of scope, Acceptance Criteria, Flow Logic, QC Checklist.

## Pelajaran dari kasus nyata

### Backend — struktur yang PASS

Bagian yang wajib ada di setiap sub-task:
- `### Deskripsi`
- `### Goals`
- `### Scope`
- `### Out of scope`
- `### Acceptance Criteria`
- `### Flow Logic (step by step)`
- `### SQL` base query
- `### Request` / `### Response` JSON
- `### Notes`
- `### QC Checklist`

### Frontend — gap yang bikin FAIL dan cara cegah

| Gap lama | Solusi di format baru |
|----------|-----------------------|
| Wording tidak eksak → FAIL | `## Output` → UI Copy tabel (wajib dari Figma) |
| Format angka tidak disebut → FAIL | `## Output` → Formatting rules tabel |
| Typografi/spacing tidak disebut → FAIL | `## Output` → Typography & spacing |
| Button label tidak diverifikasi → FAIL | `## Output` → UI Copy tabel |
| Modal behavior tidak disebut → FAIL | `## Action List` → Modal & overlay behavior |

### Integration — gap yang bikin FAIL dan cara cegah

| Gap lama | Solusi di format baru |
|----------|-----------------------|
| Conditional field handling tidak ada → FAIL | `## Output` → Conditional field handling |
| Toast wording tidak disebut → NEED ADJUSTMENT | `## Output` → Toast & feedback messages |
| Teks toast tidak eksak → NEED ADJUSTMENT | `## Output` → Toast & feedback messages |

## Template minimal

**Judul:** `## Task: {short title}`

**Isi:** tabel ringkas → **Deskripsi** → **Goals** → **Scope** → **Out of scope** → **Acceptance Criteria** → **Flow Logic** step-by-step (+Mermaid jika kompleks) → **SQL base contoh** di `sql` → **Request** / **Response** di `json` → **Notes** → **QC Checklist**.

## Dependency example

```markdown
## Task 1: DB Migration - Users Table

| Depends On | — | Blocks | T2, T3 | Critical | Yes |

## Task 2: POST /api/v1/users

| Depends On | T1 | Blocks | T5 | Critical | Yes |

## Task 3: POST /api/v1/auth/login

| Depends On | T1 | Blocks | T4 | Critical | No |

## Task 4: FE Login Page

| Depends On | T3 | Blocks | — | Critical | No |
```

## Quality checklist

- Setiap endpoint di spec punya task (atau pengelompokan eksplisit).
- Migrasi DB terpisah dari task controller jika rollout berisiko.
- Auth / role disebut di Flow atau Notes.
- Contoh JSON **valid** (koma, quote ganda).
- Semua task punya **Story Point**.
- Semua task punya **Depends On** dan **Blocks** field.
- **Critical path** tasks ditandai.
- Developer assignment terisi (untuk timeline estimation).
- QC Checklist ada di **setiap task**, bukan digabung di akhir file.
- Acceptance Criteria ada di **setiap task**.

## Contoh pola

Struktur task yang baik mengikuti pola: tabel ringkas → Deskripsi → Goals → Scope → Out of scope → Acceptance Criteria → Flow Logic (step by step), bisa dengan Mermaid ` ```mermaid ` untuk flow kompleks → SQL base query di `sql` fence → Request/Response di `json` fence → Notes → QC Checklist. Setiap task punya SP, dependency, dan critical path flag untuk timeline generation.
