import fs from "node:fs";
import path from "node:path";
import { readFile, getProjectRoot } from "~/lib/file-router";

export function buildGeneratePrompt(fsdFile: string, agentName: string, rootOverride?: string): string {
  const root = rootOverride ?? getProjectRoot();
  const masterErd = readFile(root, "MASTER_ERD.md") || "(not found)";
  const masterSpec = readFile(root, "MASTER_SPEC_API.md") || "(not found)";
  const fsdContent = readFile(root, fsdFile) || "(not found)";

  const moduleName = fsdFile.replace(/^input\/fsd\/fsd_/, "").replace(/\.md$/, "");

  return `You are a Senior System Analyst. Use the fsd-analyzer skill — read references/task_format.md and references/frontend_task_format.md for the canonical task template (12-row summary table + Context + Given-When-Then AC + Flow Logic + agentic handoff fields).

Project root: ${root}
Running via: ${agentName}

## Input Files

### FSD: ${fsdFile}
\`\`\`
${fsdContent.slice(0, 4000)}
\`\`\`

### MASTER_ERD.md (existing schema — context)
\`\`\`
${masterErd.slice(0, 2000)}
\`\`\`

### MASTER_SPEC_API.md (existing API — context)
\`\`\`
${masterSpec.slice(0, 2000)}
\`\`\`

## Task

Analyze the FSD above and generate the following artifacts by writing them to the output/ directory:

### 1. API Spec
Write to: \`output/spec/spec_${moduleName}.md\`
Format: Markdown with endpoint tables (Method, Path, Purpose, Body, Response)
Include all new endpoints from the FSD.

### 2. ERD
Write to: \`output/erd/erd_${moduleName}.dbml\`
Format: DBML syntax (use \`\`\`dbml ... \`\`\` blocks in markdown)
Include all new tables and relationships from the FSD.

### 3. Task Cards — agentic handoff ready
Write to: \`output/task/task_${moduleName}.md\`
Format: Follow references/task_format.md EXACTLY. 12-row summary table MUST include Files Scope, Spec Ref, ERD Ref, RTM Ref (conceptual paths are valid even without a repo — do not skip if repo is missing; use src/modules/{domain}/* style). Each task: Context (3-5 lines for agent injection) → Deskripsi (ID) → Goals → Scope → Out of scope → Acceptance Criteria as Given-When-Then checklist [ ] (testable) → Flow Logic (numbered, complete) → SQL base contoh (sql fence) → Request/Response (json fences, valid) → Notes → QC Checklist. Break down into sub-tasks (BE, FE, DB, Integration). Every task needs SP, Depends On, Blocks, Critical Path, Risk.

### 4. Sequence Diagrams
Write to: \`output/spec/spec_${moduleName}.md\` (embed Mermaid)
Use \`\`\`mermaid ... \`\`\` blocks for flow diagrams.

## Rules
- Reference existing MASTER files for context but do NOT modify them
- Write ONLY the generated artifacts
- Use Indonesian for Deskripsi/Goals/Scope/AC (Given-When-Then tetap ID), English for prompt-facing fields (Files Scope, Spec Ref), code, SQL, JSON
- Each file should be complete and ready for developer use
- The dashboard app at http://localhost:4321 is watching these directories
- Task output will be post-processed into tasks.json + prompts/{code}.prompt.md (English) for external agent execution — keep fields parseable
`;
}

export function buildGapPrompt(fsdFile: string, agentName: string, rootOverride?: string): string {
  const root = rootOverride ?? getProjectRoot();
  const masterErd = readFile(root, "MASTER_ERD.md") || "(not found)";
  const masterSpec = readFile(root, "MASTER_SPEC_API.md") || "(not found)";

  return `You are a Senior System Analyst performing a GAP analysis. Use the fsd-analyzer skill.

Running via: ${agentName}

Compare the FSD at \`${fsdFile}\` against:
- MASTER_ERD.md (current schema)
- MASTER_SPEC_API.md (current API)

Write a gap report to: \`output/reports/gap_${Date.now()}.md\`

Identify:
1. Missing tables/columns vs current schema
2. Missing endpoints vs current API
3. Conflicts between FSD requirements and existing design
4. Migration requirements

Also provide recommendations for how to update MASTER files to close the gaps.
`;
}

export function buildOpenapiPrompt(agentName: string, rootOverride?: string): string {
  const root = rootOverride ?? path.resolve(process.cwd(), "..");

  return `Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer.

Project root: ${root}
Running via: ${agentName}

## Instruksi
- Baca skill di \`.agents/skills/fsd-analyzer/SKILL.md\` dan ikuti \`references/openapi_format.md\`-nya untuk format lengkapnya. Jika file \`references/openapi_format.md\` TIDAK ada di skill, tetap ikuti instruksi di prompt ini (summary/description/tags/request/response/x-status/x-phase).
- Baca \`MASTER_SPEC_API.md\` dan semua \`output/spec/*.md\` di project root.
- Generate OpenAPI 3.0 yang menggabungkan SEMUA endpoint (path unik, jangan duplikat) dan tulis EXACTLY SATU file ke \`output/spec/openapi.yaml\`.
- Setiap operation WAJIB berisi \`summary\`, \`description\`, \`tags\` ([Done] / [In Develop]), \`requestBody\`/\`parameters\` jika spec menyebut body/query, \`x-status: done|in-develop\`, dan \`x-phase\` jika ada info fase.
- Hanya tulis \`output/spec/openapi.yaml\`. JANGAN modifikasi file markdown atau file lain.
- Dashboard di http://localhost:4321 menonton direktori ini — file akan auto-refresh setelah selesai.`;
}

export function buildRtmPrompt(agentName: string, rootOverride?: string, fsd?: string, fds?: string[]): string {
  const root = rootOverride ?? path.resolve(process.cwd(), "..");
  const scope = fsd || "default";
  const selected = fds && fds.length > 0
    ? fds.map((f) => `input/fsd/${f}.md`).join(", ")
    : "SEMUA dokumen di input/fsd/ (baca sendiri)";
  const outputFile = scope === "default" ? "output/rtm/RTM.md" : `output/rtm/RTM_${scope}.md`;

  return `Kamu adalah Senior System Analyst membangun Requirement Traceability Matrix (RTM) yang menelusuri business requirements ke sisi teknis (design solution + test case).

Project root: ${root}
Running via: ${agentName}
Scope: ${scope}

## Instruksi
- Baca skill di \`.agents/skills/fsd-analyzer/SKILL.md\` dan ikuti \`references/rtm_format.md\`-nya untuk struktur tabel, rules, dan mode scoped. Jika file \`references/rtm_format.md\` TIDAK ada di skill, gunakan format tabel PERSIS di bawah ini.
- Baca dokumen FSD scope ini: ${selected}
- Baca artifacts terkait: \`output/spec/*.md\`, \`output/erd/*.md\`/.dbml, \`output/task/*.md\`, plus \`MASTER_SPEC_API.md\` / \`MASTER_ERD.md\` bila ada (konteks project-wide).
- Trace ke dalam EXACTLY SATU file: \`${outputFile}\`
  - Indonesian untuk judul/deskripsi, English untuk istilah teknis.
  - Setiap FR WAJIB mereferensikan BR (kolom BR).
  - Cell Design Solution / Test Case mereferensikan kode (semicolon-separated jika banyak).
  - ID sekuensial: BR-001, FR-001, DS-001, TC-001, ... (restart per scope).
  - Jika requirement belum ada design/test, biarkan cell kosong — gap itulah yang ditampilkan dashboard.
- **Urutan kolom tabel WAJIB persis seperti di bawah ini (jangan diubah, jangan ditukar Title/Description/BR):**

\`\`\`markdown
# Requirement Traceability Matrix

## Business Requirements
| ID | Title | Description |
|----|-------|-------------|
| BR-001 | <judul> | <deskripsi> |

## Design Solutions
| ID | Title | Source | Description |
|----|-------|--------|-------------|
| DS-001 | <judul> | <ref ke spec/erd> | <deskripsi> |

## Test Cases
| ID | Title | Steps | Expected |
|----|-------|-------|----------|
| TC-001 | <judul> | <langkah> | <hasil yang diharapkan> |

## Functional Requirements
| ID | BR | Title | Description | Design Solution | Test Case |
|----|----|-------|-------------|-----------------|-----------|
| FR-001 | BR-001 | <judul> | <deskripsi> | DS-001 | TC-001 |
\`\`\`

- Hanya tulis \`${outputFile}\`. JANGAN modifikasi file lain.
- Dashboard di http://localhost:4321 menonton direktori ini — file akan auto-refresh setelah selesai.`;
}

export function buildSitPrompt(agentName: string, rootOverride?: string): string {
  const root = rootOverride ?? path.resolve(process.cwd(), "..");
  const masterErd = readFile(root, "MASTER_ERD.md") || "(not found)";
  const masterSpec = readFile(root, "MASTER_SPEC_API.md") || "(not found)";
  const dirs = ["input/fsd", "output/spec", "output/erd", "output/task", "output/rtm"];
  const artifacts: string[] = [];

  for (const dir of dirs) {
    try {
      const dirPath = path.join(root, dir);
      if (!fs.existsSync(dirPath)) continue;
      const files = fs.readdirSync(dirPath)
        .filter((f: string) => f.endsWith(".md") || f.endsWith(".dbml"))
        .sort()
        .slice(0, 8);
      for (const f of files) {
        const content = fs.readFileSync(path.join(dirPath, f), "utf-8");
        artifacts.push(`### ${dir}/${f}\n\`\`\`\n${content.slice(0, 2500)}\n\`\`\``);
      }
    } catch {}
  }

  let existingContext = "";
  try {
    const sitDir = path.join(root, "output", "sit");
    if (fs.existsSync(sitDir)) {
      const existing = fs.readdirSync(sitDir).filter((f: string) => f.endsWith(".md")).sort();
      if (existing.length > 0) {
        existingContext = `\n\n## Existing SIT Files (Refinement Mode)
Files: ${existing.join(", ")}

BACA SEMUA file di output/sit/ terlebih dahulu sebelum melakukan perubahan.
- Perbaiki test cases yang melenceng atau kurang lengkap
- Tambahkan test cases untuk artifacts yang belum di-cover
- JANGAN hapus test cases yang sudah benar
- Pertahankan format existing
- Update SIT_SUMMARY.md diakhir
`;
      }
    }
  } catch {}

  return `Kamu adalah Senior QA Lead menyusun System Integration Test (SIT) yang komprehensif.

Project root: ${root}
Running via: ${agentName}

## Instruksi

1. **Baca skill**: \`.agents/skills/fsd-analyzer/SKILL.md\` — gunakan sebagai panduan utama.
2. **Baca SIT instructions**: \`references/sit_instructions.md\` dari skill fsd-analyzer (atau gunakan format template di bawah jika tidak ada).
3. **Baca SIT format**: \`references/sit_format.md\` dari skill fsd-analyzer.
4. **Baca SEMUA artifacts**:
   - \`input/fsd/*.md\` — FSD documents
   - \`output/spec/*.md\` — API specifications
   - \`output/erd/*.dbml\` + \`output/erd/*.md\` — ERD
   - \`output/task/*.md\` — Task cards
   - \`output/rtm/*.md\` — Tracing matrix (jika ada)
   - \`MASTER_ERD.md\` + \`MASTER_SPEC_API.md\` — Konteks project-wide (jika ada)
5. **Generate SIT test cases** ke \`output/sit/\`:
   - \`output/sit/TC01.md\`, \`TC02.md\`, ..., \`TC{nn}.md\` — satu file per TC group
   - \`output/sit/SIT_SUMMARY.md\` — Ringkasan keseluruhan
${existingContext}

## Rules Singkat

- Setiap fitur: minimal 3 test steps (1 positive + 2 negative)
- Expected result WAJIB 3 aspek: UI Validation + Business Validation + Data Validation
- Browser matrix: 5 platform (Chrome, Safari, Firefox, iOS, Android)
- Bahasa: Indonesian untuk deskripsi, English untuk istilah teknis
- ID: TC{nn} per group, TC{nn}xxx per step, [BUGnnn] untuk bug reference
- Jika ada RTM, trace back ke FR/BR/DS code (e.g. "Ref: FR-045")
- Target 5-30 TC groups (tergantung kompleksitas)

## Format (WAJIB — jangan variasi)

- **HANYA gunakan format STANDARD** seperti di bawah. **DILARANG**: metadata sebagai tabel (\`| Attribute | Value |\`), step sebagai tabel Action/Expected, atau heading \`## TCxxxxx\` sebagai step. Semua file WAJIB konsisten dengan format STANDARD.
- Setiap file punya struktur: \`# TC{nn} - Judul\` → \`## Metadata\` (field list \`- **Key**: value\`) → \`## Steps\` → per-step \`### TC{nn}xxx - Menu - Feature\`.
- **Field Tester / Location**: jika \`SIT_SUMMARY.md\` sudah ada dengan daftar \`Testers\`, isi otomatis dengan nama tester tersebut; jika tidak ada, biarkan kosong (jangan diisi placeholder).
- Setiap \`- **Expected Result**:\` WAJIB ≥ 3 aspek dan tidak singkat — kalau isi kurang, perpanjang dengan detail konkret (query, response, error code).
- **Quality checklist sebelum selesai**: (1) semua file format STANDARD; (2) setiap step punya 5 baris browser matrix; (3) tidak ada kode step duplikat; (4) tester terisi jika ada daftar di summary; (5) SIT_SUMMARY.md sinkron dengan jumlah step aktual di tiap file.

## Format Contoh (singkat)

\`\`\`markdown
# TC01 - Judul Modul

## Metadata
- **Test Case ID**: TC01
- **Title**: Judul Modul
- **Description**: UI Expectation, Data Validation, Mechanism CRUD
- **Overall Progress**: Not Yet
- **Overall Status**: Not started

## Steps

### TC01001 - Menu - Feature
- **User Story**: Sebagai user, saya ingin ...
- **Step**: 
  1. Login
  2. Klik Menu
  3. Input data
- **Data Input**: {realistis sesuai domain}
- **Expected Result**:
  UI: Form layout sesuai Figma
  Business: Validation logic, penjagaan
  Data: Query DB reference
- **Type**: Positive | Negative
- **Tested**: Not started

#### Browser Results
| Browser/Device | Tested | First Status | PIC | First Date | Actual Result | Last Status | Last Date | Last Actual | Evidence |
| Desktop Chrome | Not started | - | - | - | - | - | - | - | - |
| Desktop Safari | Not started | - | - | - | - | - | - | - | - |
| Desktop Firefox | Not started | - | - | - | - | - | - | - | - |
| iOS | Not started | - | - | - | - | - | - | - | - |
| Android | Not started | - | - | - | - | - | - | - | - |

- **Bug**: -
- **Final PIC**: -
- **Final Result**: -
- **Final Status**: Not started
\`\`\`

## Context

### MASTER_ERD.md
\`\`\`
${masterErd.slice(0, 2000)}
\`\`\`

### MASTER_SPEC_API.md
\`\`\`
${masterSpec.slice(0, 2000)}
\`\`\`

### Artifacts
${artifacts.join("\n\n")}

## Output

Tulis semua file ke \`output/sit/\`. Hanya tulis output files, JANGAN modifikasi file input/master/artifacts lain.
Dashboard di http://localhost:4321 menonton direktori ini — akan auto-refresh setelah selesai.
`;
}

export function buildTdPrompt(agentName: string, rootOverride?: string): string {
  const dirs = ["output/spec", "output/erd", "output/task"];
  const artifacts: string[] = [];
  const root = rootOverride ?? path.resolve(process.cwd(), "..");
  for (const dir of dirs) {
    try {
      const files = fs.readdirSync(path.join(root, dir)).filter((f: string) => f.endsWith(".md") || f.endsWith(".dbml"));
      for (const f of files) {
        const content = fs.readFileSync(path.join(root, dir, f), "utf-8");
        artifacts.push(`### ${dir}/${f}\n\`\`\`\n${content.slice(0, 2000)}\n\`\`\``);
      }
    } catch {}
  }

  return `You are a Senior System Analyst consolidating all project artifacts into a Technical Document.

Running via: ${agentName}

## All Artifacts

${artifacts.join("\n\n")}

## Task

Generate a consolidated Technical Document (TD) and write to \`output/td/td_${Date.now()}.md\`.

The TD should include:
1. Cover page — project name, date, version
2. Table of contents
3. Scope and objectives
4. Actor definitions
5. FE specifications — screens, flows, components
6. BE specifications — endpoints, services, integrations
7. ERD — all tables with relationships (DBML)
8. API reference — all endpoints grouped by module
9. Task breakdown — all tasks with SP, assignee, dependencies
10. Sequence diagrams (Mermaid) for key flows
11. Timeline/Gantt — sprint breakdown

Format: Professional Confluence-style markdown ready for export.
`;
}
