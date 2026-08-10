import type { DocMeta } from "~/shared/types";
import { DOC_TEMPLATE_PATH } from "~/lib/doc-template";

export interface DocArtifact {
  /** Relative path from the project root (file or directory). */
  path: string;
  label: string;
  present: boolean;
}

export const REQUIRED_DOC_ARTIFACTS: Omit<DocArtifact, "present">[] = [
  { path: "input/fsd", label: "BRD / FD / Technical Requirement (input/fsd)" },
  { path: "MASTER_ERD.md", label: "Master ERD" },
  { path: "MASTER_SPEC_API.md", label: "Master API Spec" },
  { path: "output/spec", label: "API Spec (output/spec)" },
  { path: "output/erd", label: "ERD (output/erd)" },
  { path: "output/task", label: "Task Cards (output/task)" },
];

export function buildDocPrompt(meta: DocMeta, artifacts: DocArtifact[]): string {
  const present = artifacts
    .filter((a) => a.present)
    .map((a) => `- ${a.label} (\`${a.path}\`)`)
    .join("\n");
  const missing = artifacts
    .filter((a) => !a.present)
    .map((a) => `- ${a.label} (\`${a.path}\`)`)
    .join("\n");

  return `You are a Senior System Analyst producing the final Software Requirement Specification (SRS) / Technical Documentation for the client.

## Metadata
- Customer Name: ${meta.customerName || "N/A"}
- Project Name: ${meta.projectName || "N/A"}
- Project ID: ${meta.projectId || "N/A"}
- Version: ${meta.version || "1.0.0"}
- Author: ${meta.author || "N/A"}

## Template
Read and follow the template at \`${DOC_TEMPLATE_PATH}\` in the project root.
Replace ALL placeholders ({{customerName}}, {{projectName}}, {{projectId}}, {{version}}, {{author}}, {{date}}) with the metadata above and today's date.
Keep the document structure and every \`<!-- pagebreak -->\` marker exactly as-is. Do not remove any section.

## Required artifacts
${present || "  (none detected — proceed with the template structure and mark sections N/A)"}${missing ? `\n\nDetected as missing (note them as N/A in the document, do not remove the section):\n${missing}` : ""}

## Content requirements
1. Cover — project name, customer name, project ID, version, author, date.
2. Approvals & Knowledge — keep the signature table (Developer, System Analyst, Cell Lead SA, Cell Lead Dev) with empty cells for manual signing.
3. Introduction — Purpose, Background, Objectives from the BRD/FD; References with working links to BRD, FD, Technical Requirement, ERD; Version History with the initial entry (version, today's date, author, "Initial document").
4. Project Scope — In Scope and Out of Scope derived from the FD.
5. Effort Estimation — derive from output/task story points, grouped by module/phase, expressed in person-days.
6. System Overview — replace the template's placeholder \`\`\`mermaid\`\`\` block with a real Mermaid business-logic flowchart of the system (actors, main flows, boundaries). Use flowchart/sequence syntax.
7. Requirement Detail — breakdown setiap Functional Design (FD) di \`input/fsd/\` secara TERPISAH; JANGAN menggabungkan beberapa FD. Kelompokkan per module dengan heading bernomor (\`### 1. <Module>\`). Untuk tiap FD (\`#### FDxxx — <Nama Fitur>\`), urutannya:
   - \`* **Front End Specification**\` — screens, komponen, alur UI, API yang dikonsumsi.
   - \`* **Back End specification**\` — services, business logic, data handling.
   - Satu sub-bagian per endpoint: \`##### METHOD /path\`, diikuti tabel **2 kolom (Field | Value)** — kolom 1 = fields, kolom 2 = values — dengan baris: Type, Status, Description, Endpoint, Method, Request, Response, Table Related. Tambahkan baris opsional Note/Validation/Logic/Mapping jika perlu. JANGAN pakai satu tabel lebar 8 kolom. Untuk non-endpoint (mis. scheduler) gunakan Type yang sesuai (contoh "Cron Job (S1)") di tabel yang sama.
8. Lampiran ERD — replace the placeholder \`\`\`mermaid\`\`\` block with a complete Mermaid erDiagram of all tables and relationships from output/erd / MASTER_ERD.md.
9. Data Specification — one table per entity: Table, Column, Data Type, Constraint, Description.

## Output
Write the completed document to \`output/td/td_${Date.now()}.md\`.
Professional format. Use Indonesian for descriptive text, English for technical terms.
Do NOT modify any source artifact files.`;
}
