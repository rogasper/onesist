import fs from "node:fs";
import path from "node:path";

export interface FileEntry {
  name: string;
  path: string;
  type: "erd" | "spec" | "task" | "td" | "timeline" | "report" | "fsd" | "master" | "sketch" | "rtm" | "sit" | "other";
  ext: string;
  size: number;
  modifiedAt: number;
}

const TYPE_PATTERNS: Record<string, RegExp[]> = {
  erd: [/\.dbml$/i, /output\/erds?\/.*\.md$/i],
  spec: [/output\/.*spec_api_.*\.md$/i, /output\/specs?\/.*\.md$/i, /output\/specs?\/.*\.ya?ml$/i],
  task: [/output\/tasks?\/.*\.md$/i],
  td: [/output\/tds?\/.*\.md$/i],
  timeline: [/output\/timelines?\.html$/i, /output\/timelines?\/.*\.html$/i, /output\/.*(timeline|gantt|roadmap|schedule|sprint[-_]?plan).*\.html$/i],
  report: [/output\/reports?\/.*\.md$/i],
  fsd: [/inputs?\/fsds?\/.*\.md$/i],
  master: [/^MASTER_.*\.md$/i],
  sketch: [
    /output\/sketch(es)?\/.*\.(excalidraw|json|mmd|svg)$/i,
  ],
  rtm: [/output\/rtms?\/.*\.md$/i],
  sit: [/output\/sits?\/.*\.md$/i],
};

export function detectRoute(filename: string): string {
  const normalized = filename.replace(/\\/g, "/");
  for (const [route, patterns] of Object.entries(TYPE_PATTERNS)) {
    for (const p of patterns) {
      if (p.test(normalized)) return route;
    }
  }
  return "other";
}

/**
 * Returns singular and plural variants of a directory path
 * e.g. "output/task" -> ["output/task", "output/tasks"]
 *      "output/sketches" -> ["output/sketches", "output/sketch"]
 */
export function getPluralSingularVariants(subDir: string): string[] {
  const norm = subDir.replace(/\\/g, "/").replace(/\/+$/, "");
  const parts = norm.split("/");
  const last = parts[parts.length - 1];
  if (!last) return [norm];

  const variants = new Set<string>([norm]);

  const ALIAS_MAP: Record<string, string> = {
    task: "tasks",
    tasks: "task",
    sketch: "sketches",
    sketches: "sketch",
    spec: "specs",
    specs: "spec",
    erd: "erds",
    erds: "erd",
    report: "reports",
    reports: "report",
    doc: "docs",
    docs: "doc",
    timeline: "timelines",
    timelines: "timeline",
    fsd: "fsds",
    fsds: "fsd",
    rtm: "rtms",
    rtms: "rtm",
    sit: "sits",
    sits: "sit",
  };

  const lower = last.toLowerCase();
  if (ALIAS_MAP[lower]) {
    variants.add([...parts.slice(0, -1), ALIAS_MAP[lower]].join("/"));
  }

  if (lower.endsWith("es")) {
    variants.add([...parts.slice(0, -1), last.slice(0, -2)].join("/"));
  } else if (lower.endsWith("s")) {
    variants.add([...parts.slice(0, -1), last.slice(0, -1)].join("/"));
  } else {
    variants.add([...parts.slice(0, -1), `${last}s`].join("/"));
    variants.add([...parts.slice(0, -1), `${last}es`].join("/"));
  }

  return Array.from(variants);
}

export function scanDirectory(rootPath: string, subDir: string): FileEntry[] {
  const variants = getPluralSingularVariants(subDir);
  const filesMap = new Map<string, FileEntry>();

  for (const dirVariant of variants) {
    const baseDir = path.join(rootPath, dirVariant);
    if (!fs.existsSync(baseDir)) continue;

    const walk = (dir: string, relPrefix: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isFile()) {
            const fullPath = path.join(dir, entry.name);
            const stat = fs.statSync(fullPath);
            const relPath = relPrefix ? path.join(relPrefix, entry.name) : entry.name;
            const normPath = path.join(dirVariant, relPath).replace(/\\/g, "/");
            const existing = filesMap.get(normPath);
            if (!existing || stat.mtimeMs > existing.modifiedAt) {
              filesMap.set(normPath, {
                name: entry.name,
                path: normPath,
                type: detectRoute(normPath) as FileEntry["type"],
                ext: path.extname(entry.name).toLowerCase(),
                size: stat.size,
                modifiedAt: stat.mtimeMs,
              });
            }
          } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
            walk(path.join(dir, entry.name), relPrefix ? path.join(relPrefix, entry.name) : entry.name);
          }
        }
      } catch {}
    };

    walk(baseDir, "");
  }

  return Array.from(filesMap.values()).sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export function readFile(rootPath: string, relPath: string): string | null {
  const norm = relPath.replace(/\\/g, "/");
  const fullPath = path.join(rootPath, norm);
  if (fs.existsSync(fullPath)) {
    try {
      return fs.readFileSync(fullPath, "utf-8");
    } catch {
      return null;
    }
  }

  // Fallback to singular/plural parent directory variants if direct read fails
  const dirName = path.dirname(norm);
  const baseName = path.basename(norm);
  if (dirName && dirName !== ".") {
    const dirVariants = getPluralSingularVariants(dirName);
    for (const d of dirVariants) {
      const altPath = path.join(rootPath, d, baseName);
      if (fs.existsSync(altPath)) {
        try {
          return fs.readFileSync(altPath, "utf-8");
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

export function getProjectRoot(): string {
  return process.env.SA_ROOT
    ? path.resolve(process.env.SA_ROOT)
    : path.resolve(process.cwd(), "..");
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

export function renameFile(rootPath: string, relPath: string, newName: string): boolean {
  try {
    const fullPath = path.join(rootPath, relPath);
    if (!fs.existsSync(fullPath)) return false;
    const newPath = path.join(path.dirname(fullPath), newName);
    if (fs.existsSync(newPath)) return false;
    fs.renameSync(fullPath, newPath);
    return true;
  } catch {
    return false;
  }
}

export function uniquePath(rootPath: string, relPath: string): string {
  const fullPath = path.join(rootPath, relPath);
  if (!fs.existsSync(fullPath)) return relPath;
  const ext = path.extname(relPath);
  const base = ext ? relPath.slice(0, -ext.length) : relPath;
  let i = 1;
  let candidate = `${base} (copy)${ext}`;
  while (fs.existsSync(path.join(rootPath, candidate))) {
    candidate = `${base} (copy ${i})${ext}`;
    i++;
  }
  return candidate;
}

export function copyFile(rootPath: string, source: string, destinationDir: string): string | null {
  try {
    const srcPath = path.join(rootPath, source);
    if (!fs.existsSync(srcPath)) return null;
    const dest = uniquePath(rootPath, path.join(destinationDir, path.basename(source)));
    fs.mkdirSync(path.dirname(path.join(rootPath, dest)), { recursive: true });
    fs.copyFileSync(srcPath, path.join(rootPath, dest));
    return dest;
  } catch {
    return null;
  }
}

export function moveFile(rootPath: string, source: string, destinationDir: string): string | null {
  try {
    const srcPath = path.join(rootPath, source);
    if (!fs.existsSync(srcPath)) return null;
    const dest = uniquePath(rootPath, path.join(destinationDir, path.basename(source)));
    fs.mkdirSync(path.dirname(path.join(rootPath, dest)), { recursive: true });
    fs.renameSync(srcPath, path.join(rootPath, dest));
    return dest;
  } catch {
    return null;
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
  for (const subDir of ["erd", "spec", "task", "td", "timeline", "reports", "sketch", "rtm", "sit"]) {
    const variants = getPluralSingularVariants(`output/${subDir}`);
    let count = 0;
    const seen = new Set<string>();
    for (const v of variants) {
      const dir = path.join(rootPath, v);
      try {
        if (fs.existsSync(dir)) {
          for (const f of fs.readdirSync(dir)) {
            if (!f.startsWith(".") && !seen.has(f)) {
              seen.add(f);
              count++;
            }
          }
        }
      } catch {}
    }
    summary[subDir] = count;
  }
  try {
    const fsdVariants = getPluralSingularVariants("input/fsd");
    let mdCount = 0;
    const seenFsd = new Set<string>();
    for (const v of fsdVariants) {
      const inputDir = path.join(rootPath, v);
      if (fs.existsSync(inputDir)) {
        const walk = (dir: string) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
              walk(path.join(dir, entry.name));
            } else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md" && !seenFsd.has(entry.name)) {
              seenFsd.add(entry.name);
              mdCount++;
            }
          }
        };
        walk(inputDir);
      }
    }
    summary["fsd"] = mdCount;
  } catch {}
  return summary;
}

export interface FileContentMatch {
  line: number;
  preview: string;
}

export interface FileSearchResult {
  name: string;
  path: string;
  type: FileEntry["type"];
  ext: string;
  size: number;
  modifiedAt: number;
  matchType: "filename" | "content";
  matches?: FileContentMatch[];
}

const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "binaries", "target", ".gemini", ".cache", "coverage", ".next", ".turbo",
]);

const TEXT_EXTS = new Set([
  ".md", ".json", ".dbml", ".sql", ".html", ".txt", ".yaml", ".yml", ".ts", ".tsx", ".js", ".jsx", ".csv", ".excalidraw",
]);

export function searchProjectFiles(
  rootPath: string,
  rawQuery: string,
  mode: "all" | "filename" | "content" = "all",
  limit = 40
): FileSearchResult[] {
  if (!fs.existsSync(rootPath)) return [];

  const query = rawQuery.trim();
  const qLower = query.toLowerCase();

  const fileResults: FileSearchResult[] = [];
  const contentResults: FileSearchResult[] = [];

  const walk = (dir: string, relDir: string) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name), relDir ? `${relDir}/${entry.name}` : entry.name);
      } else if (entry.isFile()) {
        const normRelPath = (relDir ? `${relDir}/${entry.name}` : entry.name).replace(/\\/g, "/");
        const ext = path.extname(entry.name).toLowerCase();
        let stat: fs.Stats;
        try {
          stat = fs.statSync(path.join(dir, entry.name));
        } catch {
          continue;
        }

        const type = detectRoute(normRelPath) as FileEntry["type"];
        const nameLower = entry.name.toLowerCase();
        const pathLower = normRelPath.toLowerCase();

        // 1. Filename match
        let isNameMatch = false;
        if (!query) {
          isNameMatch = true;
        } else if (nameLower.includes(qLower) || pathLower.includes(qLower)) {
          isNameMatch = true;
        }

        if (isNameMatch && (mode === "all" || mode === "filename")) {
          fileResults.push({
            name: entry.name,
            path: normRelPath,
            type,
            ext,
            size: stat.size,
            modifiedAt: stat.mtimeMs,
            matchType: "filename",
          });
        }

        // 2. Content match (only if query is non-empty, file is text, and size <= 2MB)
        if (query && (mode === "all" || mode === "content") && TEXT_EXTS.has(ext) && stat.size <= 2 * 1024 * 1024) {
          try {
            const content = fs.readFileSync(path.join(dir, entry.name), "utf-8");
            if (content.toLowerCase().includes(qLower)) {
              const lines = content.split(/\r?\n/);
              const matches: FileContentMatch[] = [];
              for (let i = 0; i < lines.length && matches.length < 3; i++) {
                const lineContent = lines[i];
                if (lineContent.toLowerCase().includes(qLower)) {
                  matches.push({
                    line: i + 1,
                    preview: lineContent.trim().slice(0, 140),
                  });
                }
              }
              if (matches.length > 0) {
                contentResults.push({
                  name: entry.name,
                  path: normRelPath,
                  type,
                  ext,
                  size: stat.size,
                  modifiedAt: stat.mtimeMs,
                  matchType: "content",
                  matches,
                });
              }
            }
          } catch {}
        }
      }
    }
  };

  walk(rootPath, "");

  // Sort filename results: exact match > name start > name contains > path contains
  if (query) {
    fileResults.sort((a, b) => {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aExact = aName === qLower ? 4 : aName.startsWith(qLower) ? 3 : aName.includes(qLower) ? 2 : 1;
      const bExact = bName === qLower ? 4 : bName.startsWith(qLower) ? 3 : bName.includes(qLower) ? 2 : 1;
      if (bExact !== aExact) return bExact - aExact;
      return b.modifiedAt - a.modifiedAt;
    });
  } else {
    fileResults.sort((a, b) => b.modifiedAt - a.modifiedAt);
  }

  contentResults.sort((a, b) => b.modifiedAt - a.modifiedAt);

  if (mode === "filename") {
    return fileResults.slice(0, limit);
  }
  if (mode === "content") {
    return contentResults.slice(0, limit);
  }

  // mode === "all": merge filename results first, then content results (deduplicating if same path and already in top results)
  const combined: FileSearchResult[] = [...fileResults];
  const seenPaths = new Set(combined.map((r) => r.path));
  for (const c of contentResults) {
    if (!seenPaths.has(c.path)) {
      combined.push(c);
      seenPaths.add(c.path);
    }
  }

  return combined.slice(0, limit);
}

