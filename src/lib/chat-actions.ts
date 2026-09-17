/**
 * Ready-made composer actions (ADR-001 D8).
 *
 * The counterpart of the "action picker" in the design reference: instead of the
 * user retyping the same instructions every time, the most frequently requested
 * jobs are available as a single click.
 *
 * The content is DELIBERATELY not derived from `agent-prompts.ts`, and that is a
 * measurable decision rather than a stylistic one: those builders (e.g.
 * `buildSitPrompt`) READ the project's artifacts and INLINE their contents into the
 * prompt — up to 2.500 characters for eight files per directory — because a CLI
 * agent had no file tools of its own. The Onesist runtime does: it has
 * `read_file`, `grep`, `code_search` and a symbol index, so inlining would undo the
 * progressive-disclosure work and spend context on every `/sit` before the agent
 * has decided it needs the files.
 *
 * What IS inherited from those builders is their rules — the SIT prompt's
 * "refinement mode" (read the existing files first, never delete a test case that
 * is already correct, keep the format) is carried in the instructions below. So the
 * behaviour matches what `buildSitPrompt` asked for, without pre-loading the
 * artifacts.
 */

export interface ChatAction {
  id: string;
  label: string;
  hint: string;
  /** Text inserted into the composer; the user can still edit it. */
  prompt: string;
  /** Slash command that inserts this same prompt (FR-5.4). One registry, two
   *  entry points — the popover list and `/` in the composer — so the two can
   *  never drift apart. */
  command: string;
}

export const CHAT_ACTIONS: ChatAction[] = [
  {
    id: "fsd-analyze",
    command: "fsd",
    label: "Analisa FSD",
    hint: "Baca input/fsd, hasilkan spec, ERD, dan task",
    prompt:
      "Analisa dokumen FSD terbaru di input/fsd, lalu hasilkan artefaknya mengikuti konvensi project: " +
      "MASTER_SPEC_API.md, ERD per modul di output/erd, task card di output/task, dan RTM di output/rtm. " +
      "Sebutkan berkas yang kamu buat atau ubah di akhir.",
  },
  {
    id: "openapi",
    command: "openapi",
    label: "Buat OpenAPI",
    hint: "Susun spesifikasi OpenAPI dari spec yang ada",
    prompt:
      "Susun spesifikasi OpenAPI 3.1 dari MASTER_SPEC_API.md dan simpan ke output/spec/openapi.json. " +
      "Semua endpoint, parameter, skema request/response, dan kode error harus ikut. " +
      "Laporkan endpoint yang belum punya definisi request atau response.",
  },
  {
    id: "rtm",
    command: "rtm",
    label: "Susun RTM",
    hint: "Petakan requirement ke desain dan test case",
    prompt:
      "Susun matriks traceability (RTM) dari requirement di input/fsd ke desain, endpoint, dan test case. " +
      "Tandai requirement yang belum punya turunan, lalu simpan ke output/rtm.",
  },
  {
    id: "sit",
    command: "sit",
    label: "Jalankan SIT",
    hint: "Siapkan skenario uji sistem",
    prompt:
      "Kerjakan SIT: baca dulu SEMUA berkas di output/sit/ sebelum mengubah apa pun. " +
      "Kalau berkasnya sudah ada, itu mode penyempurnaan — perbaiki test case yang kurang lengkap, tambahkan yang belum ter-cover, " +
      "JANGAN hapus test case yang sudah benar, dan pertahankan format yang ada. Kalau belum ada, buat skenario baru " +
      "lengkap dengan langkah, data uji, dan hasil yang diharapkan mengikuti format SIT project ini. " +
      "Jangan menandai satu pun kolom hasil sebagai sudah diuji — kolom itu diisi setelah pengujian sungguhan.",
  },
  {
    id: "docs",
    command: "docs",
    label: "Tulis Dokumentasi",
    hint: "Susun dokumentasi teknis dari artefak yang ada",
    prompt:
      "Susun dokumentasi teknis project ini dari artefak yang sudah ada (FSD, MASTER_SPEC_API.md, MASTER_ERD.md, task, RTM) " +
      "mengikuti konvensi output/td. Setiap halaman dokumentasi harus menunjuk balik ke artefak sumbernya, " +
      "dan sebutkan bagian yang belum bisa didokumentasikan karena artefaknya belum ada.",
  },
];
