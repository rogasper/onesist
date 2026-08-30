---
name: query-writer
version: 1.0.0
description: "Use this skill whenever the user asks to create, write, generate, or fix an SQL query or a 'query standar' / 'standar query' (e.g. 'buatkan query', 'buatkan standar query', 'buat query SQL', 'tulis query oracle', 'standar penulisan query'). It enforces the standard query-writing rules for the CRM Dashboard / Databank Dashboard project (Oracle dialect): analyze clauses in order FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT, then emit valid Oracle SQL and verify with the 8-step checklist in rules/query_rules.md."
---

# Query Writer — Standard Query Rules

Skill ini memicu prosedur standar penulisan query untuk proyek **CRM Dashboard (Databank Dashboard)**.

## Prosedur Wajib (jalankan setiap kali instruksi membuat query)

1. Baca file init: `rules/query_rules.md` (relatif ke root proyek `D:\WORK\CRM DASHBOARD` — untuk Onesist: `vendor/skills/query-writer/rules/query_rules.md` atau `references/query_rules.md`).
2. Ikuti **urutan berpikir** dari `rules/query_rules.md` Bagian 1: `FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT`.
3. Tulis SQL final valid **Oracle** (SELECT di awal) sesuai kerangka Bagian 2.
4. Terapkan aturan per klausa Bagian 3.
5. Sebelum menjawab, verifikasi dengan **8-step checklist** Bagian 4.

## Prinsip Kunci

- Dialect: **Oracle** (bukan `LIMIT`; gunakan `FETCH FIRST … ROWS ONLY` / `OFFSET … FETCH NEXT …`).
- Filter baris di `WHERE` (sebelum agregasi); filter agregat di `HAVING`.
- Semua kolom non-agregat di `SELECT` wajib ada di `GROUP BY`.
- Tidak ada `SELECT *`; kolom ditulis eksplisit.
- Tanggal: DB UTC, tampil WIB; pakai range `>=` / `<`, bukan bungkus kolom dengan `TO_CHAR`.
- Konvensi tabel: `mst_` (master), `trn_` (transaksi), `tmp_` (temporary/ascii/staging).

## Contoh Output Format

Respons query selalu menampilkan:

```sql
SELECT <kolom | agregat> [alias]
FROM   <tabel> [alias]
       [INNER|LEFT] JOIN <tabel2> [alias] ON <kunci> = <kunci>
WHERE  <filter_baris>
GROUP BY <dimensi>
HAVING <filter_agregat>
ORDER BY <urutan>
FETCH FIRST <n> ROWS ONLY;
```

## Referensi

- `rules/query_rules.md` — dokumen lengkap aturan & contoh.

## Integrasi dengan fsd-analyzer

Skill ini dipakai otomatis oleh `fsd-analyzer` saat:
- **Spec API → Flow Logic SQL example** (`references/spec_api_format.md` → `Flow Logic` step)
- **Task cards** (`references/task_format.md` → bagian `SQL base contoh`)

Lihat `vendor/skills/fsd-analyzer/references/query_writer.md` untuk mapping.

## Trigger phrases

- "buatkan query", "buatkan standar query", "buat query SQL", "tulis query oracle", "standar penulisan query"
- "query untuk dashboard", "query crm", "query databank"
