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
  const root = rootOverride ?? path.resolve(process.cwd(), "..");

  return `Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer.

Project root: ${root}
Running via: ${agentName}

## Instruksi
- Baca skill di \`.agents/skills/fsd-analyzer/SKILL.md\` dan ikuti \`references/openapi_format.md\`-nya untuk format lengkapnya.
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
- Baca skill di \`.agents/skills/fsd-analyzer/SKILL.md\` dan ikuti \`references/rtm_format.md\`-nya untuk struktur tabel, rules, dan mode scoped.
- Baca dokumen FSD scope ini: ${selected}
- Baca artifacts terkait: \`output/spec/*.md\`, \`output/erd/*.md\`/.dbml, \`output/task/*.md\`, plus \`MASTER_SPEC_API.md\` / \`MASTER_ERD.md\` bila ada (konteks project-wide).
- Trace ke dalam EXACTLY SATU file: \`${outputFile}\`
  - Indonesian untuk judul/deskripsi, English untuk istilah teknis.
  - Tabel: Business Requirements (BR), Design Solutions (DS), Test Cases (TC), Functional Requirements (FR).
  - Setiap FR WAJIB mereferensikan BR (kolom BR).
  - Cell Design Solution / Test Case mereferensikan kode (semicolon-separated jika banyak).
  - ID sekuensial: BR-001, FR-001, DS-001, TC-001, ... (restart per scope).
  - Jika requirement belum ada design/test, biarkan cell kosong — gap itulah yang ditampilkan dashboard.
- Hanya tulis \`${outputFile}\`. JANGAN modifikasi file lain.
- Dashboard di http://localhost:4321 menonton direktori ini — file akan auto-refresh setelah selesai.`;
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
