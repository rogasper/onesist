import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import JSZip from "jszip";
import { eq, inArray, sql } from "drizzle-orm";
import {
  apiEndpoints,
  apiSnapshots,
  apiSpecs,
  businessRequirements,
  changeLog,
  chatMessages,
  chatThreadFiles,
  chatThreadReads,
  chatThreads,
  designSolutions,
  erdSnapshots,
  erds,
  fsdSessions,
  functionalRequirements,
  projectExecSettings,
  projects,
  rtmLinks,
  taskSnapshots,
  tasks,
  testCases,
  wikiPages,
  wikiSnapshots,
} from "~/server/db/schema";

export const PROJECT_BUNDLE_FORMAT = 1;
export const MAX_BUNDLE_BYTES = 500 * 1024 * 1024;
const MAX_JSON_BYTES = 50 * 1024 * 1024;

const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "target",
  "coverage",
  ".cache",
  ".turbo",
  ".output",
]);

const EXCLUDED_FILES = new Set([".DS_Store", "Thumbs.db"]);

const EXCLUDED_PATTERNS = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  "target/",
  "coverage/",
  ".cache/",
  ".turbo/",
  ".output/",
  ".env",
  ".env.*",
  "*.db",
  "*.db-wal",
  "*.db-shm",
  "*.log",
  ".DS_Store",
  "Thumbs.db",
];

interface ProjectFile {
  rel: string;
  abs: string;
  size: number;
}

interface ProjectBundleManifest {
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  project: { name: string; company: string | null; description: string | null; createdAt: string | null };
  included: { files: boolean; artifacts: string[]; execution: boolean; chat: boolean };
  chatMode: "compact" | null;
  excluded: string[];
  counts: Record<string, number>;
}

interface ChatBundle {
  threads: Row[];
  messages: Row[];
  threadFiles: Row[];
  threadReads: Row[];
}

export interface ExportProgress {
  bytesDone: number;
  bytesTotal: number;
  filesDone: number;
  filesTotal: number;
}

export interface ProjectBundleOptions {
  includeChat?: boolean;
  /** Called while a streamed export reads its files (throttled). */
  progress?: (progress: ExportProgress) => void;
}

type Db = any;
type Row = Record<string, any>;

function isExcludedFile(name: string): boolean {
  if (EXCLUDED_FILES.has(name)) return true;
  if (name === ".env" || name.startsWith(".env.")) return true;
  if (/\.(db|db-wal|db-shm|log)$/i.test(name)) return true;
  return false;
}

export function collectProjectFiles(rootPath: string | null): ProjectFile[] {
  if (!rootPath) return [];
  const root = path.resolve(rootPath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(root);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) return [];

  const out: ProjectFile[] = [];
  const walk = (dir: string, relDir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const rel = relDir ? `${relDir}/${name}` : name;
      const lstat = fs.lstatSync(abs);
      if (lstat.isSymbolicLink()) continue;
      if (lstat.isDirectory()) {
        if (EXCLUDED_DIRS.has(name)) continue;
        walk(abs, rel);
      } else if (lstat.isFile()) {
        if (isExcludedFile(name)) continue;
        out.push({ rel, abs, size: lstat.size });
      }
    }
  };
  walk(root, "");
  return out;
}

function safeRelative(name: string): string {
  const normalized = name.replace(/\\/g, "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`Path tidak valid di dalam ZIP: ${name}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".." || part.includes("\0"))) {
    throw new Error(`Path berbahaya di dalam ZIP: ${name}`);
  }
  return parts.join(path.sep);
}

function rowsOf(artifacts: Record<string, unknown>, key: string): Row[] {
  const value = artifacts[key];
  return Array.isArray(value) ? value.filter((row): row is Row => !!row && typeof row === "object") : [];
}

function idMap(rows: Row[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (typeof row.id === "string" && row.id) map.set(row.id, crypto.randomUUID());
  }
  return map;
}

function withMappedId(rows: Row[], map: Map<string, string>): Row[] {
  return rows.filter((row) => typeof row.id === "string" && map.has(row.id)).map((row) => ({ ...row, id: map.get(row.id) }));
}

function uniqueProjectName(db: Db, wanted: string): string {
  const names = new Set(db.select({ name: projects.name }).from(projects).all().map((row: Row) => String(row.name)));
  let name = wanted || "Imported project";
  if (!names.has(name)) return name;
  name = `${name} (imported)`;
  let n = 2;
  while (names.has(name)) {
    name = `${wanted || "Imported project"} (imported ${n})`;
    n += 1;
  }
  return name;
}

function sanitizeProject(project: Row): Row {
  const copy = { ...project };
  delete copy.id;
  delete copy.rootPath;
  delete copy.skillsStatus;
  delete copy.skillsError;
  delete copy.skillsUpdatedAt;
  return copy;
}

function compactChatParts(contentJson: string | null): string | null {
  if (!contentJson) return null;
  let parts: unknown;
  try {
    parts = JSON.parse(contentJson);
  } catch {
    return null;
  }
  if (!Array.isArray(parts)) return null;
  const kept: Row[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    const value = part as Row;
    if (value.type === "text" && typeof value.text === "string") {
      kept.push(value);
      continue;
    }
    if (value.type === "file" && typeof value.path === "string" && value.path) {
      const rest = { ...value };
      delete rest.url;
      kept.push(rest);
    }
  }
  return kept.length ? JSON.stringify(kept) : null;
}

function chatText(contentJson: string | null): string {
  if (!contentJson) return "";
  try {
    const parts = JSON.parse(contentJson);
    if (!Array.isArray(parts)) return "";
    return parts
      .filter((part: Row) => part?.type === "text" && typeof part.text === "string")
      .map((part: Row) => String(part.text))
      .join("\n")
      .trim();
  } catch {
    return "";
  }
}

function rewriteUploads(value: string | null, oldThreadId: string, newThreadId: string): string | null {
  if (!value) return value;
  return value.split(`input/uploads/${oldThreadId}/`).join(`input/uploads/${newThreadId}/`);
}

interface PreparedBundle {
  zip: JSZip;
  files: ProjectFile[];
  totalFileBytes: number;
  projectId: string;
  startedAt: number;
}

function bundlePath(file: ProjectFile): string {
  return `project/${file.rel.replace(/\\/g, "/")}`;
}

/** Everything up to (and including) the JSON entries; the project files follow. */
async function prepareProjectBundle(
  db: Db,
  projectId: string,
  options: ProjectBundleOptions = {},
): Promise<PreparedBundle> {
  const startedAt = Date.now();
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get() as Row | undefined;
  if (!project) throw new Error("Project tidak ditemukan");

  const erdsRows = db.select().from(erds).where(eq(erds.projectId, projectId)).all() as Row[];
  const specRows = db.select().from(apiSpecs).where(eq(apiSpecs.projectId, projectId)).all() as Row[];
  const pageRows = db.select().from(wikiPages).where(eq(wikiPages.projectId, projectId)).all() as Row[];
  const taskRows = db.select().from(tasks).where(eq(tasks.projectId, projectId)).all() as Row[];

  const erdIds = erdsRows.map((row) => row.id).filter(Boolean);
  const specIds = specRows.map((row) => row.id).filter(Boolean);
  const pageIds = pageRows.map((row) => row.id).filter(Boolean);
  const taskIds = taskRows.map((row) => row.id).filter(Boolean);

  const artifacts = {
    erds: erdsRows,
    erdSnapshots: erdIds.length ? db.select().from(erdSnapshots).where(inArray(erdSnapshots.erdId, erdIds)).all() : [],
    apiSpecs: specRows,
    apiSnapshots: specIds.length ? db.select().from(apiSnapshots).where(inArray(apiSnapshots.specId, specIds)).all() : [],
    apiEndpoints: specIds.length ? db.select().from(apiEndpoints).where(inArray(apiEndpoints.specId, specIds)).all() : [],
    wikiPages: pageRows,
    wikiSnapshots: pageIds.length ? db.select().from(wikiSnapshots).where(inArray(wikiSnapshots.pageId, pageIds)).all() : [],
    tasks: taskRows,
    taskSnapshots: taskIds.length ? db.select().from(taskSnapshots).where(inArray(taskSnapshots.taskId, taskIds)).all() : [],
    fsdSessions: db.select().from(fsdSessions).where(eq(fsdSessions.projectId, projectId)).all(),
    businessRequirements: db.select().from(businessRequirements).where(eq(businessRequirements.projectId, projectId)).all(),
    functionalRequirements: db.select().from(functionalRequirements).where(eq(functionalRequirements.projectId, projectId)).all(),
    designSolutions: db.select().from(designSolutions).where(eq(designSolutions.projectId, projectId)).all(),
    testCases: db.select().from(testCases).where(eq(testCases.projectId, projectId)).all(),
    rtmLinks: db.select().from(rtmLinks).where(eq(rtmLinks.projectId, projectId)).all(),
    changeLog: db.select().from(changeLog).where(eq(changeLog.projectId, projectId)).all(),
  };

  const settings = db.select().from(projectExecSettings).where(eq(projectExecSettings.projectId, projectId)).get() ?? null;
  const includeChat = options.includeChat === true;
  let chat: ChatBundle | null = null;
  if (includeChat) {
    const threadRows = db.select().from(chatThreads).where(eq(chatThreads.projectId, projectId)).all() as Row[];
    const threadIds = threadRows.map((row) => row.id).filter(Boolean);
    const rawMessages = threadIds.length
      ? (db.select().from(chatMessages).where(inArray(chatMessages.threadId, threadIds)).all() as Row[])
      : [];
    const messages: Row[] = rawMessages
      .filter((row) => (row.role === "user" || row.role === "assistant") && row.kind !== "compactNotice")
      .map((row): Row | null => {
        const compact = compactChatParts(row.contentJson);
        if (!compact) return null;
        return { ...row, contentJson: compact, toolCallsJson: null, toolCallId: null, kind: null };
      })
      .filter((row): row is Row => row !== null);
    const threadFiles = threadIds.length
      ? (db.select().from(chatThreadFiles).where(inArray(chatThreadFiles.threadId, threadIds)).all() as Row[])
      : [];
    const threadReads = threadIds.length
      ? (db.select().from(chatThreadReads).where(inArray(chatThreadReads.threadId, threadIds)).all() as Row[])
      : [];
    chat = {
      threads: threadRows.map((row) => {
        const copy = { ...row };
        delete copy.cliSessionId;
        delete copy.providerId;
        delete copy.model;
        delete copy.modelOptionsJson;
        delete copy.workspaceStrategy;
        delete copy.workspaceRepo;
        delete copy.workspacePath;
        delete copy.workspaceBranch;
        delete copy.queuePaused;
        return copy;
      }),
      messages,
      threadFiles: threadFiles.map((row) => {
        const copy = { ...row };
        delete copy.diffJson;
        return copy;
      }),
      threadReads,
    };
  }
  const files = collectProjectFiles(project.rootPath);
  const totalFileBytes = files.reduce((sum, file) => sum + file.size, 0);
  if (totalFileBytes > MAX_BUNDLE_BYTES) {
    throw new Error("Ukuran file project melebihi batas 500 MB");
  }

  const counts: Record<string, number> = {};
  for (const [key, rows] of Object.entries(artifacts)) counts[key] = (rows as Row[]).length;
  if (chat) {
    counts.chatThreads = chat.threads.length;
    counts.chatMessages = chat.messages.length;
    counts.chatThreadFiles = chat.threadFiles.length;
    counts.chatThreadReads = chat.threadReads.length;
  }

  const manifest: ProjectBundleManifest = {
    formatVersion: PROJECT_BUNDLE_FORMAT,
    appVersion: process.env.npm_package_version ?? "",
    exportedAt: new Date().toISOString(),
    project: {
      name: String(project.name ?? ""),
      company: project.company ?? null,
      description: project.description ?? null,
      createdAt: project.createdAt ?? null,
    },
    included: {
      files: files.length > 0,
      artifacts: Object.keys(artifacts),
      execution: !!settings,
      chat: includeChat,
    },
    chatMode: includeChat ? "compact" : null,
    excluded: EXCLUDED_PATTERNS,
    counts,
  };

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("data/project.json", JSON.stringify({ project: sanitizeProject(project) }, null, 2));
  zip.file("data/artifacts.json", JSON.stringify(artifacts, null, 2));
  zip.file("data/execution.json", JSON.stringify({ settings }, null, 2));
  if (chat) zip.file("data/chat.json", JSON.stringify(chat, null, 2));
  return { zip, files, totalFileBytes, projectId, startedAt };
}

/**
 * Buffered export (tests, small callers): the whole ZIP is returned as one
 * buffer. For the download route use `exportProjectBundleStream` — a project
 * near the 500 MB cap needed ~5× its size in RSS this way, which is what made
 * the sidecar's memory watchdog kill the process mid-export.
 */
export async function exportProjectBundle(
  db: Db,
  projectId: string,
  options: ProjectBundleOptions = {},
): Promise<ArrayBuffer> {
  const prepared = await prepareProjectBundle(db, projectId, options);
  for (const file of prepared.files) {
    // Async reads yield between files: a synchronous loop over thousands of
    // files blocked the event loop for the whole export, starving the SSE
    // heartbeat so the stream looked dead while the ZIP was being built.
    prepared.zip.file(bundlePath(file), await fs.promises.readFile(file.abs));
  }
  const bytes = await prepared.zip.generateAsync({
    type: "arraybuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  console.log(
    `[export] project bundle id=${projectId} files=${prepared.files.length} source=${prepared.totalFileBytes} zip=${bytes.byteLength} bytes in ${Date.now() - prepared.startedAt}ms`,
  );
  return bytes;
}

/**
 * Streaming export for the HTTP route: each project file is piped straight from
 * disk into the compressor, and compressed bytes go to the response as they are
 * produced. Memory stays flat (one file at a time) instead of holding every
 * source buffer plus the finished ZIP, and the client sees the first bytes
 * immediately — a long silent build is what a runtime idle timeout can cut.
 *
 * Files are entries of the ZIP only, never touched by `generateAsync`, so the
 * stream is generated exactly once. A read failure mid-stream is logged; the
 * response has already started, so it can only end truncated — the client is
 * told to retry by the failed download in that rare case.
 */
export async function exportProjectBundleStream(
  db: Db,
  projectId: string,
  options: ProjectBundleOptions = {},
): Promise<{ stream: ReadableStream<Uint8Array>; fileCount: number; sourceBytes: number }> {
  const prepared = await prepareProjectBundle(db, projectId, options);
  const counters = { bytesDone: 0, filesDone: 0 };
  let lastProgressAt = 0;
  const report = (force = false) => {
    if (!options.progress) return;
    const now = Date.now();
    // ~150 ms keeps the event volume low (a 5 000-file export would otherwise
    // emit thousands of events) while the bar still moves visibly.
    if (!force && now - lastProgressAt < 150) return;
    lastProgressAt = now;
    options.progress({
      bytesDone: counters.bytesDone,
      bytesTotal: prepared.totalFileBytes,
      filesDone: counters.filesDone,
      filesTotal: prepared.files.length,
    });
  };
  report(true); // 0% with the real totals, so the UI can show them immediately
  for (const file of prepared.files) {
    prepared.zip.file(bundlePath(file), countedStream(file.abs, counters, report));
  }
  const nodeStream = prepared.zip.generateNodeStream({
    type: "nodebuffer",
    streamFiles: true,
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  nodeStream.once("error", (error) => {
    console.error(
      `[export] project bundle stream failed id=${projectId} after ${Date.now() - prepared.startedAt}ms: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });
  nodeStream.once("end", () => {
    report(true); // 100% — every file was read
    console.log(
      `[export] project bundle stream done id=${projectId} files=${prepared.files.length} source=${prepared.totalFileBytes} in ${Date.now() - prepared.startedAt}ms`,
    );
  });
  return {
    stream: Readable.toWeb(nodeStream) as unknown as ReadableStream<Uint8Array>,
    fileCount: prepared.files.length,
    sourceBytes: prepared.totalFileBytes,
  };
}

/**
 * One project file as a counting stream: the bytes JSZip pulls all pass through
 * here, which is what makes the progress bar reflect real work. The counter is a
 * Transform, not a `data` listener — attaching one would start the source
 * flowing before JSZip reads it and could drop data.
 */
function countedStream(
  abs: string,
  counters: { bytesDone: number; filesDone: number },
  report: () => void,
): Readable {
  const source = fs.createReadStream(abs);
  const counter = new Transform({
    transform(chunk, _encoding, done) {
      counters.bytesDone += chunk.length;
      report();
      done(null, chunk);
    },
    flush(done) {
      counters.filesDone += 1;
      report();
      done();
    },
  });
  source.on("error", (error) => counter.destroy(error));
  source.pipe(counter);
  return counter;
}

function remapEntityId(entityType: string, entityId: string, maps: Record<string, Map<string, string>>, newProjectId: string): string {
  if (entityType === "project") return newProjectId;
  const map = maps[entityType] ?? maps[entityType.replace(/_page$/, "")] ?? null;
  return map?.get(entityId) ?? entityId;
}

function insertRows(tx: Db, table: unknown, rows: Row[]): void {
  if (!rows.length) return;
  for (let i = 0; i < rows.length; i += 100) {
    tx.insert(table).values(rows.slice(i, i + 100)).run();
  }
}

export async function importProjectBundle(
  db: Db,
  bytes: Uint8Array,
  destPath: string,
): Promise<{ projectId: string; rootPath: string; name: string }> {
  if (bytes.length > MAX_BUNDLE_BYTES) throw new Error("Ukuran ZIP melebihi batas 500 MB");
  if (!destPath || !path.isAbsolute(destPath)) throw new Error("Folder tujuan harus berupa path absolut");

  const root = path.resolve(destPath);
  if (root === path.parse(root).root) throw new Error("Folder tujuan tidak boleh root filesystem");
  if (fs.existsSync(root)) {
    if (!fs.statSync(root).isDirectory()) throw new Error("Folder tujuan bukan folder");
    if (fs.readdirSync(root).length > 0) throw new Error("Folder tujuan harus kosong");
  }
  const sameRoot = db.select().from(projects).all().find((row: Row) => row.rootPath && path.resolve(row.rootPath) === root);
  if (sameRoot) throw new Error("Folder ini sudah terdaftar sebagai project");

  const zip = await JSZip.loadAsync(bytes);
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("manifest.json tidak ditemukan di ZIP");
  const manifestText = await manifestEntry.async("string");
  if (manifestText.length > MAX_JSON_BYTES) throw new Error("manifest.json terlalu besar");
  let manifest: ProjectBundleManifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new Error("manifest.json tidak valid");
  }
  if (manifest.formatVersion !== PROJECT_BUNDLE_FORMAT) {
    throw new Error(`Format bundle tidak didukung (versi ${String(manifest.formatVersion)})`);
  }

  const readJson = async (name: string): Promise<any> => {
    const entry = zip.file(name);
    if (!entry) return null;
    const text = await entry.async("string");
    if (text.length > MAX_JSON_BYTES) throw new Error(`${name} terlalu besar`);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${name} tidak valid`);
    }
  };

  const projectData = (await readJson("data/project.json"))?.project ?? {};
  const artifacts = (await readJson("data/artifacts.json")) ?? {};
  const execution = (await readJson("data/execution.json")) ?? {};
  const chat = manifest.included?.chat ? await readJson("data/chat.json") : null;

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    const name = entry.name.replace(/\\/g, "/");
    if (name === "manifest.json" || name.startsWith("data/") || name.startsWith("project/")) continue;
    throw new Error(`Entry tidak dikenal di ZIP: ${entry.name}`);
  }

  const createdRoot = !fs.existsSync(root);
  fs.mkdirSync(root, { recursive: true });
  let extracted = 0;
  try {
    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const name = entry.name.replace(/\\/g, "/");
      if (!name.startsWith("project/")) continue;
      const rel = safeRelative(name.slice("project/".length));
      const target = path.resolve(root, rel);
      if (!target.startsWith(root + path.sep)) throw new Error(`Path keluar folder tujuan: ${entry.name}`);
      const content = await entry.async("nodebuffer");
      extracted += content.length;
      if (extracted > MAX_BUNDLE_BYTES) throw new Error("Isi ZIP melebihi batas 500 MB");
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
  } catch (error) {
    if (createdRoot) fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }

  const erdRows = rowsOf(artifacts, "erds");
  const erdSnapRows = rowsOf(artifacts, "erdSnapshots");
  const specRows = rowsOf(artifacts, "apiSpecs");
  const apiSnapRows = rowsOf(artifacts, "apiSnapshots");
  const endpointRows = rowsOf(artifacts, "apiEndpoints");
  const pageRows = rowsOf(artifacts, "wikiPages");
  const wikiSnapRows = rowsOf(artifacts, "wikiSnapshots");
  const taskRows = rowsOf(artifacts, "tasks");
  const taskSnapRows = rowsOf(artifacts, "taskSnapshots");
  const fsdRows = rowsOf(artifacts, "fsdSessions");
  const brRows = rowsOf(artifacts, "businessRequirements");
  const frRows = rowsOf(artifacts, "functionalRequirements");
  const dsRows = rowsOf(artifacts, "designSolutions");
  const tcRows = rowsOf(artifacts, "testCases");
  const linkRows = rowsOf(artifacts, "rtmLinks");
  const logRows = rowsOf(artifacts, "changeLog");

  const erdMap = idMap(erdRows);
  const erdSnapMap = idMap(erdSnapRows);
  const specMap = idMap(specRows);
  const apiSnapMap = idMap(apiSnapRows);
  const endpointMap = idMap(endpointRows);
  const pageMap = idMap(pageRows);
  const wikiSnapMap = idMap(wikiSnapRows);
  const taskMap = idMap(taskRows);
  const taskSnapMap = idMap(taskSnapRows);
  const fsdMap = idMap(fsdRows);
  const brMap = idMap(brRows);
  const frMap = idMap(frRows);
  const dsMap = idMap(dsRows);
  const tcMap = idMap(tcRows);
  const linkMap = idMap(linkRows);
  const logMap = idMap(logRows);
  const snapshotMap = new Map([...erdSnapMap, ...apiSnapMap, ...wikiSnapMap, ...taskSnapMap]);

  const newProjectId = crypto.randomUUID();
  const now = new Date().toISOString();
  const name = uniqueProjectName(db, String(projectData.name ?? manifest.project?.name ?? "Imported project"));
  const projectRow: Row = {
    id: newProjectId,
    name,
    rootPath: root,
    company: projectData.company ?? manifest.project?.company ?? null,
    description: projectData.description ?? manifest.project?.description ?? null,
    defaultAgent: projectData.defaultAgent ?? "opencode",
    skillsStatus: "pending",
    skillsError: null,
    skillsUpdatedAt: null,
    customerName: projectData.customerName ?? null,
    docVersion: projectData.docVersion ?? null,
    docAuthor: projectData.docAuthor ?? null,
    createdAt: projectData.createdAt ?? now,
    updatedAt: now,
  };

  const newErds = withMappedId(erdRows, erdMap).map((row) => ({ ...row, projectId: newProjectId }));
  const newErdSnaps = erdSnapRows
    .filter((row) => typeof row.id === "string" && erdMap.has(row.erdId))
    .map((row) => ({
      ...row,
      id: erdSnapMap.get(row.id),
      erdId: erdMap.get(row.erdId),
      changeLogId: logMap.get(row.changeLogId) ?? null,
    }));
  const newSpecs = withMappedId(specRows, specMap).map((row) => ({ ...row, projectId: newProjectId }));
  const newApiSnaps = apiSnapRows
    .filter((row) => typeof row.id === "string" && specMap.has(row.specId))
    .map((row) => ({
      ...row,
      id: apiSnapMap.get(row.id),
      specId: specMap.get(row.specId),
      changeLogId: logMap.get(row.changeLogId) ?? null,
    }));
  const newEndpoints = endpointRows
    .filter((row) => typeof row.id === "string" && specMap.has(row.specId))
    .map((row) => ({ ...row, id: endpointMap.get(row.id), specId: specMap.get(row.specId) }));
  const newPages = withMappedId(pageRows, pageMap).map((row) => ({
    ...row,
    projectId: newProjectId,
    parentId: pageMap.get(row.parentId) ?? null,
  }));
  const newWikiSnaps = wikiSnapRows
    .filter((row) => typeof row.id === "string" && pageMap.has(row.pageId))
    .map((row) => ({
      ...row,
      id: wikiSnapMap.get(row.id),
      pageId: pageMap.get(row.pageId),
      changeLogId: logMap.get(row.changeLogId) ?? null,
    }));
  const newTasks = withMappedId(taskRows, taskMap).map((row) => ({
    ...row,
    projectId: newProjectId,
    execProviderId: null,
    execModel: null,
  }));
  const newTaskSnaps = taskSnapRows
    .filter((row) => typeof row.id === "string" && taskMap.has(row.taskId))
    .map((row) => ({
      ...row,
      id: taskSnapMap.get(row.id),
      taskId: taskMap.get(row.taskId),
      changeLogId: logMap.get(row.changeLogId) ?? null,
    }));
  const newFsd = withMappedId(fsdRows, fsdMap).map((row) => ({ ...row, projectId: newProjectId }));
  const newBrs = withMappedId(brRows, brMap).map((row) => ({ ...row, projectId: newProjectId }));
  const newFrs = withMappedId(frRows, frMap).map((row) => ({
    ...row,
    projectId: newProjectId,
    brId: brMap.get(row.brId) ?? null,
  }));
  const newDss = withMappedId(dsRows, dsMap).map((row) => ({ ...row, projectId: newProjectId }));
  const newTcs = withMappedId(tcRows, tcMap).map((row) => ({ ...row, projectId: newProjectId }));
  const newLinks = linkRows
    .filter((row) => typeof row.id === "string" && frMap.has(row.frId))
    .map((row) => ({
      ...row,
      id: linkMap.get(row.id),
      projectId: newProjectId,
      frId: frMap.get(row.frId),
      dsId: dsMap.get(row.dsId) ?? null,
      tcId: tcMap.get(row.tcId) ?? null,
    }));
  const entityMaps: Record<string, Map<string, string>> = {
    erd: erdMap,
    api_spec: specMap,
    spec: specMap,
    api: specMap,
    wiki_page: pageMap,
    wiki: pageMap,
    task: taskMap,
    fsd: fsdMap,
    fsd_session: fsdMap,
  };
  const newLogs = withMappedId(logRows, logMap).map((row) => ({
    ...row,
    projectId: newProjectId,
    entityId: remapEntityId(String(row.entityType ?? ""), String(row.entityId ?? ""), entityMaps, newProjectId),
    snapshotId: snapshotMap.get(row.snapshotId) ?? null,
  }));

  const chatThreadRows: Row[] = Array.isArray(chat?.threads) ? (chat.threads as Row[]).filter((row) => row && typeof row.id === "string") : [];
  const chatMessageRows: Row[] = Array.isArray(chat?.messages) ? (chat.messages as Row[]).filter((row) => row && typeof row.id === "string") : [];
  const chatFileRows: Row[] = Array.isArray(chat?.threadFiles) ? (chat.threadFiles as Row[]).filter((row) => row && typeof row.id === "string") : [];
  const chatReadRows: Row[] = Array.isArray(chat?.threadReads) ? (chat.threadReads as Row[]).filter((row) => row && typeof row.id === "string") : [];
  const threadMap = idMap(chatThreadRows);
  const chatMessageMap = idMap(chatMessageRows);
  const chatFileMap = idMap(chatFileRows);
  const chatReadMap = idMap(chatReadRows);

  for (const thread of chatThreadRows) {
    const oldId = thread.id;
    const newId = threadMap.get(oldId);
    if (!oldId || !newId) continue;
    const oldDir = path.join(root, "input", "uploads", oldId);
    const newDir = path.join(root, "input", "uploads", newId);
    if (!fs.existsSync(oldDir) || oldDir === newDir) continue;
    fs.mkdirSync(path.dirname(newDir), { recursive: true });
    if (!fs.existsSync(newDir)) {
      fs.renameSync(oldDir, newDir);
    } else {
      for (const name of fs.readdirSync(oldDir)) {
        const target = path.join(newDir, name);
        if (!fs.existsSync(target)) fs.renameSync(path.join(oldDir, name), target);
      }
      fs.rmdirSync(oldDir);
    }
  }

  const newThreads = withMappedId(chatThreadRows, threadMap).map((row) => ({
    ...row,
    projectId: newProjectId,
    parentThreadId: threadMap.get(row.parentThreadId) ?? null,
    rootThreadId: threadMap.get(row.rootThreadId) ?? null,
    cliSessionId: null,
    providerId: null,
    model: null,
    modelOptionsJson: null,
    workspaceStrategy: null,
    workspaceRepo: null,
    workspacePath: null,
    workspaceBranch: null,
    queuePaused: false,
  }));
  const newChatMessages = chatMessageRows
    .filter((row) => threadMap.has(row.threadId))
    .map((row): Row => {
      const newThreadId = threadMap.get(row.threadId) as string;
      return {
        ...row,
        id: chatMessageMap.get(row.id),
        threadId: newThreadId,
        contentJson: rewriteUploads(row.contentJson, row.threadId, newThreadId),
        toolCallsJson: null,
        toolCallId: null,
        kind: null,
      };
    });
  const newChatFiles = chatFileRows
    .filter((row) => threadMap.has(row.threadId))
    .map((row) => {
      const newThreadId = threadMap.get(row.threadId) as string;
      return {
        ...row,
        id: chatFileMap.get(row.id),
        threadId: newThreadId,
        messageId: chatMessageMap.get(row.messageId) ?? null,
        path: rewriteUploads(row.path, row.threadId, newThreadId),
      };
    });
  const newChatReads = chatReadRows
    .filter((row) => threadMap.has(row.threadId))
    .map((row) => {
      const newThreadId = threadMap.get(row.threadId) as string;
      return {
        ...row,
        id: chatReadMap.get(row.id),
        threadId: newThreadId,
        path: rewriteUploads(row.path, row.threadId, newThreadId),
      };
    });
  const chatFtsRows = newChatMessages
    .map((row) => ({ row, text: chatText(row.contentJson) }))
    .filter((entry) => entry.text);
  const settingsRow = execution?.settings
    ? {
        ...execution.settings,
        projectId: newProjectId,
        execProviderId: null,
        execModel: null,
        reviewerProviderId: null,
        reviewerModel: null,
        updatedAt: now,
      }
    : null;

  try {
    db.transaction((tx: Db) => {
      tx.insert(projects).values(projectRow).run();
      insertRows(tx, businessRequirements, newBrs);
      insertRows(tx, functionalRequirements, newFrs);
      insertRows(tx, designSolutions, newDss);
      insertRows(tx, testCases, newTcs);
      insertRows(tx, erds, newErds);
      insertRows(tx, erdSnapshots, newErdSnaps);
      insertRows(tx, apiSpecs, newSpecs);
      insertRows(tx, apiSnapshots, newApiSnaps);
      insertRows(tx, apiEndpoints, newEndpoints);
      insertRows(tx, wikiPages, newPages);
      insertRows(tx, wikiSnapshots, newWikiSnaps);
      insertRows(tx, tasks, newTasks);
      insertRows(tx, taskSnapshots, newTaskSnaps);
      if (settingsRow) tx.insert(projectExecSettings).values(settingsRow).run();
      insertRows(tx, fsdSessions, newFsd);
      insertRows(tx, rtmLinks, newLinks);
      insertRows(tx, changeLog, newLogs);
      insertRows(tx, chatThreads, newThreads);
      insertRows(tx, chatMessages, newChatMessages);
      insertRows(tx, chatThreadFiles, newChatFiles);
      insertRows(tx, chatThreadReads, newChatReads);
      for (const entry of chatFtsRows) {
        try {
          tx.run(sql`DELETE FROM chat_fts WHERE message_id = ${entry.row.id}`);
          tx.run(
            sql`INSERT INTO chat_fts (text, message_id, thread_id, role)
                VALUES (${entry.text}, ${entry.row.id}, ${entry.row.threadId}, ${entry.row.role})`,
          );
        } catch {
          /* the search index is derived; a missing FTS table must not fail the import */
        }
      }
      tx.insert(changeLog).values({
        id: crypto.randomUUID(),
        projectId: newProjectId,
        entityType: "project",
        entityId: newProjectId,
        entityName: name,
        action: "imported",
        summary: `Imported project '${name}' from ${manifest.project?.name ?? "bundle"}`,
        createdAt: now,
      }).run();
    });
  } catch (error) {
    if (createdRoot) fs.rmSync(root, { recursive: true, force: true });
    throw error;
  }

  return { projectId: newProjectId, rootPath: root, name };
}
