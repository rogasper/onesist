import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { json, notFound, badRequest } from "../../http/response";
import { Router } from "../../http/router";
import { getProject, defaultRoot } from "../../http/route-utils";
import { readFile, scanDirectory, findMasterFile, buildCombinedMissingPrompt } from "~/lib/file-router";
import { db } from "~/server/db/client";
import { tasks } from "~/server/db/schema";

export const router = new Router();

// Helper: CRC32
function crc32(buf: Uint8Array): number {
  let table: Uint32Array | null = null;
  if (!(crc32 as any).table) {
    table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
    (crc32 as any).table = table;
  }
  table = (crc32 as any).table;
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table![(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(files: Record<string, Uint8Array | string>): Uint8Array {
  const encoder = new TextEncoder();
  const fileEntries: { name: string; data: Uint8Array; crc: number }[] = [];
  for (const [name, content] of Object.entries(files)) {
    const data = typeof content === "string" ? encoder.encode(content) : content;
    fileEntries.push({ name, data, crc: crc32(data) });
  }
  const parts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  const writeU16 = (n: number) => { const a = new Uint8Array(2); new DataView(a.buffer).setUint16(0, n, true); return a; };
  const writeU32 = (n: number) => { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, n, true); return a; };

  const concat = (...arrs: Uint8Array[]) => {
    const total = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const a of arrs) { out.set(a, o); o += a.length; }
    return out;
  };

  for (const f of fileEntries) {
    const nameBytes = encoder.encode(f.name);
    const header = concat(
      writeU32(0x04034b50),
      writeU16(20), writeU16(0), writeU16(0), writeU16(0), writeU16(0),
      writeU32(f.crc), writeU32(f.data.length), writeU32(f.data.length),
      writeU16(nameBytes.length), writeU16(0),
      nameBytes,
    );
    parts.push(header, f.data);
    const cd = concat(
      writeU32(0x02014b50),
      writeU16(20), writeU16(20), writeU16(0), writeU16(0), writeU16(0), writeU16(0),
      writeU32(f.crc), writeU32(f.data.length), writeU32(f.data.length),
      writeU16(nameBytes.length), writeU16(0), writeU16(0), writeU16(0), writeU16(0),
      writeU32(0),
      writeU32(offset),
      nameBytes,
    );
    centralParts.push(cd);
    offset += header.length + f.data.length;
  }
  const centralDir = concat(...centralParts);
  const centralOffset = offset;
  offset += centralDir.length;
  const eocd = concat(
    writeU32(0x06054b50),
    writeU16(0), writeU16(0),
    writeU16(fileEntries.length), writeU16(fileEntries.length),
    writeU32(centralDir.length), writeU32(centralOffset),
    writeU16(0),
  );
  return concat(...parts, centralDir, eocd);
}

function csvEscape(v: string): string {
  if (v.includes('"') || v.includes(",") || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

function buildPromptMd(task: any, specSnippet: string, erdSnippet: string): string {
  const code = task.code || task.title?.split(":")[0] || "TASK";
  const title = task.title || code;
  const deps = task.dependenciesJson ? JSON.parse(task.dependenciesJson) : [];
  const blocks = task.blocksJson ? JSON.parse(task.blocksJson) : [];
  const filesScope = task.filesScopeJson ? JSON.parse(task.filesScopeJson) : [];
  const ac = task.acceptanceCriteriaJson ? JSON.parse(task.acceptanceCriteriaJson) : [];
  const desc = task.description || "";

  // Extract context, flow logic, sql/json snippets from description
  const contextMatch = desc.match(/###\s+Context\s*\n([\s\S]*?)(?=\n###\s+)/i);
  const context = contextMatch ? contextMatch[1].trim().slice(0, 800) : title.slice(0, 200);
  const flowMatch = desc.match(/###\s+Flow Logic[\s\S]*?((?:\d+\..*?\n)+)/i);
  const flow = flowMatch ? flowMatch[1].trim().slice(0, 1200) : desc.slice(0, 800);
  const sqlMatch = desc.match(/```sql([\s\S]*?)```/i);
  const sql = sqlMatch ? sqlMatch[1].trim().slice(0, 800) : "";
  const jsonBlocks = [...desc.matchAll(/```json([\s\S]*?)```/gi)].map((m) => m[1].trim().slice(0, 800));

  const filesScopeStr = filesScope.length > 0 ? filesScope.join(", ") : "`src/modules/{domain}/*` (conceptual — no repo required)";
  const depsStr = deps.length > 0 ? deps.join(", ") : "—";
  const blocksStr = blocks.length > 0 ? blocks.join(", ") : "—";

  return `# Role: Senior ${task.module || "Fullstack"} Developer — Task ${code}
> Language: English for code, Indonesian for business description
> Planner: Onesist (FSD → Spec → ERD → Task) — ready for external agent execution
> Execution: one task per agent iteration — topological sort by dependsOn

## Task
**Code:** ${code}
**Title:** ${title}
**Module:** ${task.module || "—"} | **Phase:** ${task.phase || "—"} | **SP:** ${task.storyPoints ?? "—"} (${(task.storyPoints ?? 0) * 4}h) | **Risk:** ${task.risk || "—"} | **Critical:** ${task.critical ? "Yes" : "No"}

## Context
${context}

## Files to modify
${filesScopeStr}

**Spec Ref:** ${task.specRef || "—"}
**ERD Ref:** ${task.erdRef || "—"}
**RTM Ref:** ${task.rtmRef || "—"}

**Spec snippet (30 lines max):**
\`\`\`
${specSnippet.slice(0, 1500) || "(not found — see context/MASTER_SPEC_API.md)"}
\`\`\`

**ERD snippet (30 lines max):**
\`\`\`
${erdSnippet.slice(0, 1500) || "(not found — see context/MASTER_ERD.md)"}
\`\`\`

## Dependencies
- **Depends On:** ${depsStr}
- **Blocks:** ${blocksStr}

## Steps — Flow Logic
${flow}

${sql ? `## SQL — base query example\n\`\`\`sql\n${sql}\n\`\`\`` : ""}

${jsonBlocks.length > 0 ? `## Contracts — JSON examples\n${jsonBlocks.map((j, i) => `\`\`\`json\n${j}\n\`\`\``).join("\n")}` : ""}

## Acceptance Criteria (Given-When-Then — must all pass)
${ac.length > 0 ? ac.map((a: string, i: number) => `${i + 1}. - [ ] ${a}`).join("\n") : "- [ ] Task completes as per Flow Logic + no regression"}

## Done when
- All Acceptance Criteria checked
- Tests green (if repo exists)
- No file outside Files Scope modified unless explicitly required

## Constraints
- Do not touch Out of scope sections in the markdown task
- Keep auth/error patterns from context/project_context.md
- Use Indonesian for business wording, English for code/comments
`;
}

function safeRead(rootPath: string, rel: string, max = 10000): string {
  try {
    const c = readFile(rootPath, rel);
    if (!c) return "";
    return c.slice(0, max);
  } catch { return ""; }
}

// GET /api/projects/:id/handoff?format=zip|json|jira-csv|monday-csv
router.get("projects/:id/handoff", async ({ params, query }) => {
  const id = params.id;
  const proj = getProject(id);
  if (!proj) return notFound();
  const rootPath = (proj.rootPath as string) || defaultRoot();
  const format = (query.get("format") || "zip").toLowerCase();

  const allTasks = db.select().from(tasks).where(eq(tasks.projectId, id)).all() as any[];
  // Sort by code for deterministic output
  allTasks.sort((a, b) => (a.code || "").localeCompare(b.code || ""));

  const projectName = (proj.name as string) || "project";
  const version = (proj.docVersion as string) || "1.0.0";
  const date = new Date().toISOString().slice(0, 10);

  // Build tasks.json
  const tasksJson = allTasks.map((t) => ({
    code: t.code,
    title: t.title,
    descriptionMd: t.description,
    status: t.status,
    storyPoints: t.storyPoints,
    hours: (t.storyPoints ?? 0) * 4,
    assignee: t.assignee,
    module: t.module,
    phase: t.phase,
    sourcePath: t.sourcePath,
    dependencies: t.dependenciesJson ? JSON.parse(t.dependenciesJson) : [],
    blocks: t.blocksJson ? JSON.parse(t.blocksJson) : [],
    critical: Boolean(t.critical),
    risk: t.risk,
    filesScope: t.filesScopeJson ? JSON.parse(t.filesScopeJson) : [],
    specRef: t.specRef,
    erdRef: t.erdRef,
    rtmRef: t.rtmRef,
    acceptanceCriteria: t.acceptanceCriteriaJson ? JSON.parse(t.acceptanceCriteriaJson) : [],
    archived: Boolean(t.archived),
  }));

  if (format === "json") {
    return json({ project: projectName, version, date, tasks: tasksJson });
  }

  if (format === "jira-csv" || format === "monday-csv") {
    const isJira = format === "jira-csv";
    const header = isJira
      ? ["Issue Key", "Summary", "Description", "Issue Type", "Story Points", "Assignee", "Labels", "Priority", "Sprint/Phase", "Linked Issues (Depends On)"]
      : ["Group", "Name", "Description", "Status", "Person", "Numbers (SP)", "Dependency", "Tags"];
    const rows: string[][] = [header];
    for (const t of tasksJson) {
      const summary = `${t.code}: ${t.title.replace(/^.*?:\s*/, "")}`.slice(0, 200);
      // Description: Context + AC + Flow snippet (truncate for CSV)
      const acStr = t.acceptanceCriteria.length > 0 ? t.acceptanceCriteria.map((a: string) => `- [ ] ${a}`).join("\n") : "";
      const desc = `${t.descriptionMd || ""}`.slice(0, 3000);
      const labels = [t.module, t.phase].filter(Boolean).join(" ");
      const priority = t.risk === "High" ? "High" : t.risk === "Medium" ? "Medium" : t.critical ? "High" : "Low";
      if (isJira) {
        rows.push([
          t.code || "",
          summary,
          desc,
          "Task",
          String(t.storyPoints ?? ""),
          t.assignee || "",
          labels,
          priority,
          t.phase || t.module || "",
          t.dependencies.join(", "),
        ]);
      } else {
        rows.push([
          t.phase || t.module || "No Phase",
          summary,
          desc,
          t.status,
          t.assignee || "",
          String(t.storyPoints ?? ""),
          t.dependencies.join(", "),
          labels,
        ]);
      }
    }
    const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
    const filename = isJira ? `jira-import-${projectName}-${date}.csv` : `monday-import-${projectName}-${date}.csv`;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Default: zip bundle
  if (format !== "zip" && format !== "handoff-zip") {
    return badRequest("format must be zip|json|jira-csv|monday-csv");
  }

  // Strict context check: MASTER files must exist (or force=true to allow placeholder)
  const missing: string[] = [];
  const masterErdFound = findMasterFile(rootPath, "MASTER_ERD.md");
  const masterSpecFound = findMasterFile(rootPath, "MASTER_SPEC_API.md");
  const projectContextFound = findMasterFile(rootPath, "project_context.md");
  if (!masterErdFound) missing.push("MASTER_ERD.md");
  if (!masterSpecFound) missing.push("MASTER_SPEC_API.md");
  if (!projectContextFound) missing.push("project_context.md");
  const force = query.get("force") === "true";
  if (missing.length > 0 && !force && format === "zip") {
    const prompt = buildCombinedMissingPrompt(missing, rootPath, proj);
    return json({ missing, prompt, message: `Context belum lengkap — ${missing.length} file hilang` }, 400);
  }

  // Collect context files (with placeholder when forced)
  const masterErd = masterErdFound ?? safeRead(rootPath, "MASTER_ERD.md", 20000);
  const masterSpec = masterSpecFound ?? safeRead(rootPath, "MASTER_SPEC_API.md", 20000);
  const projectContext = projectContextFound ?? safeRead(rootPath, "project_context.md", 10000) ?? safeRead(rootPath, "output/project_context.md", 10000);
  const openapi = safeRead(rootPath, "output/spec/openapi.yaml", 20000) || safeRead(rootPath, "output/spec/openapi.yml", 20000);

  // Collect spec/erd/rtm/task files via scanDirectory (plural-safe)
  const specFiles = scanDirectory(rootPath, "output/spec");
  const erdFiles = scanDirectory(rootPath, "output/erd");
  const rtmFiles = scanDirectory(rootPath, "output/rtm");
  const taskFiles = scanDirectory(rootPath, "output/task");

  const files: Record<string, string | Uint8Array> = {};

  // Manifest + README
  const totalSP = tasksJson.reduce((s: number, t: any) => s + (t.storyPoints ?? 0), 0);
  const criticalPath = tasksJson.filter((t: any) => t.critical).map((t: any) => t.code);
  const warnings = missing.length > 0 ? missing.map((m) => `${m} not found — placeholder`) : [];
  const manifest: any = {
    project: projectName,
    projectId: id,
    version,
    date,
    rootPath,
    totalTasks: tasksJson.length,
    totalSP,
    totalHours: totalSP * 4,
    criticalPath,
    warnings,
    files: [] as string[],
  };

  files["README.md"] = `# Handoff Bundle — ${projectName} v${version} (${date})

This bundle was generated by **Onesist (planner)** for external agent execution.

## How to use

1. Unzip.
2. Read \`context/MASTER_ERD.md\` + \`context/MASTER_SPEC_API.md\` + \`context/project_context.md\`.
3. Read \`task/tasks.json\` — topological sort by \`dependencies\`.
4. For each ready task (all \`dependencies\` done): paste \`prompts/{code}.prompt.md\` into your agent (Claude Code / Cursor / Codex / OpenCode).

## Execution model (Spec-Driven)

- One task = one agent iteration.
- \`Files Scope\` is conceptual — valid even if repo does not exist yet (agent will create paths).
- Acceptance Criteria are Given-When-Then — all must pass before next task.

## Formats

- \`task/tasks.json\` — machine.
- \`task/task_*.md\` — human (copy to Jira/Monday).
- \`jira-import.csv\` / \`monday-import.csv\` can be generated via \`GET /api/projects/${id}/handoff?format=jira-csv\`.

Generated: ${date}
`;

  // Context — if forced and missing, add placeholder so zip always has context/
  if (masterErd) files["context/MASTER_ERD.md"] = masterErd;
  else if (force) files["context/MASTER_ERD.md"] = `# MASTER_ERD.md\n> Placeholder — file not found at ${rootPath}. Generate via prompt: copy combined prompt from Export dialog.\n\n` + (missing.includes("MASTER_ERD.md") ? buildCombinedMissingPrompt(["MASTER_ERD.md"], rootPath, proj) : "");
  if (masterSpec) files["context/MASTER_SPEC_API.md"] = masterSpec;
  else if (force) files["context/MASTER_SPEC_API.md"] = `# MASTER_SPEC_API.md\n> Placeholder — file not found at ${rootPath}. Generate via prompt.\n\n` + (missing.includes("MASTER_SPEC_API.md") ? buildCombinedMissingPrompt(["MASTER_SPEC_API.md"], rootPath, proj) : "");
  if (projectContext) files["context/project_context.md"] = projectContext;
  else if (force) files["context/project_context.md"] = `# project_context.md\n> Placeholder — file not found at ${rootPath}. Generate via prompt.\n\n` + (missing.includes("project_context.md") ? buildCombinedMissingPrompt(["project_context.md"], rootPath, proj) : "");
  if (openapi) files["spec/openapi.yaml"] = openapi;

  // Spec/ERD/RTM/Task files
  for (const f of specFiles) {
    const content = readFile(rootPath, f.path);
    if (content) files[`spec/${f.name}`] = content;
  }
  for (const f of erdFiles) {
    const content = readFile(rootPath, f.path);
    if (content) files[`erd/${f.name}`] = content;
  }
  for (const f of rtmFiles) {
    const content = readFile(rootPath, f.path);
    if (content) files[`rtm/${f.name}`] = content;
  }
  for (const f of taskFiles) {
    const content = readFile(rootPath, f.path);
    if (content) files[`task/${f.path.replace(/^output\/tasks?\//, "")}`] = content;
  }

  // tasks.json
  files["task/tasks.json"] = JSON.stringify(tasksJson, null, 2);

  // prompts
  for (const t of allTasks) {
    if (!t.code) continue;
    // Find relevant snippets: try specRef/erdRef, else master
    let specSnippet = "";
    let erdSnippet = "";
    if (t.specRef) specSnippet = safeRead(rootPath, t.specRef.split("#")[0], 2000);
    if (!specSnippet) specSnippet = masterSpec.slice(0, 2000);
    if (t.erdRef) erdSnippet = safeRead(rootPath, t.erdRef.split("#")[0], 2000);
    if (!erdSnippet) erdSnippet = masterErd.slice(0, 2000);
    const safeCode = (t.code as string).replace(/[^A-Za-z0-9._-]/g, "_");
    files[`prompts/${safeCode}.prompt.md`] = buildPromptMd(t, specSnippet, erdSnippet);
  }

  // Build manifest file list
  manifest.files = Object.keys(files).sort();
  files["manifest.json"] = JSON.stringify(manifest, null, 2);

  // Also include CSVs inside zip for convenience
  // Generate CSV strings for inclusion
  const jiraHeader = ["Issue Key", "Summary", "Description", "Issue Type", "Story Points", "Assignee", "Labels", "Priority", "Sprint/Phase", "Linked Issues (Depends On)"];
  const jiraRows: string[][] = [jiraHeader];
  const mondayHeader = ["Group", "Name", "Description", "Status", "Person", "Numbers (SP)", "Dependency", "Tags"];
  const mondayRows: string[][] = [mondayHeader];
  for (const t of tasksJson) {
    const summary = `${t.code}: ${t.title.replace(/^.*?:\s*/, "")}`.slice(0, 200);
    const desc = `${t.descriptionMd || ""}`.slice(0, 2000).replace(/\n/g, " ");
    const labels = [t.module, t.phase].filter(Boolean).join(" ");
    const priority = t.risk === "High" ? "High" : t.risk === "Medium" ? "Medium" : t.critical ? "High" : "Low";
    jiraRows.push([t.code || "", summary, desc, "Task", String(t.storyPoints ?? ""), t.assignee || "", labels, priority, t.phase || t.module || "", t.dependencies.join(", ")]);
    mondayRows.push([t.phase || t.module || "No Phase", summary, desc, t.status, t.assignee || "", String(t.storyPoints ?? ""), t.dependencies.join(", "), labels]);
  }
  files["jira-import.csv"] = jiraRows.map((r) => r.map(csvEscape).join(",")).join("\n");
  files["monday-import.csv"] = mondayRows.map((r) => r.map(csvEscape).join(",")).join("\n");

  const zipBytes = createZip(files);
  const safeName = projectName.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 40) || "project";
  const filename = `handoff-${safeName}-v${version}-${date}.zip`;

  return new Response(zipBytes as any, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(zipBytes.length),
    },
  });
});
