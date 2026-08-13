/**
 * Per-page "Help" content shown in the PageHelpButton popup. Tips are distilled
 * from `docs/` (source of truth) — keep them in sync when the docs change.
 * Bilingual: `id` is the app's default UI language, `en` for English users.
 */

export type PageHelpKey =
  | "dashboard"
  | "overview"
  | "fsd"
  | "erd"
  | "spec"
  | "tasks"
  | "rtm"
  | "docs"
  | "wiki"
  | "settings";

export interface PageHelp {
  title: { id: string; en: string };
  tips: { id: string[]; en: string[] };
  /** Full doc reference per language (footer note). */
  source?: { id: string; en: string };
}

const PAGE_HELP: Record<PageHelpKey, PageHelp> = {
  dashboard: {
    title: { id: "Projects — Panduan & Best Practices", en: "Projects — Guide & Best Practices" },
    tips: {
      id: [
        "Klik Open Project, pilih folder project root — semua artefak (input/, output/) tinggal di folder ini.",
        "Pilih Default Agent CLI yang terpasang; app otomatis menginstal skill fsd-analyzer & markitdown ke .agents/skills/.",
        'Banner merah "skills failed to install" → klik Retry install; tanpa skill, agent tidak bisa menghasilkan artefak.',
        "Alur kerja utama: FSD → ERD → Spec API → Tasks → Documentation (lihat docs/id/ per fase).",
        "File di output/ auto-refresh via file watcher — tidak perlu refresh manual.",
      ],
      en: [
        "Click Open Project and pick the project root folder — all artifacts (input/, output/) live here.",
        "Choose an installed Default Agent CLI; the app auto-installs the fsd-analyzer & markitdown skills into .agents/skills/.",
        'Red "skills failed to install" banner → click Retry install; without skills the agent cannot produce artifacts.',
        "Main flow: FSD → ERD → API Spec → Tasks → Documentation (see docs/en/ per phase).",
        "Files under output/ auto-refresh via the file watcher — no manual refresh needed.",
      ],
    },
    source: { id: "docs/id/01-mulai-cepat.md", en: "docs/en/01-quickstart.md" },
  },

  overview: {
    title: { id: "Overview — Petunjuk Pemakaian", en: "Overview — How to Use" },
    tips: {
      id: [
        "Baca artefak langsung di sini: klik file di file browser untuk preview markdown.",
        "Struktur: input/fsd/ = dokumen sumber, output/ = artefak (erd/, spec/, task/, td/), MASTER_ERD.md & MASTER_SPEC_API.md = konteks rolling.",
        "Tombol Terminal (kanan atas) menjalankan agent CLI di project root — ini jalur utama bekerja.",
        "Pola prompt: Peran + skill → file terlibat → tindakan → output jelas → batasan (file yang jangan diubah).",
      ],
      en: [
        "Read artifacts here: click a file in the file browser for a markdown preview.",
        "Layout: input/fsd/ = source docs, output/ = artifacts (erd/, spec/, task/, td/), MASTER_ERD.md & MASTER_SPEC_API.md = rolling context.",
        "The Terminal button (top-right) runs the agent CLI in the project root — that is the main working path.",
        "Prompt pattern: Role + skill → files involved → action → clear output → constraints (files not to touch).",
      ],
    },
    source: { id: "docs/id/02-struktur-project.md", en: "docs/en/02-project-structure.md" },
  },

  fsd: {
    title: { id: "FSD Analyzer — Panduan & Best Practices", en: "FSD Analyzer — Guide & Best Practices" },
    tips: {
      id: [
        "Taruh file asli (PDF/DOCX/PPTX) di input/fsd/sources/, lalu minta agent convert ke Markdown (skill markitdown).",
        "Split FSD jadi FD per modul/fitur (input/fsd/fd_*.md) agar tiap bagian bisa diproses paralel.",
        "Sebelum generate, diskusikan kebutuhan dengan agent (mode discovery) — tangkap QUESTION_FOR_BA / ASSUMPTION.",
        "Tandai dokumen Ready untuk menandai siap dianalisa; hasil convert muncul otomatis di tab ini.",
      ],
      en: [
        "Put source files (PDF/DOCX/PPTX) in input/fsd/sources/, then ask the agent to convert to Markdown (markitdown skill).",
        "Split the FSD into per-module/feature FDs (input/fsd/fd_*.md) so each part can be processed in parallel.",
        "Before generating, discuss requirements with the agent (discovery mode) — capture QUESTION_FOR_BA / ASSUMPTION.",
        "Mark documents Ready to signal they can be analyzed; converted docs appear here automatically.",
      ],
    },
    source: { id: "docs/id/03-workflow-fsd.md", en: "docs/en/03-fsd-workflow.md" },
  },

  erd: {
    title: { id: "ERD — Panduan & Best Practices", en: "ERD — Guide & Best Practices" },
    tips: {
      id: [
        "Generate dari FD via prompt: entity, kolom (tipe/not null/default), PK/FK, index/unique, relasi (1-N, N-M).",
        "File di output/erd/erd_<modul>.dbml; tab ini merender diagram (canvas + editor DBML).",
        "Review: kelengkapan, cardinality, normalisasi (mst_* vs trn_*), konvensi penamaan, field wajib.",
        "Revisi lewat prompt diskusi sampai final, lalu merge ke MASTER_ERD.md untuk konteks rolling.",
        "Quality gate: setiap entity punya PK, FK valid, tidak ada kolom redundan.",
      ],
      en: [
        "Generate from FDs via prompt: entities, columns (type/not null/default), PK/FK, index/unique, relationships (1-N, N-M).",
        "Files go to output/erd/erd_<modul>.dbml; this tab renders the diagram (canvas + DBML editor).",
        "Review: completeness, cardinality, normalization (mst_* vs trn_*), naming conventions, required fields.",
        "Iterate via discussion prompts until final, then merge into MASTER_ERD.md for rolling context.",
        "Quality gate: every entity has a PK, valid FKs, no redundant columns.",
      ],
    },
    source: { id: "docs/id/04-workflow-erd.md", en: "docs/en/04-erd-workflow.md" },
  },

  spec: {
    title: { id: "API Spec — Panduan & Best Practices", en: "API Spec — Guide & Best Practices" },
    tips: {
      id: [
        "Generate spec per modul (output/spec/spec_<modul>.md) dari FD + ERD final, lalu openapi.yaml (OpenAPI 3.0).",
        "Tab ini punya 3 view: Cards (kartu endpoint), Document (markdown), OpenAPI (Swagger UI).",
        "Setiap operation di openapi.yaml wajib punya summary, description, tags, request/response, dan x-status (done/in-develop).",
        "Review per endpoint: method/path, body/query, response sukses+error, auth/role, konsistensi dengan ERD.",
        "Update MASTER_SPEC_API.md setelah spec final.",
      ],
      en: [
        "Generate per-module specs (output/spec/spec_<modul>.md) from the final FD + ERD, then openapi.yaml (OpenAPI 3.0).",
        "This tab has 3 views: Cards (endpoint cards), Document (markdown), OpenAPI (Swagger UI).",
        "Every operation in openapi.yaml must have summary, description, tags, request/response, and x-status (done/in-develop).",
        "Review per endpoint: method/path, body/query, success+error responses, auth/role, consistency with the ERD.",
        "Update MASTER_SPEC_API.md once the spec is final.",
      ],
    },
    source: { id: "docs/id/05-workflow-spec-api.md", en: "docs/en/05-spec-api-workflow.md" },
  },

  tasks: {
    title: { id: "Tasks & Timeline — Panduan & Best Practices", en: "Tasks & Timeline — Guide & Best Practices" },
    tips: {
      id: [
        "Generate task cards dari ERD + Spec final: sub-task DB/BE/FE/Integration/Test, SP (1 SP = 4 jam), assignee per level, dependency.",
        "File di output/task/task_<modul>.md; tab ini menampilkan list/card + detail task.",
        "Estimasi & timeline: minta agent buat Gantt HTML self-contained (output/timeline_*.html) + ringkasan estimasi (asumsi tim, critical path, utilization).",
        "Review: granularitas task, SP realistis, dependency tanpa circular.",
        "Timeline view merender Gantt; laporan estimasi di output/reports/estimation_*.md.",
      ],
      en: [
        "Generate task cards from the final ERD + Spec: DB/BE/FE/Integration/Test subtasks, SP (1 SP = 4h), per-level assignee, dependencies.",
        "Files go to output/task/task_<modul>.md; this tab renders list/card + task detail views.",
        "Estimation & timeline: ask the agent for a self-contained HTML Gantt (output/timeline_*.html) + estimation summary (team assumptions, critical path, utilization).",
        "Review: task granularity, realistic story points, no circular dependencies.",
        "The Timeline view renders the Gantt; estimates land in output/reports/estimation_*.md.",
      ],
    },
    source: { id: "docs/id/06-workflow-tasks.md", en: "docs/en/06-tasks-workflow.md" },
  },

  rtm: {
    title: { id: "Traceability (RTM) — Panduan", en: "Traceability (RTM) — Guide" },
    tips: {
      id: [
        "Generate RTM per scope (BRD/FSD) — pilih scope + file FD yang ingin ditrace.",
        "Trace: Business Requirements (BR) → Design Solutions (DS) → Test Cases (TC) → Functional Requirements (FR); setiap FR mereferensikan BR.",
        "Cell design/test kosong = gap yang perlu dilengkapi — itu fokus review.",
        "ID sekuensial (BR-001, FR-001, ...) restart per scope; satu scope = satu file output/rtm/RTM_<scope>.md.",
        "Gunakan feedback box untuk melanjutkan sesi agent yang sama dengan koreksi (tanpa restart).",
      ],
      en: [
        "Generate the RTM per scope (BRD/FSD) — pick the scope + FD files to trace.",
        "Trace: Business Requirements (BR) → Design Solutions (DS) → Test Cases (TC) → Functional Requirements (FR); every FR references a BR.",
        "Empty design/test cells = gaps to fill — that is the review focus.",
        "Sequential IDs (BR-001, FR-001, ...) restart per scope; one scope = one file output/rtm/RTM_<scope>.md.",
        "Use the feedback box to continue the same agent session with a correction (no restart).",
      ],
    },
  },

  docs: {
    title: { id: "Docs (Technical Documentation) — Panduan", en: "Docs (Technical Documentation) — Guide" },
    tips: {
      id: [
        "Generate Technical Documentation / SRS final dari seluruh artefak (FD, ERD, Spec, Task).",
        "Ikuti template templates/technical-documentation.md; ganti SEMUA placeholder metadata ({{customerName}}, {{version}}, ...).",
        "Requirement Detail dipecah per FD terpisah (FE spec + BE spec + endpoint per FD).",
        "System Overview & Lampiran ERD pakai mermaid asli dari tabel final; Effort Estimation turun dari story points.",
        "Distribusi: salin ke Confluence/Google Docs; Export DOCX eksperimental — alternatif Pandoc.",
      ],
      en: [
        "Generate the final Technical Documentation / SRS from all artifacts (FD, ERD, Spec, Task).",
        "Follow the templates/technical-documentation.md template; replace ALL metadata placeholders ({{customerName}}, {{version}}, ...).",
        "Requirement Detail is split per FD (FE spec + BE spec + endpoint per FD).",
        "System Overview & ERD appendix use real mermaid diagrams from the final tables; Effort Estimation derives from story points.",
        "Distribution: copy to Confluence/Google Docs; DOCX export is experimental — Pandoc works as an alternative.",
      ],
    },
    source: { id: "docs/id/07-workflow-dokumentasi.md", en: "docs/en/07-documentation-workflow.md" },
  },

  wiki: {
    title: { id: "Wiki — Petunjuk Pemakaian", en: "Wiki — How to Use" },
    tips: {
      id: [
        "Wiki = dokumentasi tambahan bebas di luar artefak SA (konvensi tim, keputusan desain, meeting notes).",
        "Buat halaman baru lewat tombol New Page; edit markdown di editor (MDXEditor).",
        "Referensi file artefak/FSD di halaman wiki via markdown agar tetap terhubung dengan pipeline.",
        "Perubahan tersimpan di project root — pastikan struktur folder tetap rapi.",
      ],
      en: [
        "Wiki is free-form extra documentation beyond the SA artifacts (team conventions, design decisions, meeting notes).",
        "Create pages via the New Page button; edit markdown in the editor (MDXEditor).",
        "Link artifact/FSD files in wiki pages via markdown to stay connected with the pipeline.",
        "Changes save to the project root — keep the folder structure tidy.",
      ],
    },
  },

  settings: {
    title: { id: "Settings — Petunjuk Pemakaian", en: "Settings — How to Use" },
    tips: {
      id: [
        "Atur nama/company/deskripsi project dan Default Agent CLI (dipakai saat membuka terminal).",
        "Terminal: font size, theme, cursor — tersimpan per perangkat (localStorage).",
        "Root Path hanya info (read-only) — ubah lewat hapus lalu buka ulang project.",
        "Default agent tersimpan di DB; tab lain (FSD/Spec/RTM) memakai agent yang terdeteksi saat itu.",
      ],
      en: [
        "Configure project name/company/description and the Default Agent CLI (used when opening the terminal).",
        "Terminal: font size, theme, cursor — saved per device (localStorage).",
        "Root Path is read-only info — change it by removing and reopening the project.",
        "The default agent is stored in the DB; other tabs (FSD/Spec/RTM) use whichever agent is detected at that moment.",
      ],
    },
  },
};

export function getPageHelp(key: PageHelpKey): PageHelp {
  return PAGE_HELP[key];
}
