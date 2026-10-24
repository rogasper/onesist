# Eksekusi task — Plan 7: Antrian paralel dan Jalankan yang siap

> Catatan retrospektif: dokumen ini ditulis setelah kodenya selesai, untuk merangkum apa yang ada dan apa yang belum diverifikasi.

**Yang dibangun:**
- Run di atas batas paralel (`max_parallel`) masuk antrian (`state = queued`), tidak ditolak.
- `promoteQueued(projectId)` memulai run antri tertua selama ada slot. Dipanggil setelah run gagal (chat), lolos validasi, gagal validasi, disetujui, atau dibuang. Slot diklaim sebelum `await`, jadi dua promosi tidak mengambil slot yang sama.
- Prompt run dikirim lewat antrian chat server (`enqueue` + `kick`), jadi run jalan tanpa chat yang terbuka.
- Run antri yang task-nya sudah tidak siap ditandai `failed` dengan alasannya.
- Badge "Antri #n" pada kartu; nomor dari urutan `createdAt`.
- Tombol "Jalankan yang siap (n)" memulai task siap sesuai urutan timeline (`orderTasks`); server yang memutuskan jalan atau antri.

**Yang sudah diuji:** promosi saat ada slot, run antri yang tidak siap, nomor antrian lewat route, batas paralel tidak lagi menolak.

**Yang belum diuji:** antrian dengan agen CLI sungguhan; dan dua run yang benar-benar berjalan bersamaan di mesin nyata.
