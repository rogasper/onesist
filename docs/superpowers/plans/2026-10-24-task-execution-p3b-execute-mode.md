# Eksekusi task — Plan 3b: mode `execute`

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run task memakai mode izin `execute`: menulis berkas di dalam folder run tanpa bertanya, dan bertanya untuk apa pun di luar folder itu. Aturan AGENTS.md ("thread task mulai di `ask`") diberi pengecualian untuk run, sesuai keputusan user.

**Cakupan per runtime (keputusan penulis, perlu dikoreksi):**
- **Claude Code** (penuh): `canUseTool` mengizinkan Edit/Write/MultiEdit/NotebookEdit bila path-nya di dalam `cwd` (folder run). Read/Glob/Grep/LS diizinkan. Bash tetap bertanya, karena shell tidak bisa dibatasi ke folder. Di luar folder → bertanya.
- **Codex**: `execute` memakai sandbox `workspace-write` dengan `cwd` = folder run, approval `on-request`. Sandbox Codex sendiri membatasi tulis ke folder itu, jadi perilakunya sudah sesuai. Dicatat di test, tidak ada perubahan kode.
- **OpenCode, Pi**: `execute` dipetakan ke `ask` (perilaku sekarang). Belum ada pembatasan per path di aturan mereka. Ditandai sebagai pekerjaan lanjutan.
- **Antigravity**: tidak dipakai untuk run (sudah ditolak di Plan 3).

**Yang dipakai run:** Claude Code → `execute`. Provider CLI lain → `ask`.

Tasks:
1. Tipe: `PermissionMode` menerima `execute`; `shellAllowed` dan `mutatingAllowed` memperlakukannya seperti `ask`. Klien (`use-chat.ts`, composer) menerima nilai itu.
2. Claude: `claudePolicy` mengembalikan `execute` untuk thread agent; `disallowedToolsFor("execute")` kosong; `makeCanUseTool` menerima `cwd` dan mengizinkan tulis di dalam `cwd`.
3. Codex: tes yang mengunci perilaku `execute` (workspace-write, on-request, ask).
4. Run start: `permissionMode` = `execute` jika agen Claude, selain itu `ask`.
5. AGENTS.md: catat pengecualian dan batasannya.
6. Verifikasi: tes penuh, typecheck, commit.
