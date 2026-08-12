import fs from "node:fs";
import path from "node:path";
import { readFile, getProjectRoot } from "~/lib/file-router";

export function buildGeneratePrompt(fsdFile: string, agentName: string, rootOverride?: string): string {
  const root = rootOverride ?? getProjectRoot();
  const masterErd = readFile(root, "MASTER_ERD.md") || "(not found)";
  const masterSpec = readFile(root, "MASTER_SPEC_API.md") || "(not found)";
  const fsdContent = readFile(root, fsdFile) || "(not found)";

  const moduleName = fsdFile.replace(/^input\/fsd\/fsd_/, "").replace(/\.md$/, "");

  return `You are a Senior System Analyst. Use the fsd-analyzer skill.

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

### 3. Task Cards
Write to: \`output/task/task_${moduleName}.md\`
Format: Task cards with code, title, story points, assignee, flow logic, SQL, JSON
Break down into sub-tasks (BE, FE, DB, Integration).

### 4. Sequence Diagrams
Write to: \`output/spec/spec_${moduleName}.md\` (embed Mermaid)
Use \`\`\`mermaid ... \`\`\` blocks for flow diagrams.

## Rules
- Reference existing MASTER files for context but do NOT modify them
- Write ONLY the generated artifacts
- Use Indonesian for descriptions, English for technical terms
- Each file should be complete and ready for developer use
- The dashboard app at http://localhost:4321 is watching these directories
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
  const dirs = ["output/spec"];
  const artifacts: string[] = [];
  const root = rootOverride ?? path.resolve(process.cwd(), "..");
  const master = readFile(root, "MASTER_SPEC_API.md") || "(not found)";
  artifacts.push(`### MASTER_SPEC_API.md\n\`\`\`\n${master.slice(0, 6000)}\n\`\`\``);
  for (const dir of dirs) {
    try {
      const files = fs.readdirSync(path.join(root, dir)).filter((f: string) => f.endsWith(".md"));
      for (const f of files) {
        const content = fs.readFileSync(path.join(root, dir, f), "utf-8");
        artifacts.push(`### ${dir}/${f}\n\`\`\`\n${content.slice(0, 6000)}\n\`\`\``);
      }
    } catch {}
  }

  return `Kamu adalah Senior System Analyst. Generate file OpenAPI 3.0 dari artifact spec project.

Project root: ${root}
Running via: ${agentName}

## Input Spec Artifacts

${artifacts.join("\n\n")}

## Task

1. Tulis ke \`output/spec/openapi.yaml\` — dokumen OpenAPI 3.0 lengkap untuk SEMUA endpoint dari MASTER_SPEC_API.md dan semua file spec (digabung, path unik, jangan duplikat).
2. Tentukan status tiap endpoint dari isi spec:
   - Endpoint yang spec-nya lengkap/siap → \`x-status: done\`
   - Endpoint yang masih dikembangkan/berubah → \`x-status: in-develop\`
   - Jika spec menyebutkan fase (mis. "Phase 2", "P2", "Fase 3") → tulis \`x-phase: <angka>\`
3. Setiap operation WAJIB berisi:
   - \`summary\` (judul singkat endpoint)
   - \`description\` (rangkuman dari Purpose/Body/Response di spec)
   - \`tags\`: [Done] jika done, [In Develop] jika in-develop
   - \`x-status\` dan \`x-phase\` (x-phase boleh dihilangkan jika tidak ada info fase)
   - \`requestBody\` dan \`parameters\` jika spec menyebut body/query (deskripsi teks, schema boleh kosong {})
4. \`info.title\`: nama project, \`info.version\`: 1.0.0.
5. Hanya tulis \`output/spec/openapi.yaml\`. JANGAN modifikasi file markdown atau file lain.
6. Dashboard di http://localhost:4321 menonton direktori ini — file akan auto-refresh setelah selesai.`;
}

export function buildRtmPrompt(agentName: string, rootOverride?: string): string {
  const root = rootOverride ?? path.resolve(process.cwd(), "..");
  const artifacts: string[] = [];
  // Hard cap on total prompt size — a 100KB+ argv makes the model ingestion
  // painfully slow (and risks E2BIG). Once the budget is spent, stop adding.
  const BUDGET = 48 * 1024;
  let used = 0;

  const readDir = (dir: string, exts: string[], cap = 3000) => {
    if (used >= BUDGET) return;
    try {
      const files = fs.readdirSync(path.join(root, dir)).filter((f: string) => exts.some((e) => f.endsWith(e)));
      for (const f of files.slice(0, 8)) {
        const content = fs.readFileSync(path.join(root, dir, f), "utf-8");
        const slice = content.slice(0, cap);
        if (used + slice.length > BUDGET) {
          artifacts.push(`### ${dir}/${f}\n\`\`\`\n${slice.slice(0, Math.max(0, BUDGET - used))}\n\`\`\``);
          used = BUDGET;
          return;
        }
        artifacts.push(`### ${dir}/${f}\n\`\`\`\n${slice}\n\`\`\``);
        used += slice.length;
      }
    } catch {}
  };
  readDir("input/fsd", [".md"], 5000);
  readDir("output/spec", [".md"], 4000);
  readDir("output/erd", [".md", ".dbml"], 4000);
  readDir("output/task", [".md"], 2500);
  if (used < BUDGET) {
    const masterSpec = readFile(root, "MASTER_SPEC_API.md");
    const masterErd = readFile(root, "MASTER_ERD.md");
    if (masterSpec) artifacts.push(`### MASTER_SPEC_API.md\n\`\`\`\n${masterSpec.slice(0, Math.min(4000, BUDGET - used))}\n\`\`\``);
    if (masterErd) artifacts.push(`### MASTER_ERD.md\n\`\`\`\n${masterErd.slice(0, Math.min(4000, BUDGET - used))}\n\`\`\``);
  }

  return `You are a Senior System Analyst building a Requirement Traceability Matrix (RTM) that traces business requirements down to the technical side (design solution + test case).

Project root: ${root}
Running via: ${agentName}

## Input Artifacts

${artifacts.join("\n\n") || "(no artifacts found)"}

## Output

Write EXACTLY ONE file to \`output/rtm/RTM.md\` following this structure (Indonesian for titles/descriptions, English for technical terms):

\`\`\`markdown
# Requirement Traceability Matrix

## Business Requirements
| ID | Title | Description |
|----|-------|-------------|
| BR-001 | Login & Autentikasi | Pengguna dapat masuk ke aplikasi |

## Design Solutions
| ID | Title | Source | Description |
|----|-------|--------|-------------|
| DS-001 | AuthService.login | API Spec /auth/login | Endpoint login dengan validasi kredensial |

## Test Cases
| ID | Title | Steps | Expected |
|----|-------|-------|----------|
| TC-001 | Login berhasil | 1. Buka halaman login 2. Input email & password benar 3. Klik Login | Masuk ke dashboard |

## Functional Requirements
| ID | BR | Title | Description | Design Solution | Test Case |
|----|----|-------|-------------|-----------------|-----------|
| FR-001 | BR-001 | Login | Sistem memvalidasi kredensial pengguna | DS-001 | TC-001 |
\`\`\`

## Rules
- Every functional requirement MUST reference a business requirement (BR column).
- Design Solution / Test Case cells reference the codes defined above (semicolon-separated if multiple).
- Use sequential IDs: BR-001, FR-001, DS-001, TC-001, ...
- Each FR should be traced to at least one design solution; add test cases where derivable from the artifacts. If a requirement has no design or no test yet, leave the cell empty (that is the gap the dashboard will highlight).
- Only write \`output/rtm/RTM.md\`. Do NOT modify any other file.
- The dashboard at http://localhost:4321 watches these directories — the file auto-refreshes after you finish.
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
