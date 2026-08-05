# Master ERD & Master Spec API (konteks tunggal)

Tujuan: **satu sumber kebenaran** untuk schema dan kontrak API, supaya saat kamu input **FSD per nomor/bagian** tidak perlu selalu melampirkan banyak file lama.

## File yang disarankan (di root project)

| File | Isi |
|------|-----|
| `MASTER_ERD.md` | Semua tabel/kolom/index/FK yang sudah disepakati + tambahan per slice FSD |
| `MASTER_SPEC_API.md` | Semua endpoint + ringkasan kontrak yang sudah disepakati + tambahan per slice FSD |

Snapshot historis (mis. `output/erd/erd_now.md`, `output/spec/spec_api.md`) boleh tetap ada sebagai **foto baseline** atau arsip; **yang di-@ untuk kerja harian** cenderung **`MASTER_*`**.

## Alur kerja (FSD per bagian)

1. **Bootstrap (sekali):** salin isi aktual dari baseline kamu (mis. `output/erd/erd_now.md`, `output/spec/spec_api.md`) ke `MASTER_ERD.md` / `MASTER_SPEC_API.md`, atau merge manual bagian yang relevan.
2. **Tiap slice FSD** (nomor/section): setelah diskusi cukup jelas, **tambahkan/ubah hanya bagian yang terdampak** di master (bukan file baru per FSD kecuali kamu sengaja ingin arsip).
3. **Di prompt:**  
   `@MASTER_ERD.md @MASTER_SPEC_API.md @fsd_...md` (+ `existing_*.md` atau Figma notes jika perlu).  
   Tidak wajib lagi melampirkan semua spec/erd lama kecuali untuk audit atau gap terhadap “prod docs” terpisah.
4. **Gap analysis:** bandingkan FSD slice dengan isi **MASTER**; kalau perlu bandingkan juga ke `output/erd/erd_now.md` jika master belum sinkron dengan DB produksi.

## Penamaan database (`mst_`, `trn_`, dll.)

- **Yang sudah ada di DB/dokumen:** **pertahankan penamaan apa adanya** (termasuk `mst_`, `trn_`, typo historis) di `MASTER_ERD.md` — jangan mass-rename di dokumen kecuali ada keputusan eksplisit + migrasi.
- **Fitur/tabel baru:** ikuti **konvensi proyek** yang sama (mis. master → `mst_…`, transaksi → `trn_…`) bila tim sudah setuju; kalau belum, tulis **NOTE** di ERD.
- Di **Gap Report**, jika ada inkonsistensi penamaan lama vs konvensi baru, laporkan sebagai **INFO/WARN + “rename hanya dengan migrasi terpisah”**, bukan mengubah master secara diam-diam.

## Struktur disarankan di `MASTER_ERD.md`

- `## Baseline` — ringkatan atau full schema awal (dari `erd_now` atau dump)
- `## Changelog ringkas` — bullet per merge FSD (tanggal / nomor FSD)
- `## Detail per modul` — atau per tabel
- Blok ` ```dbml ` **di akhir atau per modul** untuk dbdiagram (opsional satu blok gabungan)

## Struktur disarankan di `MASTER_SPEC_API.md`

- `## Baseline` — endpoint inti yang sudah live
- `## API summary` (opsional) — tabel Method | Path | Purpose | Auth (cocok untuk sheet “API summary”)
- `## Detail endpoint` — mengikuti `references/spec_api_format.md`
- `## Changelog` — nomor FSD yang mengubah kontrak

## Task / Monday

Task bisa tetap per fitur (`task_fsd_*.md`) atau satu `MASTER_TASK.md` jika kamu mau; yang penting **spec + ERD** terpusat di `MASTER_*` agar konteks tidak berulang.
