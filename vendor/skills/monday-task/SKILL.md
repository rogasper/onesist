---
name: monday-task
version: 1.0.0
description: "Format dan kirim task Onesist ke Monday.com secara konsisten (Item + Update, atau Parent Item -> Subitem + Update) memakai task_external_card / onesist_task_card, tanpa path atau metadata internal Onesist."
---

# Monday Task — Format & Alur Kirim Task ke Monday.com

Skill ini membakukan cara menyusun dan mengirim task dari Onesist ke board Monday.com (baik lewat chat native Onesist maupun CLI agent yang terhubung ke MCP), supaya hasilnya **identik** dengan tombol **Copy** dan **Export Monday CSV** di tab Tasks.

---

## 1. Sumber Data Wajib (Satu Sumber Kebenaran)

Selalu ambil isi kartu task dari formatter eksternal Onesist — **jangan** menyalin markdown mentah dari `output/task/*.md` atau query langsung ke tabel `tasks`:

- **Chat native Onesist:** panggil tool `task_external_card` (`code`, `codes` maks. 20 per panggilan, atau `task_id`). Bila belum tahu daftar kode task di project, panggil `task_external_card` tanpa argumen untuk melihat daftar task aktif.
- **CLI agent eksternal (dengan Onesist MCP):** panggil tool `onesist_task_card`.

Setiap kartu dari tool mengembalikan field siap pakai:
- `title`: `{code}: {title}` (hanya satu kali — tanpa duplikasi `## Task ...`).
- `group`: nama Phase / Module untuk Group board.
- `fields`: daftar field penting yang **terisi saja** (`Assignee`, `Status`, `Story Points`, `Depends On`, `Blocks`) — tidak ada placeholder `—` atau `Unassigned`.
- `html`: konten rich text HTML siap tempel ke **Monday Update**.
- `text`: konten plain text siap tempel ke kolom **Description / Long Text** (jika diminta).

---

## 2. Pola Struktur Board (Item vs Subitem)

Struktur board Monday berbeda-beda antar System Analyst. Ikuti dua pola standar berikut:

### Pola A — Flat (`Item → Update`)
- 1 task = **1 Monday Item** di Group target (`name = card.title`).
- Isi kolom board dari `card.fields` (hanya kolom yang memang ada di board).
- Tulis detail task sebagai **Monday Update** pada Item tersebut memakai `card.html`.

### Pola B — Hierarki (`Parent Item → Subitem → Update`)
- Buat atau pakai ulang **Parent Item** (mis. per fitur, modul, epic, atau nama yang diminta user).
- Buat **1 Subitem** per task (`name = card.title`) di bawah Parent Item tersebut.
- Isi kolom subitem dari `card.fields` (hanya kolom yang tersedia di subitem board).
- Tulis detail task sebagai **Monday Update** pada **masing-masing Subitem** memakai `card.html`.

### Aturan Memilih Pola & Penempatan Detail
- **Ikuti pola eksplisit dari user** (mis. *"buat item lalu subitem dan isi updatenya"* → Pola B; *"langsung buat item + update"* → Pola A).
- **Jika user belum menyebut pola** dan struktur board target belum jelas apakah memakai Item langsung atau Parent Item + Subitem, **tanyakan singkat dalam 1 kalimat** sebelum membuat item, atau ikuti pola item yang sudah ada di group target.
- **Penempatan detail bawaan:** selalu masukkan `card.html` ke **Monday Update** (baik pada Item di Pola A maupun Subitem di Pola B). Gunakan kolom **Description / Long Text** (`card.text`) **hanya** bila user secara eksplisit memintanya.

---

## 3. Alur Kerja Standar (Step-by-Step)

1. **Kumpulkan kode task target** dari permintaan user (atau panggil `task_external_card` tanpa argumen bila perlu daftar task aktif).
2. **Ambil kartu standar** via `task_external_card` / `onesist_task_card` (pecah per batch maksimal 20 task jika banyak).
3. **Inspeksi board & kolom target via Monday MCP:**
   - Pastikan board ID, group ID, dan kolom yang tersedia (termasuk subitem board bila memakai Pola B).
   - **Cek duplikat:** cari apakah item/subitem dengan prefix `{code}:` sudah ada di board/parent tersebut. Jika sudah ada, konfirmasi apakah akan diperbarui atau dilewati — jangan menggandakan item secara diam-diam.
4. **Buat / perbarui item atau subitem:**
   - Nama item/subitem = `card.title`.
   - Group = `card.group` (kecuali user menentukan group lain).
   - Map `card.fields` ke kolom board yang cocok (`Status`, `Person`/`Assignee`, `Story Points`, `Depends On`/`Blocks`). Abaikan field kosong; jangan pernah isi `—`, `-`, atau `Unassigned`.
5. **Post Monday Update:**
   - Kirim `card.html` langsung ke Update Item (Pola A) atau Update Subitem (Pola B) **tanpa menulis ulang narasinya**.
   - Jangan menambahkan heading duplikat `## Task ...` di awal Update.
6. **Laporkan hasil secara ringkas:** board, group, pola yang dipakai (`Item → Update` atau `Parent → Subitem → Update`), daftar kode task yang berhasil dibuat/diperbarui, dan item yang dilewati (jika ada).

---

## 4. Aturan Sanitasi & Konten yang Dilarang

Hasil yang masuk ke Monday (nama item/subitem, kolom, maupun Update) **WAJIB bebas** dari artefak internal Onesist:

- **Dilarang** mencantumkan field internal: `Files Scope`, `Spec Ref`, `ERD Ref`, `RTM Ref`, `Source`, atau tabel ringkasan planner 2 kolom (`| Field | Detail |`).
- **Dilarang** mencantumkan path atau nama berkas internal Onesist: `output/`, `input/`, `.agents/`, `data.db`, `MASTER_*.md`, `task_*.md`, `spec_*.md`, `erd_*.dbml`, `tasks.json`, `*.prompt.md`.
- Gambar lokal (`input/assets/...`) sudah otomatis dikonversi oleh `task_external_card` menjadi `[Gambar: alt]` — jangan mengembalikan path lokalnya.
- Konten teknis yang memang berguna bagi developer/QA (tautan Figma, endpoint API, SQL, JSON payload, tabel UI Copy, checklist QC/Acceptance Criteria) **tetap dipertahankan** sesuai hasil `task_external_card`.

---

## 5. Mode Tanpa Monday MCP (Draft / Copy Manual)

Bila MCP Monday tidak terhubung dan user hanya meminta format task untuk ditempel ke Monday:
- Tetap ambil kartu lewat `task_external_card` dan tampilkan hasilnya mengikuti format bersih tersebut (`title`, `group`, `fields`, dan isi tanpa metadata internal).
- Boleh juga mengingatkan bahwa tombol **Copy** (rich HTML untuk Update) dan **Export Monday CSV** di tab Tasks menghasilkan format yang sama persis.

---

## Trigger Phrases

Gunakan skill ini saat user menulis `$monday-task` atau meminta:
- "kirim task ke Monday" / "push task ke board Monday" / "sync task ke Monday"
- "buat item/subitem Monday dari task ..."
- "isi update Monday untuk task ..."
- "format task ini buat Monday"
