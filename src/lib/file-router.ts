import fs from "node:fs";
import path from "node:path";

export interface FileEntry {
  name: string;
  path: string;
  type: "erd" | "spec" | "task" | "td" | "timeline" | "report" | "fsd" | "master" | "other";
  ext: string;
  size: number;
  modifiedAt: number;
}

const TYPE_PATTERNS: Record<string, RegExp[]> = {
  erd: [/\.dbml$/i, /output\/erd\/.*\.md$/i],
  spec: [/output\/.*spec_api_.*\.md$/i, /output\/spec\/.*\.md$/i],
  task: [/output\/task\/.*\.md$/i],
  td: [/output\/td\/.*\.md$/i],
  timeline: [/output\/timeline\.html$/i, /output\/timeline\/.*\.html$/i, /output\/.*(timeline|gantt|roadmap|schedule|sprint[-_]?plan).*\.html$/i],
  report: [/output\/reports\/.*\.md$/i],
  fsd: [/input\/fsd\/.*\.md$/i],
  master: [/^MASTER_.*\.md$/i],
};

export function detectRoute(filename: string): string {
  for (const [route, patterns] of Object.entries(TYPE_PATTERNS)) {
    for (const p of patterns) {
      if (p.test(filename)) return route;
    }
  }
  return "other";
}

export function scanDirectory(rootPath: string, subDir: string): FileEntry[] {
  const baseDir = path.join(rootPath, subDir);
  const files: FileEntry[] = [];
  const walk = (dir: string, relPrefix: string) => {
    try {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile()) {
          const fullPath = path.join(dir, entry.name);
          const stat = fs.statSync(fullPath);
          const relPath = relPrefix ? path.join(relPrefix, entry.name) : entry.name;
          files.push({
            name: entry.name,
            path: path.join(subDir, relPath),
            type: detectRoute(path.join(subDir, relPath)) as FileEntry["type"],
            ext: path.extname(entry.name).toLowerCase(),
            size: stat.size,
            modifiedAt: stat.mtimeMs,
          });
        } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
          walk(path.join(dir, entry.name), relPrefix ? path.join(relPrefix, entry.name) : entry.name);
        }
      }
    } catch {}
  };
  walk(baseDir, "");
  return files.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export function readFile(rootPath: string, relPath: string): string | null {
  try {
    return fs.readFileSync(path.join(rootPath, relPath), "utf-8");
  } catch {
    return null;
  }
}

export function getProjectRoot(): string {
  return path.resolve(process.cwd(), "..");
}

export function writeFile(rootPath: string, relPath: string, content: string): boolean {
  try {
    const fullPath = path.join(rootPath, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
    return true;
  } catch {
    return false;
  }
}

export function deleteFile(rootPath: string, relPath: string): boolean {
  try {
    fs.unlinkSync(path.join(rootPath, relPath));
    return true;
  } catch {
    return false;
  }
}

export function ensureProjectStructure(rootPath: string): void {
  const dirs = [
    "input", "input/fsd", "input/figma",
    "output", "output/spec", "output/erd", "output/task",
    "output/td", "output/timeline", "output/reports",
  ];
  for (const d of dirs) {
    try { fs.mkdirSync(path.join(rootPath, d), { recursive: true }); } catch {}
  }
}

export function getProjectSummary(rootPath: string): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const subDir of ["erd", "spec", "task", "td", "timeline", "reports"]) {
    const dir = path.join(rootPath, "output", subDir);
    try {
      if (fs.existsSync(dir)) summary[subDir] = fs.readdirSync(dir).filter((f) => !f.startsWith(".")).length;
    } catch {}
  }
  try {
    const inputDir = path.join(rootPath, "input", "fsd");
    if (fs.existsSync(inputDir)) summary["fsd"] = fs.readdirSync(inputDir).filter((f) => f.endsWith(".md") && f !== "README.md").length;
  } catch {}
  return summary;
}
