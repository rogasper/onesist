# Query Writer — Oracle Standard (untuk Spec & Task)

> Mirror dari `vendor/skills/query-writer/rules/query_rules.md` (kanonik di `D:\WORK\CRM DASHBOARD\rules\query_rules.md`)

Skill ini dipakai **otomatis** oleh `fsd-analyzer` saat menulis **SQL base contoh** di:

- **Spec API → Flow Logic** (contoh query untuk BE dev memvalidasi flow)
- **Task cards** (`task.md` → bagian `SQL base contoh` per task)

## Kapan pakai

- Setiap task/BE spec yang butuh query → terapkan prosedur `query-writer` **sebelum** menulis ````sql```` fence.
- Trigger: "buatkan query", "standar query", "query oracle", atau saat Flow Logic butuh validasi DB.

## Prosedur

1. **Baca** `rules/query_rules.md` (atau `references/query_rules.md` di skill ini).
2. **Berpikir** urutan `FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → FETCH`.
3. **Tulis** SQL final valid Oracle (`FETCH FIRST ... ROWS ONLY`, bukan `LIMIT`), kolom eksplisit (tanpa `*`), tanggal pakai range `>= / <` (UTC → WIB via `AT TIME ZONE 'Asia/Jakarta'`).
4. **Verifikasi** dengan 8-step checklist di `query_rules.md` Bagian 4.

## Template yang harus di-emit

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

## Di mana menaruh di artifact

- **Spec:** `output/spec/<module>/spec.md` → di `Flow Logic` step, setelah `Given-When-Then`, dalam ````sql```` fence.
- **Task:** `output/task/<module>/task.md` → di tiap task, bagian `SQL base contoh` (sebelum `Request/Response` json). Wajib `sql` fence, kolom eksplisit, Oracle dialect.

## Checklist cepat (ringkas)

- [ ] FROM → JOIN → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → FETCH
- [ ] `mst_` / `trn_` / `tmp_` dipatuhi, `FETCH` bukan `LIMIT`, tanpa `SELECT *`, kolom non-agregat ada di GROUP BY, tanggal range `>= / <`.

## Contoh

Lihat `rules/query_rules.md` Contoh 1 & 2 (top branch by amount, customer >5 orders).
