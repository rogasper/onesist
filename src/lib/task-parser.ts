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
    // General: scan semua .md di root output/task (tidak hanya task_* prefix) —
    // AI via fsd-analyzer kadang tulis tanpa prefix atau pakai H1 # Task \[FE]:
    // Exclude README/index yang bukan task agar tidak noise di skippedFiles.
    const rootFiles = fs.readdirSync(taskRoot).filter((f) => f.endsWith(".md") && !f.startsWith(".") && f.toLowerCase() !== "readme.md" && f.toLowerCase() !== "index.md");
    // Prioritaskan file dengan prefix task_* agar dedupe stabil, tapi tetap parse sisanya
    rootFiles.sort((a, b) => {
      const aTask = /^tasks?_/i.test(a) || a === "task.md" || a === "MASTER_TASK.md" ? 0 : 1;
      const bTask = /^tasks?_/i.test(b) || b === "task.md" || b === "MASTER_TASK.md" ? 0 : 1;
      if (aTask !== bTask) return aTask - bTask;
      return a.localeCompare(b);
    });
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
  //   B2:"## Task [FE]: Title" — bracket role (escaped \[FE] dari AI) -> auto-number
  //   C: "## FE-1: Title"      — code-like ID without the "Task" keyword
  const headingPatterns = [
    /^##\s+Task\s+([A-Za-z0-9._-]+)\s*[:：—–-]\s*(.*)$/i,
    // Empty group 1 keeps the (id, title) layout consistent across patterns
    /^##\s+Task\s*[:：]\s*()(.+)$/i,
    /^##\s+Task\s*(?:\\?\[?[A-Za-z]+\]?\s*)?[:：]\s*()(.+)$/i,
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
    // Toleran terhadap "0.5 SP (2 jam)" — cukup capture angka setelah pipe
    const spMatch = sectionContent.match(/\|\s*Story Point\s*\|\s*([\d.]+)/i);
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

  // Fallback general: AI via fsd-analyzer sering tulis root task sebagai
  // H1 "# Task: ..." + sub-tasks H3 "### T1 — ..." (bukan H2 "## Task").
  // Kasus nyata: output/task/task_tracking_leads_skip_duplicate_000.md
  // punya "# Task: Skip Duplicate..." dan "### T1 — Edit duplicate check..."
  // yang mengandung Goals/Scope/AC/Flow Logic. Tanpa ini file jadi skipped.
  if (tasks.length === 0) {
    // Coba ekstrak H3 sub-tasks (T1, T2, ...) — yang diharapkan jadi card
    const fallbackTasks: ParsedTask[] = [];
    // File-level SP fallback (tabel ringkas di atas Action List) — toleran "0.5 SP (2 jam)"
    const fileSpMatch = content.match(/\|\s*Story Point\s*\|\s*([\d.]+)/i);
    const fileSp = fileSpMatch ? parseFloat(fileSpMatch[1]) : null;
    const fileDevMatch = content.match(/\|\s*Developer\s*\|\s*(.+)\|/i);
    let fileAssignee: string | null = fileDevMatch ? fileDevMatch[1].trim() : null;
    if (fileAssignee === "—" || fileAssignee === "-" || fileAssignee?.toLowerCase() === "n/a") fileAssignee = null;

    for (let i = 0; i < lines.length; i++) {
      const subMatch = lines[i].match(/^###\s+(\S+)\s*[—–-]\s*(.+)/);
      if (!subMatch) continue;
      const rawSubCode = subMatch[1].trim();
      const subTitle = subMatch[2].trim();
      if (!subTitle) continue;
      // Namespace dengan moduleName agar T1 di file berbeda tidak collision di dedupe byCode
      const prefix = rawSubCode.toLowerCase();
      const code = prefix.startsWith(`${moduleName.toLowerCase()}-`) || prefix.startsWith(`${moduleName.toLowerCase()}_`) || prefix.startsWith(`${moduleName.toLowerCase()}.`)
        ? rawSubCode
        : `${moduleName}-${rawSubCode}`;

      // Section dari H3 sampai H3/##/--- berikutnya atau EOF
      let sectionEnd = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].startsWith("### ") || lines[j].startsWith("## ") || lines[j].startsWith("---")) { sectionEnd = j; break; }
      }
      const sectionContent = lines.slice(i, sectionEnd).join("\n");

      // SP: prefer section table, else **N SP**, else file-level — toleran "0.5 SP (2 jam)"
      const spSectionMatch = sectionContent.match(/\|\s*Story Point\s*\|\s*([\d.]+)/i);
      const spStarMatch = sectionContent.match(/\*\*([\d.]+)\s*SP\*\*/);
      const sp = spSectionMatch ? parseFloat(spSectionMatch[1]) : (spStarMatch ? parseFloat(spStarMatch[1]) : (fileSp ?? null));

      const devSectionMatch = sectionContent.match(/\|\s*Developer\s*\|\s*(.+)\|/i);
      let assignee: string | null = devSectionMatch ? devSectionMatch[1].trim() : fileAssignee;
      if (assignee === "—" || assignee === "-" || assignee?.toLowerCase() === "n/a") assignee = fileAssignee;

      const handoff = extractHandoffFields(sectionContent);
      fallbackTasks.push({
        code, title: subTitle, storyPoints: sp !== null && !isNaN(sp) ? sp : null,
        assignee: assignee || null, module: moduleName, parentCode: null,
        status: "todo", phase: null,
        contentMd: sectionContent,
        sourcePath: `${baseDir}/${filename}`,
        ...handoff,
      });
    }
    if (fallbackTasks.length > 0) {
      tasks.push(...fallbackTasks);
    } else {
      // Single-task fallback: H1 "# Task: Title" tanpa Action List H3
      // Tolerant terhadap bracket role: "# Task \[FE]: Title" dan "# Task [BE]: Title"
      const h1Idx = lines.findIndex((l) => /^#\s+Task\b/i.test(l));
      if (h1Idx !== -1) {
        const h1 = lines[h1Idx];
        // Strip prefix "# Task", optional bracket role "[FE]" / "\[FE]", dan separator
        let title = h1.replace(/^#\s+Task\s*(?:\\?\[?[A-Za-z0-9._-]+\]?\s*)?[:：—–-]?\s*/i, "").trim();
        // Jika masih ada sisa bracket di depan (mis. "\[FE]:" tanpa spasi), bersihkan lagi
        if (/^(\\?\[?[A-Za-z]+\]?\s*[:：—–-]\s*)/.test(title)) {
          title = title.replace(/^\\?\[?[A-Za-z]+\]?\s*[:：—–-]?\s*/i, "").trim();
        }
        // RawId tidak dipakai untuk H1 single-task (code = moduleName), kecuali ada ID eksplisit setelah Task
        const rawIdMatch = h1.match(/^#\s+Task\s+([A-Za-z0-9._-]+)\s*[:：—–-]/i);
        const rawId = rawIdMatch ? rawIdMatch[1].trim() : "";
        if (title) {
          let code: string;
          if (!rawId) code = moduleName;
          else {
            const p = rawId.toLowerCase();
            code = p.startsWith(`${moduleName.toLowerCase()}-`) || p.startsWith(`${moduleName.toLowerCase()}_`) ? rawId : `${moduleName}-${rawId}`;
          }
          const sectionContent = lines.slice(h1Idx).join("\n");
          const spH1Match = sectionContent.match(/\|\s*Story Point\s*\|\s*([\d.]+)/i);
          const sp = spH1Match ? parseFloat(spH1Match[1]) : (fileSp ?? null);
          const devH1Match = sectionContent.match(/\|\s*Developer\s*\|\s*(.+)\|/i);
          let assignee: string | null = devH1Match ? devH1Match[1].trim() : fileAssignee;
          if (assignee === "—" || assignee === "-" || assignee?.toLowerCase() === "n/a") assignee = null;
          const handoff = extractHandoffFields(sectionContent);
          tasks.push({
            code, title, storyPoints: sp !== null && !isNaN(sp) ? sp : null,
            assignee: assignee || null, module: moduleName, parentCode: null,
            status: "todo", phase: null,
            contentMd: sectionContent,
            sourcePath: `${baseDir}/${filename}`,
            ...handoff,
          });
        }
      }
    }
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
  const acStart = content.search(/#{2,}\s+Acceptance Criteria/i);
  if (acStart !== -1) {
    const acSlice = content.slice(acStart);
    const acEnd = acSlice.search(/\n#{2,}\s+/);
    const acBlock = acEnd !== -1 ? acSlice.slice(0, acEnd) : acSlice;
    for (const line of acBlock.split("\n")) {
      const m = line.match(/^\s*[-*]\s*\[[ xX]\]\s*(.+)/);
      if (m) acceptanceCriteria.push(m[1].trim());
      else {
        const m2 = line.match(/^\s*[-*]\s+(Given|When|Then).+/i);
        if (m2) acceptanceCriteria.push(line.replace(/^\s*[-*]\s*/, "").trim());
      }
    }
  }

  return { blocks, critical, risk, filesScope, specRef, erdRef, rtmRef, acceptanceCriteria };
}
