import fs from "node:fs";
import path from "node:path";

export interface ParsedTask {
  code: string;
  title: string;
  storyPoints: number | null;
  assignee: string | null;
  module: string | null;
  parentCode: string | null;
  status: string;
  phase: string | null;
  contentMd: string | null;
  sourcePath: string | null;
  // Agentic handoff fields (planner → executor) — conceptual paths valid even without repo
  blocks: string[];
  critical: boolean;
  risk: string | null;
  filesScope: string[];
  specRef: string | null;
  erdRef: string | null;
  rtmRef: string | null;
  acceptanceCriteria: string[];
}

export function scanAllTaskFiles(rootPath: string): { tasks: ParsedTask[]; skippedFiles: string[] } {
  const tasks: ParsedTask[] = [];
  const skippedFiles: string[] = [];

  // Support both output/task and output/tasks
  const candidateDirs = ["output/task", "output/tasks"];
  const existingRoots = candidateDirs
    .map((d) => ({ rel: d, full: path.join(rootPath, d) }))
    .filter((entry) => fs.existsSync(entry.full));

  if (existingRoots.length === 0) return { tasks, skippedFiles };

  const processedRelativeFiles = new Set<string>();

  for (const { rel: relDir, full: taskRoot } of existingRoots) {
    const rootFiles = fs.readdirSync(taskRoot).filter((f) =>
      f.endsWith(".md") && !f.startsWith(".") && (/^tasks?_/i.test(f) || f === "task.md" || f === "MASTER_TASK.md"),
    );
    for (const file of rootFiles) {
      if (processedRelativeFiles.has(file)) continue;
      processedRelativeFiles.add(file);
      const content = fs.readFileSync(path.join(taskRoot, file), "utf-8");
      const parsed = parseTaskFile(content, file, relDir);
      if (parsed.length === 0) skippedFiles.push(file);
      tasks.push(...parsed);
    }

    const dirs = fs.readdirSync(taskRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const dir of dirs) {
      const phasePath = path.join(taskRoot, dir.name);
      const phaseFiles = fs.readdirSync(phasePath).filter((f) => f.endsWith(".md"));
      phaseFiles.sort((a, b) => (a === "master.md" ? -1 : b === "master.md" ? 1 : a.localeCompare(b)));
      for (const file of phaseFiles) {
        const rel = `${dir.name}/${file}`;
        if (processedRelativeFiles.has(rel)) continue;
        processedRelativeFiles.add(rel);
        const content = fs.readFileSync(path.join(phasePath, file), "utf-8");
        const parsed = file === "master.md"
          ? parseMasterMd(content, dir.name, relDir)
          : parsePhaseTaskFile(content, file, dir.name, relDir);
        if (parsed.length === 0) skippedFiles.push(rel);
        tasks.push(...parsed);
      }
    }
  }

  // Deduplicate by code — the last parsed entry (dedicated task file) wins
  const byCode = new Map<string, ParsedTask>();
  for (const t of tasks) {
    const key = t.code;
    if (!key) continue;
    const prev = byCode.get(key);
    if (!prev || (prev.sourcePath?.endsWith("master.md") && t.sourcePath && !t.sourcePath.endsWith("master.md"))) {
      byCode.set(key, t);
    }
  }
  const seen = new Set<string>();
  const result: ParsedTask[] = [];
  for (const t of tasks) {
    if (!t.code) continue;
    if (seen.has(t.code)) continue;
    seen.add(t.code);
    result.push(byCode.get(t.code)!);
  }

  // Enrich thin master.md rows with the parent's dedicated design file when one exists
  const parentByCode = new Map<string, ParsedTask>();
  for (const t of result) {
    if (!t.parentCode && t.sourcePath && !t.sourcePath.endsWith("master.md")) {
      parentByCode.set(t.code, t);
    }
  }
  for (const t of result) {
    if (!t.parentCode || !t.sourcePath?.endsWith("master.md")) continue;
    if (t.contentMd && t.contentMd.length > 1200) continue;
    const parent = parentByCode.get(t.parentCode);
    if (parent?.contentMd && parent.contentMd.length > (t.contentMd?.length ?? 0) + 300) {
      t.contentMd = `${t.contentMd}\n\n---\n\n## Referensi (${parent.code} — detail lengkap)\n\n${parent.contentMd}`;
    }
  }

  return { tasks: result, skippedFiles };
}

function parseMasterMd(content: string, phase: string, baseDir: string = "output/task"): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = content.split("\n");

  let currentParent: { code: string; title: string; assignee: string; startLine: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parentMatch = line.match(/^###\s+(\S+)\s*[—–-]\s*(.+?)(?:\s*\(([^)]*)\))?\s*$/);
    if (parentMatch) {
      if (currentParent) {
        currentParent = null;
      }
      currentParent = {
        code: parentMatch[1],
        title: parentMatch[2].trim(),
        assignee: extractAssignee(parentMatch[3] || ""),
        startLine: i,
      };
      continue;
    }

    // Only process subtask tables inside a parent section
    const rowMatch = line.match(/^\|\s*(\S+)\s*\|\s*(.+?)\s*\|\s*([\d.]+)\s*\|/);
    if (rowMatch && currentParent) {
      const code = rowMatch[1].trim();
      const title = rowMatch[2].trim();
      const sp = parseFloat(rowMatch[3]);

      const parentPrefix = currentParent.code.split("-").slice(0, 2).join("-");
      const parentShort = currentParent.code.split("-").slice(-1)[0];
      let fullCode = code.includes(parentPrefix) ? code : `${parentPrefix}-${code}`;
      if (code.startsWith(`${parentShort}-`) && !code.includes(parentPrefix)) {
        fullCode = `${parentPrefix}-${code.slice(parentShort.length + 1)}`;
      }

      const assigneeMatch = title.match(/\[(\w+)\]/);
      const assignee = assigneeMatch ? roleToAssignee(assigneeMatch[1], currentParent.assignee) : currentParent.assignee;

      // Build contentMd from the parent section: from the parent heading to the
      // next parent heading or end of file — includes all sibling rows + notes
      let sectionEnd = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith("### ")) { sectionEnd = j; break; }
      }
      const sectionContent = lines.slice(currentParent.startLine, sectionEnd).join("\n");

       const handoff = extractHandoffFields(sectionContent);
       tasks.push({
        code: fullCode,
        title: title.replace(/\[(\w+)\]\s*/, "").trim(),
        storyPoints: isNaN(sp) ? null : sp,
        assignee,
        module: currentParent.code.split("-")[0] || phase,
        parentCode: currentParent.code,
        status: "todo",
        phase,
        contentMd: sectionContent,
        sourcePath: `${baseDir}/${phase}/master.md`,
        ...handoff,
      });
    }
  }

  return tasks;
}

function parseTaskFile(content: string, filename: string, baseDir: string = "output/task"): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = content.split("\n");
  // Combined task files (task.md / MASTER_TASK.md) share no module prefix —
  // normalize them to "task" so codes come out like "task-T01". Accept both
  // singular (task_fe.md) and plural (tasks_001.md) prefixes — agents write
  // either; a numeric remainder (tasks_001) stays as the module so codes from
  // different files (001-1 vs 002-1) never collide in the dedupe.
  const moduleName = filename.replace(/\.md$/i, "").replace(/^MASTER_TASK$/i, "task").replace(/^tasks?_/i, "") || "task";

  // Find story points table
  let inSpTable = false;
  const spMap: Record<string, number> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("| Task | Story Point |")) { inSpTable = true; continue; }
    if (inSpTable) {
      if (line.startsWith("|") && line.includes("|")) {
        const cols = line.split("|").map((c) => c.trim());
        if (cols.length >= 4) {
          const taskName = cols[1];
          const sp = parseFloat(cols[2]);
          spMap[taskName] = isNaN(sp) ? 0 : sp;
        }
      } else { inSpTable = false; }
    }
  }

  // Find task sections and extract their content. The fsd-analyzer skill
  // documents several heading variants and different models follow different
  // ones, so accept all of them (H2 only):
  //   A: "## Task FE-1: Title" — canonical; separator can be : ： — – -
  //   B: "## Task: Title"      — no ID → deterministic auto-number
  //   C: "## FE-1: Title"      — code-like ID without the "Task" keyword
  const headingPatterns = [
    /^##\s+Task\s+([A-Za-z0-9._-]+)\s*[:：—–-]\s*(.*)$/i,
    // Empty group 1 keeps the (id, title) layout consistent across patterns
    /^##\s+Task\s*[:：]\s*()(.+)$/i,
    /^##\s+([A-Za-z]{1,12}-\d[\w.-]*)\s*[:：—–-]\s*(.+)$/,
  ];
  let autoIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let sectionMatch: RegExpMatchArray | null = null;
    for (const re of headingPatterns) {
      sectionMatch = line.match(re);
      if (sectionMatch) break;
    }
    if (!sectionMatch) continue;
    const rawId = sectionMatch[1];
    const title = (sectionMatch[2] ?? "").trim();
    if (!title) continue;

    // Codes that already carry the module/role prefix (FE-1 inside task_fe.md)
    // stay as-is; otherwise prepend the module (## Task 1: → be-1).
    let code: string;
    if (!rawId) {
      code = `${moduleName}-${++autoIndex}`;
    } else {
      const prefix = rawId.toLowerCase();
      code = prefix.startsWith(`${moduleName.toLowerCase()}-`) || prefix.startsWith(`${moduleName.toLowerCase()}_`) || prefix.startsWith(`${moduleName.toLowerCase()}.`)
        ? rawId
        : `${moduleName}-${rawId}`;
    }

    // Extract content from this ## heading to the next ## heading or end
    let sectionEnd = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].startsWith("## ")) { sectionEnd = j; break; }
    }
    const sectionContent = lines.slice(i, sectionEnd).join("\n");

    // SP: prefer the task's own detail table, fall back to the summary spMap
    const spMatch = sectionContent.match(/\|\s*Story Point\s*\|\s*([\d.]+)\s*\|/i);
    const sp = spMatch ? parseFloat(spMatch[1]) : (rawId ? (spMap[rawId] ?? null) : null);

    // Assignee: from the detail table `| Developer | <name> |`, else null
    const devMatch = sectionContent.match(/\|\s*Developer\s*\|\s*(.+)\|/i);
    const assignee = devMatch ? devMatch[1].trim() : null;

    const handoff = extractHandoffFields(sectionContent);
    tasks.push({
      code, title, storyPoints: sp,
      assignee, module: moduleName, parentCode: null,
      status: "todo", phase: null,
      contentMd: sectionContent,
      sourcePath: `${baseDir}/${filename}`,
      ...handoff,
    });
  }

  return tasks;
}

function parsePhaseTaskFile(content: string, filename: string, phase: string, baseDir: string = "output/task"): ParsedTask[] {
  const tasks: ParsedTask[] = [];
  const lines = content.split("\n");
  const sourcePath = `${baseDir}/${phase}/${filename}`;

  const header = lines[0] || "";
  const headerMatch = header.match(/^#\s+(\S+)\s*[|]\s*(.+)/);
  const parentCode = headerMatch ? headerMatch[1].trim() : filename.replace(/\.md$/, "");
  const parentTitle = headerMatch ? headerMatch[2].trim() : "";

  let sp = null;
  const spByRole: Record<string, number> = {};
  const assigneeByRole: Record<string, string> = {};
  const assigneeOrder: string[] = [];
  const seenAssignees = new Set<string>();
  const addAssignee = (role: string, v: string) => {
    const name = v.trim();
    if (!name || assigneeByRole[role]) return;
    assigneeByRole[role] = name;
    if (!seenAssignees.has(name)) { seenAssignees.add(name); assigneeOrder.push(name); }
  };
  const normalizeRole = (role: string) => {
    const map: Record<string, string> = { BE: "BE", BACKEND: "BE", FE: "FE", FRONTEND: "FE", DB: "DB", IN: "IN", INT: "IN", CRM: "CRM", DO: "DO", DEVOPS: "DO", QC: "QC" };
    return map[role.toUpperCase().trim()] ?? role.toUpperCase().trim();
  };
  for (let i = 1; i < Math.min(10, lines.length); i++) {
    const l = lines[i];
    const spMatch = l.match(/\*\*SP:\*\*\s*([\d.]+)/);
    if (spMatch) sp = parseFloat(spMatch[1]);
    const breakdownMatch = l.match(/\*\*SP:\*\*[\s\S]*?\(([^)]*)\)/);
    if (breakdownMatch) {
      for (const part of breakdownMatch[1].split(",")) {
        const m = part.trim().match(/^([A-Za-z]+)\s+([\d.]+)$/);
        if (m) spByRole[normalizeRole(m[1])] = parseFloat(m[2]);
      }
    }
    const beMatch = l.match(/\*\*Assignee BE:\*\*\s*(.+)/);
    const feMatch = l.match(/\*\*Assignee FE:\*\*\s*(.+)/);
    const doMatch = l.match(/\*\*Assignee\s*DO:\*\*\s*(.+)/i);
    if (beMatch) addAssignee("BE", beMatch[1]);
    if (feMatch) addAssignee("FE", feMatch[1]);
    if (doMatch) addAssignee("DO", doMatch[1]);
  }

  // Role-specific assignee fallback for sub-tasks like "[BE]", "[FE]", "[DevOps]"
  const roleTagMap: Record<string, string> = { BE: "BE", FE: "FE", DB: "BE", IN: "BE", CRM: "BE", DO: "DO", QC: "QC" };

  // Store full file content for parent task
  const parentHandoff = extractHandoffFields(content);
  tasks.push({
    code: parentCode, title: parentTitle, storyPoints: sp,
    assignee: assigneeOrder.join(" + ") || null,
    module: parentCode.split("-")[0] || phase,
    parentCode: null, status: "todo", phase,
    contentMd: content,
    sourcePath,
    ...parentHandoff,
  });

  // Find sub-tasks with their content blocks
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const subMatch = line.match(/^###\s+(\S+)\s*[—–-]\s*(.+)/);
    if (subMatch) {
      const subCode = subMatch[1].trim();
      const subTitle = subMatch[2].trim();

      // Find SP and role tag in the following lines before next ### or ---
      let subSp0: number | null = null;
      let roleTag: string | null = null;
      const headingRole = subTitle.match(/\[(BE|FE|DB|IN|CRM|DO|QC|DevOps|Backend|Frontend|Integration|SRE)\]/i);
      if (headingRole) roleTag = normalizeRole(headingRole[1]);
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        if (lines[j].startsWith("### ") || lines[j].startsWith("---")) break;
        const spMatch = lines[j].match(/\*\*([\d.]+)\s*SP\*\*/);
        if (spMatch && subSp0 === null) subSp0 = parseFloat(spMatch[1]);
        if (!roleTag) {
          const roleMatch = lines[j].match(/\[(BE|FE|DB|IN|CRM|DO|QC|DevOps|Backend|Frontend|Integration|SRE)\]/i);
          if (roleMatch) roleTag = normalizeRole(roleMatch[1]);
        }
      }

      // Extract content from ### to next ### or --- or end
      let sectionEnd = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith("### ") || lines[j].startsWith("---")) { sectionEnd = j; break; }
      }
      const sectionContent = lines.slice(i, sectionEnd).join("\n");

      const assignee = roleTag
        ? (assigneeByRole[roleTagMap[roleTag]] ?? assigneeOrder[0] ?? null)
        : (assigneeOrder[0] ?? null);
      const subSp = roleTag ? (spByRole[roleTagMap[roleTag]] ?? subSp0 ?? null) : (spByRole[Object.keys(spByRole)[0]] ?? subSp0 ?? null);

      const handoff = extractHandoffFields(sectionContent);
      tasks.push({
        code: subCode, title: subTitle, storyPoints: subSp,
        assignee,
        module: parentCode.split("-")[0] || phase,
        parentCode, status: "todo", phase,
        contentMd: sectionContent,
        sourcePath,
        ...handoff,
      });
    }
  }

  return tasks;
}

function extractAssignee(text: string): string {
  const beMatch = text.match(/BE:\s*(\w+)/i);
  const feMatch = text.match(/FE:\s*(\w+)/i);
  const names = [beMatch?.[1], feMatch?.[1]].filter(Boolean);
  if (names.length > 0) return names.join(" + ");
  const cleaned = text
    .replace(/\s*[·•]\s*[\d.]+\s*SP.*$/i, "")
    .trim();
  return cleaned
    .split(/[+·]/)
    .map((n) => n.trim())
    .filter(Boolean)
    .join(" + ");
}

function roleToAssignee(role: string, parentAssignee: string | null): string {
  const roleMap: Record<string, string> = {
    BE: "Backend", FE: "Frontend", DB: "Database",
    IN: "Integration", CRM: "CRM BE", DO: "DevOps", QC: "QC",
  };
  if (parentAssignee) return parentAssignee;
  return roleMap[role] || role;
}

function extractHandoffFields(content: string): Pick<ParsedTask, "blocks" | "critical" | "risk" | "filesScope" | "specRef" | "erdRef" | "rtmRef" | "acceptanceCriteria"> {
  const getRow = (label: string): string | null => {
    const re = new RegExp(`\\|\\s*${label}\\s*\\|\\s*(.*?)\\s*\\|`, "i");
    const m = content.match(re);
    if (!m) return null;
    const v = m[1].trim();
    if (!v || v === "—" || v === "-" || v.toLowerCase() === "n/a") return null;
    return v;
  };
  const parseList = (raw: string | null): string[] => {
    if (!raw) return [];
    return raw.split(/[,;]/).map((s) => s.replace(/[`*_]/g, "").trim()).filter(Boolean);
  };
  const blocksRaw = getRow("Blocks");
  const blocks = parseList(blocksRaw);

  const criticalRaw = getRow("Critical Path") ?? getRow("Critical");
  const critical = criticalRaw ? /^(yes|true|ya|1)/i.test(criticalRaw.trim()) : false;

  const riskRaw = getRow("Risk Level") ?? getRow("Risk");
  const risk = riskRaw ? riskRaw.replace(/[`*_]/g, "").trim() : null;

  const filesScopeRaw = getRow("Files Scope");
  const filesScope = filesScopeRaw ? filesScopeRaw.split(/[,;]/).map((s) => s.replace(/[`]/g, "").trim()).filter(Boolean).flatMap((s) => s.split(/\s+/).filter(Boolean)) : [];

  const specRefRaw = getRow("Spec Ref");
  const specRef = specRefRaw ? specRefRaw.replace(/[`]/g, "").trim() : null;

  const erdRefRaw = getRow("ERD Ref");
  const erdRef = erdRefRaw ? erdRefRaw.replace(/[`]/g, "").trim() : null;

  const rtmRefRaw = getRow("RTM Ref");
  const rtmRef = rtmRefRaw ? rtmRefRaw.replace(/[`]/g, "").trim() : null;

  const acceptanceCriteria: string[] = [];
  const acStart = content.search(/###\s+Acceptance Criteria/i);
  if (acStart !== -1) {
    const acSlice = content.slice(acStart);
    const acEnd = acSlice.search(/\n###\s+/);
    const acBlock = acEnd !== -1 ? acSlice.slice(0, acEnd) : acSlice;
    for (const line of acBlock.split("\n")) {
      const m = line.match(/^\s*-\s*\[[ xX]\]\s*(.+)/);
      if (m) acceptanceCriteria.push(m[1].trim());
      else {
        const m2 = line.match(/^\s*-\s+(Given|When|Then).+/i);
        if (m2) acceptanceCriteria.push(line.replace(/^\s*-\s*/, "").trim());
      }
    }
  }

  return { blocks, critical, risk, filesScope, specRef, erdRef, rtmRef, acceptanceCriteria };
}
