# SIT Generation Instructions

Panduan lengkap untuk Senior QA Lead dalam menyusun System Integration Test (SIT) dari artifacts proyek.

## Tujuan

Menghasilkan SIT yang komprehensif yang men-cover SETIAP fitur/menu/endpoint dari artifacts proyek, siap digunakan sebagai panduan QC dan testing oleh tim QA.

## Input yang Dibutuhkan

Baca SEMUA artifacts berikut (jika ada):
- `input/fsd/*.md` — Dokumen FSD (Functional Specification Document)
- `output/spec/*.md` — API Specification
- `output/erd/*.dbml` + `output/erd/*.md` — Entity Relationship Diagram
- `output/task/*.md` — Task Breakdown Cards
- `output/rtm/*.md` — Requirement Traceability Matrix (BR/FR/DS/TC)
- `MASTER_ERD.md` — Master ERD (project-wide context)
- `MASTER_SPEC_API.md` — Master API Spec (project-wide context)

## Output yang Dihasilkan

### File per-TC Group
- `output/sit/TC01.md`, `output/sit/TC02.md`, ..., `output/sit/TC{nn}.md`
- Satu file per TC group (modul/domain utama)

### Summary
- `output/sit/SIT_SUMMARY.md` — Ringkasan keseluruhan

## Step 1: Identifikasi Fitur dari Artifacts

1. Baca SEMUA artifacts
2. Identifikasi setiap modul/domain
3. Identifikasi setiap fitur/menu/endpoint
4. Kelompokkan per domain (contoh: Master Data, Entry Data, Report, Dashboard, Approval)

### Grouping Strategy

| TC Group | Kategori | Contoh |
|----------|----------|--------|
| TC01-TC09 | Master Data | CRUD data referensi (kategori, periode, wilayah, dsb) |
| TC10-TC18 | Entry/Transaction | Input data operasional (entry KTD, safety riding, limbah) |
| TC19-TC22 | Report/Export | Report generation, export Excel/PDF |
| TC23-TC26 | Dashboard/Grafik | Dashboard views, charts, filters |
| TC27-TC30 | Approval/Workflow | Dashboard approval, notification |

Target: 5-30 TC groups, tergantung kompleksitas project.

## Step 2: Generate Test Cases per Feature

### Minimum Coverage per Feature

| Test Type | Minimum | Fokus |
|-----------|---------|-------|
| Positive | 1 | CRUD operasi normal berhasil |
| Negative | 2 | Validation, boundary, invalid input |

**Contoh kombinasi untuk fitur Create:**
1. Positive: Create dengan data valid → berhasil tersimpan
2. Negative: Create dengan field kosong → error message muncul
3. Negative: Create dengan nama duplikat → rejection
4. Negative: Create dengan tanggal invalid → validation error

**Contoh kombinasi untuk fitur Search/Filter:**
1. Positive: Search dengan keyword match → data muncul
2. Negative: Search dengan keyword kosong
3. Negative: Search dengan keyword tidak match → "no data"
4. Negative: Reset filter → kembali ke default

### Expected Result — WAJIB 3 Aspek

Setiap Expected Result HARUS mencakup 3 aspek validation:

```markdown
- **Expected Result**: 
  UI Validation:
  1. Form Layout sesuai design Figma
  2. Bisa Filter by Tahun
  3. Bisa Filter by Bulan
  4. Berhasil Reset Filter
  5. Jika Data kosong akan menampilkan informasi di data tabel

  Business Validation:
  1. Secara default data tabel masih kosong
  2. Saat user pilih filter dan klik cari, data tabel akan menampilkan informasi sesuai filter
  
  Data Validation:
  1. Data dari query: SELECT * FROM ehs_xxx WHERE ...
  2. Format tanggal: DD-MM-YYYY
```

### Data Input Realistis

Gunakan contoh data sesuai domain:
```
- **Data Input**: 
  Nama Kategori: Body Armor Protector
  Tanggal Mulai Aktif: 2024-05-01
  Tanggal Berakhir: 2024-08-31
```

## Step 3: Format TC File

Format lengkap lihat `references/sit_format.md`.

### Struktur Utama per File

```markdown
# TC{nn} - {Judul Modul}

## Metadata
- **Test Case ID**: TC{nn}
- **Title**: {Judul Modul}
- **Description**: {Deskripsi}
- **System Environment**: {Environment}
- **Tester**: {kosong}
- **Location**: {kosong}
- **Date**: YYYY-MM-DD
- **Overall Progress**: Not Yet
- **Overall Status**: Not started

## Steps

### TC{nn}001 - {Menu} - {Feature}
- **Feature**: {Nama Feature}
- **User Story**: Sebagai {role}, saya ingin {goal}
- **Step**: 
  1. {Langkah 1}
  2. {Langkah 2}
- **Data Input**: {Contoh data}
- **Expected Result**: {3 aspek validation}
- **Type**: Positive | Negative
- **Tested**: Not started

#### Browser Results
| Browser/Device | Tested | First Status | PIC | First Date | Actual Result | Last Status | Last Date | Last Actual | Evidence |
|---------------|--------|-------------|-----|-----------|--------------|------------|----------|------------|----------|
| Desktop Chrome | Not started | - | - | - | - | - | - | - | - |
| Desktop Safari | Not started | - | - | - | - | - | - | - | - |
| Desktop Firefox | Not started | - | - | - | - | - | - | - | - |
| iOS | Not started | - | - | - | - | - | - | - | - |
| Android | Not started | - | - | - | - | - | - | - | - |

- **Bug**: -
- **Final PIC**: -
- **Final Result**: -
- **Final Status**: Not started
```

## Step 4: Traceability ke RTM

Jika project memiliki RTM trace back ke SIT:
- Refer ke FR/BR/DS code di user story atau expected result
- Contoh: "Ref: FR-045" atau "Trace: BR-012 → FR-045 → DS-023"
- Gunakan RTM untuk identifikasi gap: FR yang belum punya TC di SIT

## Step 5: Bahasa

- **Indonesian** untuk: judul, deskripsi, user story, expected result
- **English** untuk: istilah teknis, error message, API reference, DB queries

## Refinement Mode (jika sudah ada SIT files)

Ketika `output/sit/` sudah ada files:
1. Baca SEMUA existing files terlebih dahulu
2. Identifikasi gaps: artifacts yang belum di-cover
3. Perbaiki test cases yang melenceng/kurang lengkap
4. Tambahkan test cases baru untuk coverage yang hilang
5. JANGAN hapus test cases yang sudah benar
6. Update `SIT_SUMMARY.md` dengan perubahan

## Rules Ringkasan

✅ Setiap fitur: minimal 3 test steps (1P + 2N)  
✅ Setiap expected: 3 aspek (UI + Business + Data)  
✅ Setiap step: 5 browser (Chrome, Safari, Firefox, iOS, Android)  
✅ Data input realistis  
✅ Bahasa: ID untuk user-facing, EN untuk teknis  
✅ Traceable ke RTM (jika ada)  
✅ ID sekuensial: TC{nn} group, TC{nn}xxx step, [BUGnnn] bug  
⛔ Jangan overwrite existing files di refinement mode  
⛔ Jangan generate SIT jika project belum punya FSD/ERD/Spec/Task

## Quality Checklist

- [ ] Semua artifacts sudah dibaca
- [ ] Semua modul/domain ter-cover
- [ ] Semua fitur punya minimal 3 test steps
- [ ] Semua expected results punya 3 aspek validation
- [ ] Semua browser results terisi "Not started" (5 rows per step)
- [ ] Data input realistis dan sesuai domain
- [ ] Traceability: FR/BR code direferensikan (jika RTM ada)
- [ ] SIT_SUMMARY.md up-to-date
- [ ] Tidak ada file artifact yang di-modifikasi (hanya output/sit/)

## Anti-Patterns (HINDARI)

❌ Expected result hanya 1 dimensi (hanya UI, tanpa business/data validation)
❌ Test steps terlalu umum ("klik button") tanpa detail
❌ Data input hanya "test" atau "-"
❌ Browser matrix kurang dari 5 platform
❌ Overwrite existing files tanpa baca dulu
❌ TC tidak traceable ke RTM (padahal RTM sudah ada)
❌ Generate SIT sebelum ada ERD/Spec/Task di project
