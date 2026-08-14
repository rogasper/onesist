import fs from "node:fs";
import path from "node:path";
import { Router } from "../../http/router";
import { json, notFound } from "../../http/response";
import { getProject } from "../../http/route-utils";
import {
  scanSitDirectory,
  parseSitTestCase,
  normalizeSitFile,
  qualityCheckSit,
  type SitQualityIssue,
} from "~/lib/sit-parser";
import { writeFile } from "~/lib/file-router";
import { buildSitXlsx } from "~/lib/sit-xlsx-export";

export const router = new Router();
const SIT_DIR = "output/sit";

router.get("projects/:id/sit", ({ params }) => {
  const proj = getProject(params.id);
  if (!proj) return notFound();
  const data = scanSitDirectory(proj.rootPath || "");
  return json(data);
});

router.get("projects/:id/sit/:filename", ({ params }) => {
  const proj = getProject(params.id);
  if (!proj) return notFound();
  const filePath = path.join(proj.rootPath || "", SIT_DIR, params.filename);
  if (!fs.existsSync(filePath)) return notFound();
  const content = fs.readFileSync(filePath, "utf-8");
  const tc = parseSitTestCase(content);
  return json(tc);
});

// GET /api/projects/:id/sit/quality — run the quality audit over output/sit/
router.get("projects/:id/sit/quality", ({ params }) => {
  const proj = getProject(params.id);
  if (!proj?.rootPath) return json({ error: "Project root not set" }, 400);
  const data = scanSitDirectory(proj.rootPath);
  const issues = qualityCheckSit(proj.rootPath, data);
  const counts = {
    errors: issues.filter((i) => i.severity === "error").length,
    warnings: issues.filter((i) => i.severity === "warning").length,
    infos: issues.filter((i) => i.severity === "info").length,
  };
  return json({ issues, counts });
});

// POST /api/projects/:id/sit/:filename/normalize — convert one file to STANDARD format
router.post("projects/:id/sit/:filename/normalize", ({ params }) => {
  const proj = getProject(params.id);
  if (!proj?.rootPath) return json({ error: "Project root not set" }, 400);
  const filePath = path.join(proj.rootPath, SIT_DIR, params.filename);
  if (!fs.existsSync(filePath)) return notFound();
  const content = fs.readFileSync(filePath, "utf-8");
  const normalized = normalizeSitFile(content);
  const ok = writeFile(proj.rootPath, `output/sit/${params.filename}`, normalized);
  if (!ok) return json({ error: "Failed to write normalized file" }, 500);
  return json({ normalized: true, filename: params.filename });
});

// POST /api/projects/:id/sit/normalize-all — normalize every file + regenerate summary
router.post("projects/:id/sit/normalize-all", ({ params }) => {
  const proj = getProject(params.id);
  if (!proj?.rootPath) return json({ error: "Project root not set" }, 400);
  const data = scanSitDirectory(proj.rootPath);
  let normalized = 0;
  let failed = 0;
  for (const f of data.files) {
    try {
      const content = fs.readFileSync(path.join(proj.rootPath, f.relativePath), "utf-8");
      const out = normalizeSitFile(content);
      if (out !== content) {
        if (writeFile(proj.rootPath, f.relativePath, out)) normalized++;
        else failed++;
      }
    } catch {
      failed++;
    }
  }
  return json({ normalized, failed });
});

// GET /api/projects/:id/sit/feedback — build an agent-ready refinement prompt
// from the current quality issues (used by the "Perbaiki via Agent" action).
router.get("projects/:id/sit/feedback", ({ params }) => {
  const proj = getProject(params.id);
  if (!proj?.rootPath) return json({ error: "Project root not set" }, 400);
  const data = scanSitDirectory(proj.rootPath);
  const issues = qualityCheckSit(proj.rootPath, data);
  return json({ feedback: buildQualityFeedback(issues) });
});

function buildQualityFeedback(issues: SitQualityIssue[]): string {
  if (issues.length === 0) {
    return "Periksa kembali output/sit/ — jika sudah memenuhi format standar dan lengkap, tidak perlu perubahan. Jika masih ada yang kurang, perbaiki. Jangan ubah apa pun yang sudah benar.";
  }
  const grouped = new Map<string, SitQualityIssue[]>();
  for (const i of issues) {
    const list = grouped.get(i.file) ?? [];
    list.push(i);
    grouped.set(i.file, list);
  }
  const lines = [
    "Perbaiki kualitas script SIT di output/sit/ sesuai daftar berikut. BACA file yang disebutkan terlebih dahulu, perbaiki yang melenceng, JANGAN hapus test case yang sudah benar, dan pertahankan format STANDARD (bukan tabel).",
  ];
  for (const [file, list] of grouped) {
    lines.push(`\n${file}:`);
    for (const i of list) lines.push(`  - ${i.message}`);
  }
  lines.push("\nUpdate SIT_SUMMARY.md jika jumlah step berubah. Selesai setelah semua issue teratasi.");
  return lines.join("\n");
}

router.post("projects/:id/sit/export-xlsx", async ({ params }) => {
  const proj = getProject(params.id);
  if (!proj?.rootPath) return json({ error: "Project root not set" }, 400);
  try {
    const buffer = await buildSitXlsx(proj.rootPath);
    const ab = new ArrayBuffer(buffer.length);
    const view = new Uint8Array(ab);
    for (let i = 0; i < buffer.length; i++) view[i] = buffer[i]!;
    return new Response(ab, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="SIT-${proj.name || "project"}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `XLSX export failed: ${msg}` }, 500);
  }
});
