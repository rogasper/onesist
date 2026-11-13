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

export function findMasterFile(rootPath: string, fileName: string): string | null {
  const candidates = [
    fileName,
    path.join("output", fileName),
    path.join("docs", fileName),
    path.join("output", "erd", fileName),
    path.join("output", "spec", fileName),
  ];
  for (const rel of candidates) {
    const full = path.join(rootPath, rel);
    if (fs.existsSync(full)) {
      try { return fs.readFileSync(full, "utf-8"); } catch { /* ignore */ }
    }
  }
  // Shallow scan depth 2 for case-insensitive match
  try {
    const search: (dir: string, depth: number) => string | null = (dir: string, depth: number): string | null => {
      if (depth > 2 || !fs.existsSync(dir)) return null;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name.toLowerCase() === fileName.toLowerCase()) {
          try { return fs.readFileSync(path.join(dir, entry.name), "utf-8"); } catch { return null; }
        }
        if (entry.isDirectory() && !entry.name.startsWith(".") && !IGNORED_DIRS.has(entry.name)) {
          const found: string | null = search(path.join(dir, entry.name), depth + 1);
          if (found) return found;
        }
      }
      return null;
    };
    const found = search(rootPath, 0);
    if (found) return found;
  } catch {}
  return null;
}

export function buildCombinedMissingPrompt(missing: string[], rootPath: string, proj: any): string {
  const name = proj?.name || "project";
  const version = proj?.docVersion || "1.0.0";
  const sections: string[] = [];
  if (missing.includes("MASTER_ERD.md")) {
    sections.push(`1. Jika MASTER_ERD.md hilang: baca semua \`output/erd/*.dbml\` + \`output/erd/*.md\` di \`${rootPath}\` → gabung jadi satu MASTER_ERD.md di root (format references/erd_format.md + references/master_artifacts.md, DBML + markdown tables, normalized, FK/index).`);
  }
  if (missing.includes("MASTER_SPEC_API.md")) {
    sections.push(`2. Jika MASTER_SPEC_API.md hilang: baca \`output/spec/*.md\` + MASTER_ERD.md (yang baru dibuat/existing) di \`${rootPath}\` → gabung jadi MASTER_SPEC_API.md di root (format references/spec_api_format.md, REST-ish, pagination/auth/error catalog references/api_conventions.md + error_catalog.md).`);
  }
  if (missing.includes("project_context.md")) {
    sections.push(`3. Jika project_context.md hilang: buat dari template references/project_context_template.md dengan metadata project="${name}", root="${rootPath}", version="${version}", description="${(proj?.description || "").slice(0, 120)}". Isi tech stack, naming, env. Tulis ke project_context.md di root.`);
  }
  const body = sections.join("\n\n");
  return `Kamu adalah Senior System Analyst. Gunakan skill fsd-analyzer.\nProject root: ${rootPath}\nFile yang hilang: ${missing.join(", ")} (tidak ada di root/output/docs)\n\nTugas: buat ${missing.length} file di root sekaligus:\n\n${body}\n\nTulis hanya file yang hilang, jangan ubah file lain. Gunakan Indonesian untuk deskripsi, English untuk technical terms.`;
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
    invalidateFileSearchIndex(rootPath);
    return true;
  } catch {
    return false;
  }
}

export function deleteFile(rootPath: string, relPath: string): boolean {
  try {
    fs.unlinkSync(path.join(rootPath, relPath));
    invalidateFileSearchIndex(rootPath);
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
    invalidateFileSearchIndex(rootPath);
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
    invalidateFileSearchIndex(rootPath);
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
    invalidateFileSearchIndex(rootPath);
    return dest;
  } catch {
    return null;
  }
}

export function ensureProjectStructure(rootPath: string): void {
  const dirs = [
    "input", "input/fsd", "input/figma", "input/assets",
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

export const IGNORED_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "vendor", "binaries", "target",
  ".gemini", ".cache", "coverage", ".next", ".turbo", ".venv", "venv",
  "__pycache__", "out", ".output", ".svelte-kit", ".nuxt", "Pods", ".idea",
]);

export const TEXT_EXTS = new Set([
  ".md", ".json", ".dbml", ".sql", ".html", ".txt", ".yaml", ".yml", ".ts", ".tsx", ".js", ".jsx", ".csv", ".excalidraw",
]);

export interface FileSearchOptions {
  signal?: AbortSignal;
  /** Invoked right before reading a file's contents from disk. */
  onFileRead?: (absPath: string) => void;
  /** Override cache TTL in ms (0 forces a fresh directory walk). */
  cacheTtlMs?: number;
}

interface IndexedProjectFile {
  name: string;
  nameLower: string;
  path: string;
  pathLower: string;
  abs: string;
  type: FileEntry["type"];
  ext: string;
  size: number;
  modifiedAt: number;
  searchableText: boolean;
}

interface RootIndexEntry {
  builtAt: number;
  entries: IndexedProjectFile[];
}

const MAX_CONTENT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_WALK_DEPTH = 32;
const SEARCH_INDEX_TTL_MS = 10_000;
const MAX_CACHED_ROOTS = 16;
const SEARCH_READ_CONCURRENCY = 16;
const SEARCH_STAT_CONCURRENCY = 32;
const SEARCH_DIR_BATCH = 16;
const SEARCH_YIELD_MS = 8;

const rootIndexCache = new Map<string, RootIndexEntry>();
const indexGeneration = new Map<string, number>();
const inflightIndexBuilds = new Map<string, Promise<IndexedProjectFile[]>>();

function normalizeRootKey(rootPath: string): string {
  return path.resolve(rootPath);
}

function getGeneration(key: string): number {
  return indexGeneration.get(key) ?? 0;
}

/**
 * Invalidate cached file-index metadata for one project root (or all roots).
 * Increments a generation token so any concurrent async walk finishing later
 * cannot re-populate the cache with a pre-mutation snapshot.
 */
export function invalidateFileSearchIndex(rootPath?: string): void {
  if (!rootPath) {
    for (const key of new Set([...rootIndexCache.keys(), ...inflightIndexBuilds.keys()])) {
      indexGeneration.set(key, getGeneration(key) + 1);
    }
    rootIndexCache.clear();
    return;
  }
  const key = normalizeRootKey(rootPath);
  indexGeneration.set(key, getGeneration(key) + 1);
  rootIndexCache.delete(key);
}

function getCachedIndex(key: string, ttlMs: number): IndexedProjectFile[] | null {
  if (ttlMs <= 0) return null;
  const cached = rootIndexCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.builtAt >= ttlMs) {
    rootIndexCache.delete(key);
    return null;
  }
  // Refresh insertion order for bounded LRU eviction.
  rootIndexCache.delete(key);
  rootIndexCache.set(key, cached);
  return cached.entries;
}

function storeCachedIndex(key: string, entries: IndexedProjectFile[], gen: number): void {
  if (getGeneration(key) !== gen) return;
  rootIndexCache.delete(key);
  if (rootIndexCache.size >= MAX_CACHED_ROOTS) {
    const oldestKey = rootIndexCache.keys().next().value;
    if (oldestKey !== undefined) rootIndexCache.delete(oldestKey);
  }
  rootIndexCache.set(key, { builtAt: Date.now(), entries });
}

function createIndexedFile(name: string, relDir: string, abs: string, stat: fs.Stats): IndexedProjectFile {
  const normRelPath = (relDir ? `${relDir}/${name}` : name).replace(/\\/g, "/");
  const ext = path.extname(name).toLowerCase();
  return {
    name,
    nameLower: name.toLowerCase(),
    path: normRelPath,
    pathLower: normRelPath.toLowerCase(),
    abs,
    type: detectRoute(normRelPath) as FileEntry["type"],
    ext,
    size: stat.size,
    modifiedAt: stat.mtimeMs,
    searchableText: TEXT_EXTS.has(ext) && stat.size <= MAX_CONTENT_FILE_BYTES,
  };
}

function sortIndexEntries(entries: IndexedProjectFile[]): IndexedProjectFile[] {
  // Pre-sorting by modifiedAt descending (with deterministic path tie-breaker) allows
  // empty-query lookups, tier buckets, and early-exit content scans to preserve top-N order
  // without re-sorting on every search.
  entries.sort((a, b) => b.modifiedAt - a.modifiedAt || a.path.localeCompare(b.path));
  return entries;
}

function shouldSkipDir(name: string, depth: number): boolean {
  if (name.startsWith(".") || name === ".env") return true;
  if (IGNORED_DIRS.has(name)) return true;
  return depth >= MAX_WALK_DEPTH;
}

function buildIndexSync(absRoot: string): IndexedProjectFile[] {
  let rootStat: fs.Stats;
  try {
    rootStat = fs.statSync(absRoot);
  } catch {
    return [];
  }
  if (!rootStat.isDirectory()) return [];

  const key = normalizeRootKey(absRoot);
  const gen = getGeneration(key);
  const entries: IndexedProjectFile[] = [];
  const stack: { dir: string; relDir: string; depth: number }[] = [{ dir: absRoot, relDir: "", depth: 0 }];

  while (stack.length > 0) {
    const { dir, relDir, depth } = stack.pop()!;
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of dirEntries) {
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipDir(entry.name, depth)) continue;
        stack.push({
          dir: abs,
          relDir: relDir ? `${relDir}/${entry.name}` : entry.name,
          depth: depth + 1,
        });
      } else if (entry.isFile()) {
        try {
          const stat = fs.statSync(abs);
          entries.push(createIndexedFile(entry.name, relDir, abs, stat));
        } catch {
          continue;
        }
      }
    }
  }

  sortIndexEntries(entries);
  storeCachedIndex(key, entries, gen);
  return entries;
}

function yieldEventLoop(): Promise<void> {
  return typeof setImmediate === "function"
    ? new Promise<void>((resolve) => setImmediate(resolve))
    : new Promise<void>((resolve) => setTimeout(resolve, 0));
}

async function buildIndexAsync(absRoot: string): Promise<IndexedProjectFile[]> {
  try {
    const rootStat = await fs.promises.stat(absRoot);
    if (!rootStat.isDirectory()) return [];
  } catch {
    return [];
  }

  const key = normalizeRootKey(absRoot);
  const existingBuild = inflightIndexBuilds.get(key);
  if (existingBuild) return existingBuild;

  const gen = getGeneration(key);
  const buildPromise = (async () => {
    const pendingFiles: { name: string; relDir: string; abs: string }[] = [];
    const dirs: { dir: string; relDir: string; depth: number }[] = [{ dir: absRoot, relDir: "", depth: 0 }];
    let lastYield = performance.now();

    while (dirs.length > 0) {
      const batch = dirs.splice(0, SEARCH_DIR_BATCH);
      const lists = await Promise.all(
        batch.map(async (d) => {
          try {
            return await fs.promises.readdir(d.dir, { withFileTypes: true });
          } catch {
            return [] as fs.Dirent[];
          }
        }),
      );
      for (let i = 0; i < batch.length; i++) {
        const parent = batch[i];
        for (const entry of lists[i]) {
          if (entry.name.startsWith(".") && entry.name !== ".env") continue;
          const abs = path.join(parent.dir, entry.name);
          if (entry.isDirectory()) {
            if (shouldSkipDir(entry.name, parent.depth)) continue;
            dirs.push({
              dir: abs,
              relDir: parent.relDir ? `${parent.relDir}/${entry.name}` : entry.name,
              depth: parent.depth + 1,
            });
          } else if (entry.isFile()) {
            pendingFiles.push({ name: entry.name, relDir: parent.relDir, abs });
          }
        }
      }
      if (performance.now() - lastYield >= SEARCH_YIELD_MS) {
        await yieldEventLoop();
        lastYield = performance.now();
      }
    }

    const entries: IndexedProjectFile[] = [];
    let nextIdx = 0;
    const workerCount = Math.min(SEARCH_STAT_CONCURRENCY, pendingFiles.length);
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const idx = nextIdx++;
          if (idx >= pendingFiles.length) return;
          const f = pendingFiles[idx];
          try {
            const stat = await fs.promises.stat(f.abs);
            entries.push(createIndexedFile(f.name, f.relDir, f.abs, stat));
          } catch {
            /* skip files removed mid-scan */
          }
          if (performance.now() - lastYield >= SEARCH_YIELD_MS) {
            lastYield = performance.now();
            await yieldEventLoop();
            lastYield = performance.now();
          }
        }
      }),
    );

    sortIndexEntries(entries);
    storeCachedIndex(key, entries, gen);
    return entries;
  })();

  inflightIndexBuilds.set(key, buildPromise);
  try {
    return await buildPromise;
  } finally {
    if (inflightIndexBuilds.get(key) === buildPromise) {
      inflightIndexBuilds.delete(key);
    }
  }
}

function getIndexSync(rootPath: string, ttlMs: number): IndexedProjectFile[] {
  const key = normalizeRootKey(rootPath);
  return getCachedIndex(key, ttlMs) ?? buildIndexSync(key);
}

async function getIndexAsync(rootPath: string, ttlMs: number): Promise<IndexedProjectFile[]> {
  const key = normalizeRootKey(rootPath);
  return getCachedIndex(key, ttlMs) ?? (await buildIndexAsync(key));
}

function toFilenameResult(entry: IndexedProjectFile): FileSearchResult {
  return {
    name: entry.name,
    path: entry.path,
    type: entry.type,
    ext: entry.ext,
    size: entry.size,
    modifiedAt: entry.modifiedAt,
    matchType: "filename",
  };
}

function toContentResult(entry: IndexedProjectFile, matches: FileContentMatch[]): FileSearchResult {
  return {
    name: entry.name,
    path: entry.path,
    type: entry.type,
    ext: entry.ext,
    size: entry.size,
    modifiedAt: entry.modifiedAt,
    matchType: "content",
    matches,
  };
}

function matchFilenames(entries: IndexedProjectFile[], qLower: string, cap: number): FileSearchResult[] {
  if (!qLower) {
    return entries.slice(0, cap).map(toFilenameResult);
  }

  // Bucket into the 4 priority tiers while iterating pre-sorted entries so
  // modifiedAt descending order is preserved within each tier without re-sorting.
  const tier4: IndexedProjectFile[] = [];
  const tier3: IndexedProjectFile[] = [];
  const tier2: IndexedProjectFile[] = [];
  const tier1: IndexedProjectFile[] = [];

  for (const entry of entries) {
    if (entry.nameLower === qLower) {
      if (tier4.length < cap) tier4.push(entry);
    } else if (entry.nameLower.startsWith(qLower)) {
      if (tier3.length < cap) tier3.push(entry);
    } else if (entry.nameLower.includes(qLower)) {
      if (tier2.length < cap) tier2.push(entry);
    } else if (entry.pathLower.includes(qLower)) {
      if (tier1.length < cap) tier1.push(entry);
    }
  }

  return [...tier4, ...tier3, ...tier2, ...tier1].slice(0, cap).map(toFilenameResult);
}

function selectContentCandidates(
  entries: IndexedProjectFile[],
  mode: "all" | "content",
  fileResults: FileSearchResult[],
): IndexedProjectFile[] {
  if (mode === "all" && fileResults.length > 0) {
    // Results whose path already matched by filename are deduped out in "all" mode,
    // so skip reading their contents from disk.
    const seenPaths = new Set(fileResults.map((r) => r.path));
    return entries.filter((e) => e.searchableText && !seenPaths.has(e.path));
  }
  return entries.filter((e) => e.searchableText);
}

function compileSearchRegex(query: string): RegExp {
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped, "i");
}

function extractLineMatches(content: string, re: RegExp, maxMatches = 3): FileContentMatch[] {
  const matches: FileContentMatch[] = [];
  const globalRe = new RegExp(re.source, "ig");
  let lineStart = 0;
  let lineNumber = 1;
  let countedTo = 0;

  while (matches.length < maxMatches) {
    const m = globalRe.exec(content);
    if (!m) break;
    const matchIdx = m.index;
    while (countedTo <= matchIdx) {
      const nl = content.indexOf("\n", countedTo);
      if (nl === -1 || nl >= matchIdx) {
        lineStart = countedTo;
        break;
      }
      lineNumber++;
      countedTo = nl + 1;
      lineStart = countedTo;
    }
    const nl = content.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? content.length : nl;
    const trimmedEnd = lineEnd > lineStart && content.charCodeAt(lineEnd - 1) === 13 ? lineEnd - 1 : lineEnd;
    matches.push({
      line: lineNumber,
      preview: content.slice(lineStart, trimmedEnd).trim().slice(0, 140),
    });
    if (nl === -1) break;
    countedTo = nl + 1;
    lineNumber++;
    globalRe.lastIndex = countedTo;
  }

  return matches;
}

/**
 * Search project files by filename and/or content (synchronous).
 *
 * Uses the per-root file index, skips content reads for filename matches in
 * `"all"` mode, and exits early once `limit` results are found in `modifiedAt`
 * descending order (so results 1..limit match the full scan, except ties on
 * identical mtimeMs which are deterministically ordered by path).
 */
export function searchProjectFiles(
  rootPath: string,
  rawQuery: string,
  mode: "all" | "filename" | "content" = "all",
  limit = 40,
  options?: FileSearchOptions,
): FileSearchResult[] {
  const cap = Math.max(0, Math.floor(limit));
  if (!rootPath || cap === 0) return [];

  const query = rawQuery.trim();
  const qLower = query.toLowerCase();
  const ttlMs = options?.cacheTtlMs ?? SEARCH_INDEX_TTL_MS;
  const entries = getIndexSync(rootPath, ttlMs);
  if (entries.length === 0) return [];

  if (!query) {
    return mode === "content" ? [] : matchFilenames(entries, "", cap);
  }

  const fileResults = mode === "content" ? [] : matchFilenames(entries, qLower, cap);
  if (mode === "filename" || (mode === "all" && fileResults.length >= cap)) {
    return fileResults;
  }

  if (/[\r\n]/.test(query)) return fileResults;

  const needed = mode === "content" ? cap : cap - fileResults.length;
  const candidates = selectContentCandidates(entries, mode, fileResults);
  if (candidates.length === 0) return fileResults;

  const re = compileSearchRegex(query);
  const contentResults: FileSearchResult[] = [];
  let sawMissingFile = false;

  for (const entry of candidates) {
    if (contentResults.length >= needed) break;
    try {
      options?.onFileRead?.(entry.abs);
      const content = fs.readFileSync(entry.abs, "utf-8");
      if (!re.test(content)) continue;
      const lineMatches = extractLineMatches(content, re, 3);
      if (lineMatches.length > 0) {
        contentResults.push(toContentResult(entry, lineMatches));
      }
    } catch {
      sawMissingFile = true;
    }
  }

  if (sawMissingFile) invalidateFileSearchIndex(rootPath);
  return mode === "content" ? contentResults : [...fileResults, ...contentResults].slice(0, cap);
}

/**
 * Non-blocking async variant of `searchProjectFiles` for HTTP routes and agent tools.
 * Builds the root index and reads candidate contents with bounded concurrency and
 * event-loop yields so large projects never stall the server.
 */
export async function searchProjectFilesAsync(
  rootPath: string,
  rawQuery: string,
  mode: "all" | "filename" | "content" = "all",
  limit = 40,
  options?: FileSearchOptions,
): Promise<FileSearchResult[]> {
  const cap = Math.max(0, Math.floor(limit));
  if (!rootPath || cap === 0 || options?.signal?.aborted) return [];

  const query = rawQuery.trim();
  const qLower = query.toLowerCase();
  const ttlMs = options?.cacheTtlMs ?? SEARCH_INDEX_TTL_MS;
  const entries = await getIndexAsync(rootPath, ttlMs);
  if (options?.signal?.aborted || entries.length === 0) return [];

  if (!query) {
    return mode === "content" ? [] : matchFilenames(entries, "", cap);
  }

  const fileResults = mode === "content" ? [] : matchFilenames(entries, qLower, cap);
  if (mode === "filename" || (mode === "all" && fileResults.length >= cap)) {
    return fileResults;
  }

  if (/[\r\n]/.test(query)) return fileResults;

  const needed = mode === "content" ? cap : cap - fileResults.length;
  const candidates = selectContentCandidates(entries, mode, fileResults);
  if (candidates.length === 0) return fileResults;

  const re = compileSearchRegex(query);
  const matched: { idx: number; entry: IndexedProjectFile; matches: FileContentMatch[] }[] = [];
  let nextIdx = 0;
  let cutoff = candidates.length;
  let sawMissingFile = false;
  let lastYield = performance.now();
  const workerCount = Math.min(SEARCH_READ_CONCURRENCY, candidates.length);
  const signal = options?.signal;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        if (signal?.aborted) return;
        const idx = nextIdx++;
        if (idx >= cutoff) return;
        const entry = candidates[idx];
        let content: string;
        try {
          options?.onFileRead?.(entry.abs);
          content = await fs.promises.readFile(entry.abs, "utf-8");
        } catch {
          sawMissingFile = true;
          continue;
        }
        if (signal?.aborted) return;
        if (performance.now() - lastYield >= SEARCH_YIELD_MS) {
          lastYield = performance.now();
          await yieldEventLoop();
          lastYield = performance.now();
          if (signal?.aborted) return;
        }
        if (!re.test(content)) continue;
        const lineMatches = extractLineMatches(content, re, 3);
        if (lineMatches.length > 0) {
          matched.push({ idx, entry, matches: lineMatches });
          if (matched.length >= needed) {
            matched.sort((a, b) => a.idx - b.idx);
            cutoff = Math.min(cutoff, matched[needed - 1].idx);
          }
        }
      }
    }),
  );

  if (sawMissingFile) invalidateFileSearchIndex(rootPath);
  if (signal?.aborted) return [];

  matched.sort((a, b) => a.idx - b.idx);
  const contentResults = matched.slice(0, needed).map((m) => toContentResult(m.entry, m.matches));
  return mode === "content" ? contentResults : [...fileResults, ...contentResults].slice(0, cap);
}

