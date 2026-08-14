# SIT (System Integration Test) Format Reference

Panduan format untuk menghasilkan System Integration Test dari artifacts proyek.

## File Structure

```
output/sit/
├── SIT_SUMMARY.md        # Ringkasan keseluruhan SIT
├── TC01.md              # Test case group 1 (misal: Master Data)
├── TC02.md              # Test case group 2 (misal: Entry Data)
├── ...
└── TC{nn}.md            # Test case group N
```

## Naming Convention

- **TC Group ID**: `TC{nn}` (2 digit sekuensial, restart per scope/module)
  - Contoh: TC01, TC02, ..., TC26
- **Step ID**: `TC{nn}{xxx}` (5 digit: TC + 2 digit group + 3 digit step)
  - Contoh: TC01001, TC01002, TC02001
- **Bug ID**: `BUG{nnn}` (inline reference, sequential)
  - Contoh: [BUG001], [BUG213]

## TC File Format (`output/sit/TC01.md`)

### Header Metadata

```markdown
# TC01 - Judul Modul/Grup

## Metadata
- **Test Case ID**: TC01
- **Title**: Judul Modul
- **Description**: UI Expectation, Data Validation, Mechanism CRUD
- **System Environment**: ASMS Dev, Postgres
- **Tester**: (kosong — diisi saat execution)
- **Location**: (kosong — diisi saat execution)
- **Date**: YYYY-MM-DD
- **Overall Progress**: Not Yet | Partial Complete | Complete
- **Overall Status**: Not started | Pass | Fail | Hold | Re Open | Stopper | Takeout
```

### Step Format

```markdown
## Steps

### TC01001 - Menu Name - Feature Name
- **Feature**: Feature Name
- **User Story**: Sebagai {role}, saya ingin {goal}
- **Step**:
  1. Login dengan user yang memiliki akses {role}
  2. Klik Menu {menu name}
  3. {langkah berikutnya}
- **Data Input**: Nama: Example, Tanggal: 2024-01-01
- **Expected Result**: {3-aspek validation}
- **Type**: Positive | Negative
- **Tested**: Not started | Tested

#### Browser Results
| Browser/Device | Tested | First Status | PIC | First Date | Actual Result | Last Status | Last Date | Last Actual | Evidence |
|---------------|--------|-------------|-----|-----------|--------------|------------|----------|------------|----------|
| Desktop Chrome | Not started | - | - | - | - | - | - | - | - |
| Desktop Safari | Not started | - | - | - | - | - | - | - | - |
| Desktop Firefox | Not started | - | - | - | - | - | - | - | - |
| iOS | Not started | - | - | - | - | - | - | - | - |
| Android | Not started | - | - | - | - | - | - | - | - |

- **Bug**: - | [BUG001], [BUG002]
- **Final PIC**: - | Tester Name
- **Final Result**: - | Pass | Fail
- **Final Status**: Not started | Tested
```

## Expected Result — 3 Aspects

Setiap Expected Result WAJIB mencakup:

### 1. UI Validation
- Form layout sesuai design (Figma/mockup)
- Required field indicators (\*)
- Error message display
- Button states (enabled/disabled)

### 2. Business Validation
- Logic penjagaan (date range, unique constraints, max length)
- Flow (redirect after action, modal confirmation)
- Edge cases (empty data, no internet, concurrent edit)

### 3. Data Validation
- Referensi ke table database
- Query yang diharapkan
- Format data (date format, number precision)

**Contoh lengkap:**
```
UI Validation:
1. Form Layout sesuai design Figma
2. Bisa Filter by Tahun
3. Bisa Filter by Bulan
4. Berhasil Reset Filter
5. Jika Data kosong akan menampilkan informasi di halaman datatabelnya

Business Validation:
1. Secara default datatabel masih kosong
2. Saat user pilih filter dan klik button cari, datatabel akan menampilkan informasi sesuai tahun yang dipilih

Data Validation:
1. Data query match dengan tampilan

Menu Display Requirement:
1. Cari = Search by filter tahun
2. Reset = Mengembalikan ke kondisi default
```

## Test Type Distribution

Setiap feature WAJIB memiliki:

| Test Type | Minimum | Fokus |
|-----------|---------|-------|
| Positive  | 1       | CRUD operasi normal berhasil |
| Negative  | 2       | Validation, boundary, invalid input, empty |

**Contoh kombinasi untuk fitur Create:**
- 1 positive: Create dengan data valid berhasil tersimpan
- 2 negative: Create dengan field kosong, Create dengan nama duplikat, Create dengan tanggal invalid

**Contoh kombinasi untuk fitur Search:**
- 1 positive: Search dengan keyword match → data muncul
- 2 negative: Search dengan keyword empty, Search dengan keyword tidak match

## Browser Matrix (5 Platforms)

Setiap step harus di-test di 5 platform:
1. **Desktop Chrome** (primary)
2. **Desktop Safari**
3. **Desktop Firefox**
4. **iOS** (mobile/tablet)
5. **Android** (mobile/tablet)

Browser result format per row:
- `Tested`: "Tested" | "Not Tested" | "Not started"
- `First Status`: "Pass" | "Fail" (hasil test pertama)
- `PIC`: Siapa yang test
- `Actual Result`: Hasil aktual, bisa include `[BUGnnn]` referensi
- `Last Status`: "Pass" | "Fail" (hasil retest setelah fix)

## Grouping Strategy

**Kategorisasi TC Group**:
1. **Master Data** — CRUD untuk data referensi (kategori, lokasi, periode, dll)
2. **Entry/Transaction Data** — Input data operasional (entry KTD, safety riding, limbah)
3. **Approval/Workflow** — Flow approval (dashboard approval, notification)
4. **Report/Export** — Report generation (report KTD, safety riding, limbah, grafik)
5. **Upload/Import** — File upload (unggah employee, import data)
6. **Dashboard/Grafik** — Dashboard views (grafik KTD, safety riding, limbah)

**Target per TC group**: 5-30 steps (mix positive + negative)

## SIT_SUMMARY.md Format

```markdown
# SIT Summary - {Project Name}

## Document Info
- **Project**: Nama Project
- **Version**: SIT/project/v1
- **Created**: YYYY-MM-DD
- **Testers**: Nama1, Nama2

## Summary
| TC ID | Scenario | Steps | Tested | Pass | Fail | Progress | Status | PIC |
|-------|----------|-------|--------|------|------|----------|--------|-----|
| TC01 | Master Data | 18 | 0 | 0 | 0 | Not Yet | Not started | - |
| TC02 | Entry Data | 44 | 0 | 0 | 0 | Not Yet | Not started | - |

## Overall
- **Total TC Groups**: 10
- **Total Steps**: 300
- **Total Passed**: 0
- **Total Failed**: 0
- **Readiness**: 0%

## Bugs
| Bug ID | TC | Step Code | Description | Status |
|--------|-----|-----------|-------------|--------|
```

## Traceability

Jika project memiliki RTM (Requirement Traceability Matrix), SIT test cases harus traceable ke RTM:
- Refer ke FR/BR/DS code di SIT step user story atau expected result
- Contoh: `"Ref: FR-045"` atau `"Trace: BR-012 → FR-045 → DS-023"`
- Gunakan RTM untuk identifikasi gap: FR yang belum punya TC di SIT

## Language

- **Indonesian** untuk: judul, deskripsi, user story, expected result (business perspective)
- **English** untuk: istilah teknis, error message, API reference, DB queries

## Anti-Patterns (HINDARI)

❌ **Format varian / tabel** — metadata sebagai `| Attribute | Value |`, step sebagai `| Step | Action | Expected Result |`, atau heading `## TCxxxxx` untuk step. Semua file WAJIB STANDARD (lihat template di atas).
❌ Expected Result hanya 1 dimensi (misal hanya "Form muncul") tanpa UI/Business/Data validation yang detail.
❌ Browser matrix kurang dari 5 baris (Desktop Chrome, Safari, Firefox, iOS, Android).
❌ Field Tester dibiarkan placeholder ("tester") atau kata acak — jika SIT_SUMMARY.md sudah mencantumkan `Testers`, pakai nama tersebut.
❌ Kode step duplikat dalam satu file (setiap `TC{nn}xxx` harus unik dalam filenya).
❌ SIT_SUMMARY.md tidak sinkron dengan jumlah step aktual di file TC.

## Tester Rule

- Jika `output/sit/SIT_SUMMARY.md` sudah ada dengan daftar `Testers` (misal "Dea, Giles"), isi field `- **Tester**:` di metadata tiap file TC dengan salah satu nama tester tersebut.
- Jika belum ada daftar testers, biarkan field kosong (jangan isi placeholder).

## Quality Checklist (sebelum selesai)

- [ ] Semua file TC menggunakan format STANDARD (bukan tabel)
- [ ] Setiap step punya 5 baris browser matrix
- [ ] Tidak ada kode step duplikat dalam satu file
- [ ] Field Tester terisi jika daftar testers ada di summary
- [ ] Setiap Expected Result ≥ 3 aspek (UI/Business/Data) dan tidak singkat
- [ ] SIT_SUMMARY.md total step = jumlah step aktual dari semua file TC

