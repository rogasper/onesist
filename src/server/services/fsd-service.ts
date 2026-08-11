import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { isSupportedUpload, sanitizeFilename } from "~/lib/markitdown";
import { db } from "~/server/db/client";
import { fsdSessions } from "~/server/db/schema";
import { hashContent } from "../http/route-utils";

export interface FsdPaths {
  fsdDir: string;
  sourcesDir: string;
  imagesDir: string;
}

export function fsdPaths(root: string): FsdPaths {
  const fsdDir = path.join(root, "input", "fsd");
  return { fsdDir, sourcesDir: path.join(fsdDir, "sources"), imagesDir: path.join(fsdDir, "images") };
}

export interface ConversionResult {
  ok: boolean;
  markdown?: string;
  tool?: string;
  error?: string;
}

export async function convertToMarkdown(sourceFullPath: string): Promise<ConversionResult> {
  const { convertWithOpencode, convertWithMarkitdown } = await import("~/lib/markitdown");
  const result = await convertWithOpencode(sourceFullPath);
  if (result.ok) return { ok: true, markdown: result.markdown, tool: "opencode-markitdown-skill" };
  // Deterministic fallback so DOCX/PPTX/XLSX still convert if opencode fails/times out
  const cli = await convertWithMarkitdown(sourceFullPath);
  if (cli.ok && cli.markdown) return { ok: true, markdown: cli.markdown, tool: "markitdown-cli" };
  return { ok: false, error: result.error || cli.error };
}

// Recursive scan of input/fsd (markdown docs + uploaded sources) with upsert.
export function scanFsdDir(projectId: string, root: string): { scanned: number; total: number } {
  const { fsdDir, sourcesDir } = fsdPaths(root);
  const existing = db.select().from(fsdSessions).where(eq(fsdSessions.projectId, projectId)).all() as any[];
  const byPath = new Map<string, any>();
  for (const s of existing) {
    if (s.markdownPath) byPath.set(s.markdownPath, s);
    if (s.sourceFilePath) byPath.set(s.sourceFilePath, s);
    if (!s.markdownPath && !s.sourceFilePath && s.fsdInputPath) byPath.set(`input/fsd/${s.fsdInputPath}`, s);
  }
  const now = new Date().toISOString();
  let count = 0;

  const walk = (dir: string, relPrefix: string) => {
    try {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isFile()) {
          if (!entry.name.endsWith(".md") || entry.name === "README.md" || entry.name.startsWith(".")) continue;
          const rel = (relPrefix ? path.join(relPrefix, entry.name) : entry.name).replace(/\\/g, "/");
          const relPath = `input/fsd/${rel}`;
          const content = fs.readFileSync(full, "utf-8");
          const hash = hashContent(content);
          const artifactSlug = entry.name.replace(/^fsd_/, "").replace(/\.md$/, "").replace(/_/g, "");
          const artifacts: Record<string, string[]> = { spec: [], erd: [], task: [] };
          try {
            const specDir = path.join(root, "output", "spec");
            if (fs.existsSync(specDir)) artifacts.spec = fs.readdirSync(specDir).filter((f: string) => f.includes(artifactSlug) && f.endsWith(".md"));
          } catch {}
          try {
            const erdDir = path.join(root, "output", "erd");
            if (fs.existsSync(erdDir)) artifacts.erd = fs.readdirSync(erdDir).filter((f: string) => f.includes(artifactSlug) && f.endsWith(".md"));
          } catch {}
          try {
            const taskDir = path.join(root, "output", "task");
            if (fs.existsSync(taskDir)) artifacts.task = fs.readdirSync(taskDir).filter((f: string) => f.includes(artifactSlug) && f.endsWith(".md"));
          } catch {}
          const existingRow = byPath.get(relPath);
          if (existingRow) {
            db.update(fsdSessions).set({
              fsdContent: content,
              contentHash: hash,
              markdownPath: relPath,
              artifactsJson: JSON.stringify(artifacts),
              updatedAt: now,
            }).where(eq(fsdSessions.id, existingRow.id)).run();
          } else {
            db.insert(fsdSessions).values({
              id: crypto.randomUUID(),
              projectId,
              fsdInputPath: rel,
              fsdContent: content,
              mode: "generate",
              status: "draft",
              title: entry.name.replace(/^fsd_/, "").replace(/\.md$/, "").replace(/_/g, " "),
              sourceType: "manual",
              markdownPath: relPath,
              contentHash: hash,
              artifactsJson: JSON.stringify(artifacts),
              createdAt: now,
              updatedAt: now,
            }).run();
          }
          count++;
        } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
          walk(full, relPrefix ? path.join(relPrefix, entry.name) : entry.name);
        }
      }
    } catch {}
  };
  walk(fsdDir, "");

  // Also index uploaded source documents so conversion can be started
  // from the selected FSD document instead of only from the upload dialog.
  const scanSources = (dir: string, relPrefix: string) => {
    try {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith(".")) {
          scanSources(full, relPrefix ? path.join(relPrefix, entry.name) : entry.name);
          continue;
        }
        if (!entry.isFile() || !isSupportedUpload(entry.name) || entry.name.endsWith(".md")) continue;
        // Skip source files that already have a converted Markdown twin —
        // the Markdown session is the editable document.
        const stem = entry.name.replace(/\.[a-z0-9]+$/i, "");
        const twinTopLevel = path.join(fsdDir, `${stem}.md`);
        const twinSameFolder = path.join(dir, `${stem}.md`);
        if (fs.existsSync(twinTopLevel) || fs.existsSync(twinSameFolder)) {
          const sourceRel = `input/fsd/sources/${(relPrefix ? path.join(relPrefix, entry.name) : entry.name).replace(/\\/g, "/")}`;
          const existingTwin = byPath.get(sourceRel);
          if (existingTwin) {
            db.delete(fsdSessions).where(eq(fsdSessions.id, existingTwin.id)).run();
            byPath.delete(sourceRel);
            count++;
          }
          continue;
        }
        const rel = (relPrefix ? path.join(relPrefix, entry.name) : entry.name).replace(/\\/g, "/");
        const sourcePath = `input/fsd/sources/${rel}`;
        const existingRow = byPath.get(sourcePath);
        if (existingRow) continue;
        const ext = path.extname(entry.name).slice(1).toLowerCase();
        const title = entry.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ");
        const placeholder = `# ${title}\n\n> Uploaded ${ext.toUpperCase()} document. Convert it to Markdown to edit the extracted requirements.`;
        const now = new Date().toISOString();
        const session = {
          id: crypto.randomUUID(),
          projectId,
          fsdInputPath: null,
          fsdContent: placeholder,
          mode: "generate",
          status: "draft",
          title,
          sourceType: ext,
          sourceFilePath: sourcePath,
          markdownPath: null,
          conversionStatus: "pending",
          conversionError: null,
          contentHash: hashContent(placeholder),
          artifactsJson: JSON.stringify({ spec: [], erd: [], task: [] }),
          createdAt: now,
          updatedAt: now,
        };
        db.insert(fsdSessions).values(session).run();
        byPath.set(sourcePath, session);
        count++;
      }
    } catch {}
  };
  scanSources(sourcesDir, "");

  return { scanned: count, total: db.select().from(fsdSessions).where(eq(fsdSessions.projectId, projectId)).all().length };
}

export interface UploadResult {
  error?: string;
  status?: number;
  uploaded?: boolean;
  fileName?: string;
  sourcePath?: string;
  needsConversion?: boolean;
  message?: string;
}

export function saveFsdUpload(root: string, originalName: string, buf: Buffer): UploadResult {
  const safeName = (() => {
    try { return sanitizeFilename(originalName); } catch { return ""; }
  })();
  if (!safeName) return { error: "Missing filename" };
  if (!buf.length) return { error: "Missing file" };
  if (buf.length > 50 * 1024 * 1024) return { error: "File too large (max 50MB)", status: 413 };
  if (!isSupportedUpload(safeName)) return { error: `Unsupported file type: ${safeName}`, status: 415 };

  const { fsdDir, sourcesDir } = fsdPaths(root);
  const stem = safeName.replace(/\.[a-z0-9]+$/i, "");
  const ext = safeName.match(/\.[a-z0-9]+$/i)?.[0].toLowerCase() ?? "";
  const isMd = ext === ".md";
  const targetDir = isMd ? fsdDir : sourcesDir;
  try { fs.mkdirSync(targetDir, { recursive: true }); } catch {}
  const baseName = stem.replace(/[^\w.\- ]+/g, "_");
  let fileNameFinal = `${baseName}${ext}`;
  let n = 2;
  while (fs.existsSync(path.join(targetDir, fileNameFinal))) {
    fileNameFinal = `${baseName}_${n}${ext}`;
    n++;
  }
  fs.writeFileSync(path.join(targetDir, fileNameFinal), buf);
  const relativePath = isMd ? `input/fsd/${fileNameFinal}` : `input/fsd/sources/${fileNameFinal}`;
  return {
    uploaded: true,
    fileName: fileNameFinal,
    sourcePath: relativePath,
    needsConversion: !isMd,
    message: isMd ? "Markdown file uploaded" : "File uploaded; conversion is available manually",
  };
}

export function saveFsdImage(root: string, originalName: string, buf: Buffer): UploadResult {
  if (!originalName) return { error: "Missing filename" };
  if (!buf.length) return { error: "Missing file" };
  if (buf.length > 20 * 1024 * 1024) return { error: "Image too large (max 20MB)", status: 413 };
  const ext = originalName.match(/\.(png|jpe?g|gif|webp|svg|avif)$/i)?.[0].toLowerCase() ?? "";
  if (!ext) return { error: `Unsupported image type: ${originalName}`, status: 415 };

  const imagesDir = fsdPaths(root).imagesDir;
  try { fs.mkdirSync(imagesDir, { recursive: true }); } catch {}
  const stem = originalName.replace(/\.[a-z0-9]+$/i, "").replace(/[^\w.\- ]+/g, "_");
  let fileNameFinal = `${stem}${ext}`;
  let n = 2;
  while (fs.existsSync(path.join(imagesDir, fileNameFinal))) {
    fileNameFinal = `${stem}_${n}${ext}`;
    n++;
  }
  fs.writeFileSync(path.join(imagesDir, fileNameFinal), buf);
  return { uploaded: true, fileName: fileNameFinal, sourcePath: `input/fsd/images/${fileNameFinal}` };
}
