/**
 * Ready-made composer actions (ADR-001 D8).
 *
 * The counterpart of the "action picker" in the design reference: instead of the
 * user retyping the same instructions every time, the most frequently requested
 * jobs are available as a single click.
 *
 * The content is DELIBERATELY not derived from `agent-prompts.ts`: the builder
 * there assembles prompts for external CLI agents (`opencode run "…"`), complete
 * with agent names and shell commands. The Onesist runtime already carries the
 * artifact conventions + skill list in the system prompt, so what the user needs
 * here is a concise command sentence — not a CLI prompt. Copying that builder
 * would duplicate instructions already present in the system prompt.
 */

export interface ChatAction {
  id: string;
  label: string;
  hint: string;
  /** Text inserted into the composer; the user can still edit it. */
  prompt: string;
}

export const CHAT_ACTIONS: ChatAction[] = [
  {
    id: "fsd-analyze",
    label: "Analisa FSD",
    hint: "Baca input/fsd, hasilkan spec, ERD, dan task",
    prompt:
      "Analisa dokumen FSD terbaru di input/fsd, lalu hasilkan artefaknya mengikuti konvensi project: " +
      "MASTER_SPEC_API.md, ERD per modul di output/erd, task card di output/task, dan RTM di output/rtm. " +
      "Sebutkan berkas yang kamu buat atau ubah di akhir.",
  },
  {
    id: "openapi",
    label: "Buat OpenAPI",
    hint: "Susun spesifikasi OpenAPI dari spec yang ada",
    prompt:
      "Susun spesifikasi OpenAPI 3.1 dari MASTER_SPEC_API.md dan simpan ke output/spec/openapi.json. " +
      "Semua endpoint, parameter, skema request/response, dan kode error harus ikut. " +
      "Laporkan endpoint yang belum punya definisi request atau response.",
  },
  {
    id: "rtm",
    label: "Susun RTM",
    hint: "Petakan requirement ke desain dan test case",
    prompt:
      "Susun matriks traceability (RTM) dari requirement di input/fsd ke desain, endpoint, dan test case. " +
      "Tandai requirement yang belum punya turunan, lalu simpan ke output/rtm.",
  },
  {
    id: "sit",
    label: "Jalankan SIT",
    hint: "Siapkan skenario uji sistem",
    prompt:
      "Buat skenario SIT untuk modul yang belum punya berkas di output/sit, lengkap dengan " +
      "langkah, data uji, dan hasil yang diharapkan mengikuti format SIT project ini. " +
      "Jangan menandai satu pun kolom hasil sebagai sudah diuji — kolom itu diisi setelah pengujian sungguhan.",
  },
];
