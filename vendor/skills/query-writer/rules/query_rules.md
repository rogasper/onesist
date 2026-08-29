# Query Rules — CRM Dashboard / Databank Dashboard (Oracle)

> Lokasi kanonik di proyek CRM: `D:\WORK\CRM DASHBOARD\rules\query_rules.md`  
> Mirror untuk Onesist: `vendor/skills/query-writer/rules/query_rules.md` + `vendor/skills/fsd-analyzer/references/query_rules.md`

---

## Bagian 1 — Urutan Berpikir (Wajib)

Analisis dan susun clause dalam urutan **eksekusi logis**, bukan urutan tulis SELECT:

```
FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → OFFSET/FETCH
```

1. **FROM** — Tentukan tabel basis (`trn_*` untuk fakta/transaksi, `mst_*` untuk dimensi).
2. **JOIN** — Tambah dimensi via `INNER JOIN` (wajib) atau `LEFT JOIN` (opsional). Kunci: `ON pk = fk`.
3. **WHERE** — Filter baris *sebelum* agregasi (status, tanggal, flag).
4. **GROUP BY** — Tentukan granularitas (dimensi).
5. **HAVING** — Filter hasil agregasi (COUNT, SUM, AVG).
6. **SELECT** — Pilih kolom dimensi + agregat, beri alias jelas.
7. **ORDER BY** — Urutan presentasi.
8. **OFFSET / FETCH** — Paginasi Oracle (bukan LIMIT).

> **Kenapa urutan ini?** Mencegah kesalahan `GROUP BY` (lupa kolom), salah taruh filter di HAVING vs WHERE, dan `SELECT *` yang lolos.

---

## Bagian 2 — Kerangka SQL Oracle Valid

Template yang harus dikeluarkan (SELECT di awal, tapi berpikir dari FROM):

```sql
SELECT  mst_customer.cust_name        AS customer_name
      , COUNT(trn_order.order_id)     AS total_order
      , SUM(trn_order.amount)         AS total_amount
FROM    trn_order
        INNER JOIN mst_customer ON mst_customer.cust_id = trn_order.cust_id
        LEFT  JOIN mst_branch   ON mst_branch.branch_id = trn_order.branch_id
WHERE   trn_order.order_date >= DATE '2024-01-01'
  AND   trn_order.order_date <  DATE '2024-02-01'
  AND   trn_order.status = 'PAID'
GROUP BY mst_customer.cust_name
HAVING  COUNT(trn_order.order_id) > 5
ORDER BY total_amount DESC
FETCH FIRST 20 ROWS ONLY;
-- atau paginasi:
-- OFFSET 20 ROWS FETCH NEXT 20 ROWS ONLY;
```

Variasi paginasi Oracle:
- `FETCH FIRST n ROWS ONLY`
- `OFFSET m ROWS FETCH NEXT n ROWS ONLY`
- `FETCH FIRST n ROWS WITH TIES` (jika tie di ORDER BY perlu disertakan)

---

## Bagian 3 — Aturan per Klausa

### FROM
- Satu tabel basis per query. Alias singkat (`o`, `c`, `b`) boleh, tapi konsisten.
- Konvensi: `mst_*` = master, `trn_*` = transaksi, `tmp_*` = staging/ascii.

### JOIN
- `INNER JOIN` untuk relasi wajib, `LEFT JOIN` untuk opsional.
- Selalu tulis `ON` eksplisit; jangan pakai `USING` atau natural join.
- Join berantai: `trn_*` → `mst_*` → `mst_*` (star schema).

### WHERE
- Filter baris sebelum agregasi.
- **Tanggal:** kolom `TIMESTAMP WITH TIME ZONE` (UTC) di DB. Bandingkan dengan range, bukan bungkus kolom:
  ```sql
  -- Benar (sargable, index terpakai):
  WHERE trn_order.order_date >= TIMESTAMP '2024-01-01 00:00:00 UTC'
    AND trn_order.order_date <  TIMESTAMP '2024-02-01 00:00:00 UTC'
  -- Salah:
  -- WHERE TO_CHAR(trn_order.order_date, 'YYYY-MM-DD') = '2024-01-01'  (bungkus kolom, index mati)
  ```
- Tampilkan WIB di SELECT via `AT TIME ZONE`: `trn_order.order_date AT TIME ZONE 'Asia/Jakarta' AS order_date_wib`.
- Tidak ada fungsi di kiri `=` kecuali perlu; tulis `kolom >= value`.

### GROUP BY
- Semua kolom non-agregat di SELECT wajib ada di GROUP BY (Oracle strict).
- Jika butuh agregat tanpa GROUP BY, jangan tulis GROUP BY.

### HAVING
- Hanya untuk filter agregat (`HAVING COUNT(*) > 1`). Jangan duplikasi WHERE.
- Jika tidak ada agregat, jangan pakai HAVING.

### SELECT
- **Larangan:** `SELECT *`.
- Tulis kolom eksplisit dengan alias `AS` yang jelas (`snake_case` atau `camelCase` sesuai `project_context.md`).
- Agregat: `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `LISTAGG` (Oracle).
- Untuk `COUNT(DISTINCT ...)`, pastikan alasan.

### ORDER BY
- Pakai alias atau posisi (`ORDER BY 2 DESC`) boleh, tapi prefer alias.
- Selalu tentukan `ASC/DESC`. Untuk deterministik paginasi, ORDER BY harus unik (tambah `id`).

### OFFSET / FETCH
- Jangan pakai `LIMIT` / `LIMIT n,m` (MySQL/Postgres). Oracle: `FETCH FIRST ... ROWS ONLY`.
- Untuk dashboard paging: `OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY`.

---

## Bagian 4 — 8-Step Checklist (Verifikasi sebelum jawab)

Centang semua sebelum emit SQL:

- [ ] **1. FROM benar?** Tabel basis sesuai kebutuhan (trn vs mst vs tmp)?
- [ ] **2. JOIN benar?** INNER vs LEFT tepat? ON pk = fk? Tidak ada cross join tak sengaja?
- [ ] **3. WHERE benar?** Filter baris (bukan agregat) di WHERE? Tanggal pakai `>= / <` range, bukan `TO_CHAR` di kolom?
- [ ] **4. GROUP BY lengkap?** Semua non-agregat di SELECT ada di GROUP BY? Tidak ada yang missing/extra?
- [ ] **5. HAVING benar?** Filter agregat di HAVING, bukan WHERE? Tidak duplikat?
- [ ] **6. SELECT eksplisit?** Tanpa `*`? Alias jelas? Kolom UTC di-convert ke WIB jika tampil?
- [ ] **7. ORDER BY + FETCH valid Oracle?** ORDER BY deterministik? Pakai `FETCH FIRST` / `OFFSET … FETCH NEXT`, bukan `LIMIT`?
- [ ] **8. Konvensi & dialect?** Prefix `mst_/trn_/tmp_` dipatuhi? Tidak ada syntax MySQL (`LIMIT`, backtick)?

Jika ada yang tidak centang, perbaiki dulu.

---

## Contoh Lengkap — CRM Dashboard

### Contoh 1: Top branch by amount (Jan 2024)
```sql
SELECT  mst_branch.branch_name             AS branch_name
      , COUNT(trn_order.order_id)          AS total_order
      , SUM(trn_order.amount)              AS total_amount
FROM    trn_order
        INNER JOIN mst_branch ON mst_branch.branch_id = trn_order.branch_id
WHERE   trn_order.order_date >= DATE '2024-01-01'
  AND   trn_order.order_date <  DATE '2024-02-01'
  AND   trn_order.status = 'PAID'
GROUP BY mst_branch.branch_name
HAVING  SUM(trn_order.amount) > 10000000
ORDER BY total_amount DESC
FETCH FIRST 10 ROWS ONLY;
```

### Contoh 2: Customer dengan order > 5, tampil WIB
```sql
SELECT  mst_customer.cust_name                         AS customer_name
      , mst_customer.cust_id                           AS customer_id
      , COUNT(*)                                       AS total_order
      , trn_order.order_date AT TIME ZONE 'Asia/Jakarta' AS order_date_wib
FROM    trn_order
        INNER JOIN mst_customer ON mst_customer.cust_id = trn_order.cust_id
WHERE   trn_order.status = 'PAID'
GROUP BY mst_customer.cust_name, mst_customer.cust_id, trn_order.order_date
HAVING  COUNT(*) > 5
ORDER BY total_order DESC, customer_name ASC
OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY;
```

---

## Catatan untuk fsd-analyzer

- Saat generate **Spec API → Flow Logic SQL example**, pakai template Bagian 2 dan verifikasi checklist Bagian 4.
- Saat generate **Task → SQL base contoh**, tulis di fence ````sql```` (bukan ```), kolom eksplisit, Oracle dialect.
- Lihat `vendor/skills/fsd-analyzer/references/query_writer.md` untuk mapping.

