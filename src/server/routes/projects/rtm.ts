import fs from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { getProject } from "../../http/route-utils";
import { parseRtmMarkdown } from "~/lib/rtm-parser";
import { db } from "~/server/db/client";
import {
  businessRequirements,
  designSolutions,
  functionalRequirements,
  rtmLinks,
  testCases,
} from "~/server/db/schema";

export const router = new Router();

type EntityKind = "br" | "fr" | "design" | "test";

const KIND_TO_TABLE: Record<EntityKind, any> = {
  br: businessRequirements,
  fr: functionalRequirements,
  design: designSolutions,
  test: testCases,
};

/** Compute the next sequential code (e.g. BR-004) from existing rows. */
function nextCode(rows: { code: string | null }[], prefix: string): string {
  let max = 0;
  const re = new RegExp(`${prefix}-(\\d+)`, "i");
  for (const r of rows) {
    const m = r.code?.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

// GET /api/projects/:id/rtm — full matrix dataset
router.get("projects/:id/rtm", ({ params, query }) => {
  const id = params.id;
  const fsd = query.get("fsd") || "default";
  const byCode = (prefix: string) => (rows: { code: string | null }[]) => rows.slice().sort((a, b) => {
    const n = (code: string | null) => {
      const m = code?.match(new RegExp(`${prefix}-(\\d+)`, "i"));
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    };
    return n(a.code) - n(b.code);
  });
  return json({
    fsd,
    brs: byCode("BR")(db.select().from(businessRequirements).where(and(eq(businessRequirements.projectId, id), eq(businessRequirements.fsd, fsd))).all()),
    frs: byCode("FR")(db.select().from(functionalRequirements).where(and(eq(functionalRequirements.projectId, id), eq(functionalRequirements.fsd, fsd))).all()),
    designs: byCode("DS")(db.select().from(designSolutions).where(and(eq(designSolutions.projectId, id), eq(designSolutions.fsd, fsd))).all()),
    tests: byCode("TC")(db.select().from(testCases).where(and(eq(testCases.projectId, id), eq(testCases.fsd, fsd))).all()),
    links: db.select().from(rtmLinks).where(and(eq(rtmLinks.projectId, id), eq(rtmLinks.fsd, fsd))).all(),
  });
});

// GET /api/projects/:id/rtm/scopes — RTM scope names (for the scope selector)
// + the raw FSD file list (for the multiselect pills).
//   scopes: distinct `fsd` values in the DB + RTM files in output/rtm/RTM_*.md
//           + "default". NO inference from filename/phase — the user picks.
//   files:  every .md FSD document in input/fsd (multiselect targets).
router.get("projects/:id/rtm/scopes", ({ params }) => {
  const id = params.id;
  const scopeSet = new Set<string>(["default"]);
  for (const table of [businessRequirements, functionalRequirements, designSolutions, testCases, rtmLinks]) {
    const rows = db.select({ fsd: table.fsd }).from(table).where(eq(table.projectId, id)).all() as { fsd: string }[];
    for (const r of rows) if (r.fsd) scopeSet.add(r.fsd);
  }

  const proj = getProject(id);
  const files: string[] = [];
  if (proj?.rootPath) {
    // RTM files already written by the agent count as scopes.
    const rtmDir = path.join(proj.rootPath, "output", "rtm");
    try {
      for (const f of fs.readdirSync(rtmDir)) {
        if (!f.endsWith(".md")) continue;
        const base = f.replace(/\.md$/, "");
        scopeSet.add(base === "RTM" ? "default" : base.replace(/^RTM_/, "") || "default");
      }
    } catch {}
    // All FSD documents (multiselect targets).
    const fsdDir = path.join(proj.rootPath, "input", "fsd");
    try {
      for (const f of fs.readdirSync(fsdDir)) {
        if (!f.endsWith(".md")) continue;
        const stem = f.replace(/\.md$/, "");
        if (stem) files.push(stem);
      }
    } catch {}
  }

  return json({ scopes: [...scopeSet].sort(), files: files.sort() });
});

// NOTE: literal routes (links, import) MUST be registered before the
// parameterized `:kind` routes below — the Router returns the first match and
// `/rtm/links` would otherwise hit `/rtm/:kind`.

// POST /api/projects/:id/rtm/links — { frId, dsId? , tcId?, fsd? }
router.post("projects/:id/rtm/links", async ({ params, body }) => {
  const data = await body();
  const frId = data.frId as string;
  if (!frId) return json({ error: "frId is required" }, 400);
  const dsId = (data.dsId as string) ?? null;
  const tcId = (data.tcId as string) ?? null;
  const fsd = (data.fsd as string) || "default";
  if (!dsId && !tcId) return json({ error: "Link needs a design solution or test case" }, 400);
  // Avoid duplicates (query by project+fr, then match in JS since null filtering
  // is awkward in drizzle's type-safe eq()).
  const frLinks = db.select().from(rtmLinks)
    .where(and(eq(rtmLinks.projectId, params.id), eq(rtmLinks.frId, frId), eq(rtmLinks.fsd, fsd)))
    .all() as any[];
  const dup = frLinks.find((l: any) => l.dsId === dsId && l.tcId === tcId);
  if (dup) return json(dup, 200);
  const link = {
    id: crypto.randomUUID(),
    projectId: params.id,
    fsd,
    frId,
    dsId,
    tcId,
    createdAt: new Date().toISOString(),
  };
  db.insert(rtmLinks).values(link).run();
  return json(link, 201);
});

// DELETE /api/projects/:id/rtm/links/:linkId
router.delete("projects/:id/rtm/links/:linkId", ({ params }) => {
  db.delete(rtmLinks).where(eq(rtmLinks.id, params.linkId)).run();
  return json({ deleted: true });
});

const RTM_DIR = "output/rtm";

function rtmFiles(rootPath: string): string[] {
  const dir = path.join(rootPath, RTM_DIR);
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".md")).sort().map((f) => path.join(RTM_DIR, f));
  } catch {
    return [];
  }
}

/** RTM scope from the file name: RTM.md → "default", RTM_phase1.md → "phase1". */
function scopeFromFile(file: string): string {
  const base = path.basename(file, ".md");
  if (base === "RTM") return "default";
  return base.replace(/^RTM_/, "") || "default";
}

// POST /api/projects/:id/rtm/import/preview — parse output/rtm/*.md without writing
router.post("projects/:id/rtm/import/preview", async ({ params }) => {
  const proj = getProject(params.id);
  if (!proj) return notFound();
  const rootPath = proj.rootPath || "";
  const files = rtmFiles(rootPath);

  const existingIn = (table: any, fsd: string) => {
    const rows = db.select().from(table).where(and(eq(table.projectId, params.id), eq(table.fsd, fsd))).all() as any[];
    return new Set(rows.map((r) => r.code));
  };

  const parsed = files.map((file) => {
    const content = fs.readFileSync(path.join(rootPath, file), "utf-8");
    const fsd = scopeFromFile(file);
    return {
      file,
      fsd,
      data: parseRtmMarkdown(content),
      brCodes: existingIn(businessRequirements, fsd),
      frCodes: existingIn(functionalRequirements, fsd),
      dsCodes: existingIn(designSolutions, fsd),
      tcCodes: existingIn(testCases, fsd),
    };
  });

  const count = (list: { code: string }[], known: Set<string>) => ({
    total: list.length,
    new: list.filter((x) => !known.has(x.code)).length,
    update: list.filter((x) => known.has(x.code)).length,
  });

  return json({
    files: parsed.map((p) => ({
      file: p.file,
      fsd: p.fsd,
      brs: count(p.data.brs, p.brCodes),
      frs: count(p.data.frs, p.frCodes),
      designs: count(p.data.designs, p.dsCodes),
      tests: count(p.data.tests, p.tcCodes),
    })),
    totals: {
      brs: parsed.reduce((s, p) => s + p.data.brs.length, 0),
      frs: parsed.reduce((s, p) => s + p.data.frs.length, 0),
      designs: parsed.reduce((s, p) => s + p.data.designs.length, 0),
      tests: parsed.reduce((s, p) => s + p.data.tests.length, 0),
      unresolvedBr: parsed.reduce((s, p) => s + p.data.unresolvedBrCodes.length, 0),
    },
  });
});

// POST /api/projects/:id/rtm/import/apply — parse output/rtm/*.md and upsert into DB
router.post("projects/:id/rtm/import/apply", async ({ params }) => {
  const proj = getProject(params.id);
  if (!proj) return notFound();
  const rootPath = proj.rootPath || "";
  const id = params.id;
  const now = new Date().toISOString();
  let inserted = 0, updated = 0;

  const files = rtmFiles(rootPath);
  for (const file of files) {
    const content = fs.readFileSync(path.join(rootPath, file), "utf-8");
    const parsed = parseRtmMarkdown(content);
    const fsd = scopeFromFile(file);
    if (parsed.brs.length + parsed.frs.length + parsed.designs.length + parsed.tests.length === 0) continue;

    const upsert = (table: any, rows: any[], map: (r: any, newId: string) => any) => {
      const existing = db.select().from(table).where(and(eq(table.projectId, id), eq(table.fsd, fsd))).all() as any[];
      const byCode = new Map(existing.map((r) => [r.code, r]));
      for (const row of rows) {
        const known = byCode.get(row.code);
        if (known) {
          db.update(table).set({ ...map(row, known.id), fsd, updatedAt: now }).where(eq(table.id, known.id)).run();
          updated++;
        } else {
          db.insert(table).values({ ...map(row, crypto.randomUUID()), projectId: id, fsd, createdAt: now, updatedAt: now, sortOrder: existing.length + inserted }).run();
          inserted++;
        }
      }
    };

    upsert(businessRequirements, parsed.brs, (r, newId) => ({ id: newId, code: r.code, title: r.title, description: r.description ?? null }));
    upsert(designSolutions, parsed.designs, (r, newId) => ({ id: newId, code: r.code, title: r.title, description: r.description ?? null, sourceRef: r.sourceRef ?? null }));
    upsert(testCases, parsed.tests, (r, newId) => ({ id: newId, code: r.code, title: r.title, description: r.description ?? null, steps: r.steps ?? null, expected: r.expected ?? null }));
    upsert(functionalRequirements, parsed.frs, (r, newId) => ({ id: newId, code: r.code, title: r.title, description: r.description ?? null, brId: null }));

    // Resolve BR codes → brId and rebuild links for each FR (scope-aware)
    const brByCode = new Map((db.select().from(businessRequirements).where(and(eq(businessRequirements.projectId, id), eq(businessRequirements.fsd, fsd))).all() as any[]).map((r) => [r.code, r.id]));
    for (const fr of parsed.frs) {
      const frRow = db.select().from(functionalRequirements).where(and(eq(functionalRequirements.projectId, id), eq(functionalRequirements.code, fr.code), eq(functionalRequirements.fsd, fsd))).get() as any;
      if (!frRow) continue;
      const brId = fr.brCode ? (brByCode.get(fr.brCode) ?? null) : null;
      db.update(functionalRequirements).set({ brId }).where(eq(functionalRequirements.id, frRow.id)).run();
      db.delete(rtmLinks).where(and(eq(rtmLinks.frId, frRow.id), eq(rtmLinks.fsd, fsd))).run();
      const dsIds = fr.dsCodes.map((code) => {
        const row = db.select().from(designSolutions).where(and(eq(designSolutions.projectId, id), eq(designSolutions.code, code), eq(designSolutions.fsd, fsd))).get() as any;
        return row?.id ?? null;
      }).filter(Boolean) as string[];
      const tcIds = fr.tcCodes.map((code) => {
        const row = db.select().from(testCases).where(and(eq(testCases.projectId, id), eq(testCases.code, code), eq(testCases.fsd, fsd))).get() as any;
        return row?.id ?? null;
      }).filter(Boolean) as string[];
      for (const dsId of dsIds) {
        db.insert(rtmLinks).values({ id: crypto.randomUUID(), projectId: id, fsd, frId: frRow.id, dsId, tcId: null, createdAt: now }).run();
      }
      for (const tcId of tcIds) {
        db.insert(rtmLinks).values({ id: crypto.randomUUID(), projectId: id, fsd, frId: frRow.id, dsId: null, tcId, createdAt: now }).run();
      }
    }
  }

  return json({ inserted, updated });
});

// POST /api/projects/:id/rtm/export?fsd= — serialize the DB matrix for a scope
// to output/rtm/RTM_<fsd>.md (RTM.md for "default"), so the agent CLI (or a
// manual terminal run) can keep working on the markdown artifact.
router.post("projects/:id/rtm/export", ({ params, query }) => {
  const proj = getProject(params.id);
  if (!proj?.rootPath) return json({ error: "Project root not set" }, 400);
  const id = params.id;
  const fsd = query.get("fsd") || "default";
  const brs = db.select().from(businessRequirements).where(and(eq(businessRequirements.projectId, id), eq(businessRequirements.fsd, fsd))).all() as any[];
  const frs = db.select().from(functionalRequirements).where(and(eq(functionalRequirements.projectId, id), eq(functionalRequirements.fsd, fsd))).all() as any[];
  const designs = db.select().from(designSolutions).where(and(eq(designSolutions.projectId, id), eq(designSolutions.fsd, fsd))).all() as any[];
  const tests = db.select().from(testCases).where(and(eq(testCases.projectId, id), eq(testCases.fsd, fsd))).all() as any[];
  const links = db.select().from(rtmLinks).where(and(eq(rtmLinks.projectId, id), eq(rtmLinks.fsd, fsd))).all() as any[];
  const md = toRtmMarkdown(brs, frs, designs, tests, links);
  const dir = path.join(proj.rootPath, "output", "rtm");
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const filename = fsd === "default" ? "RTM.md" : `RTM_${fsd}.md`;
  fs.writeFileSync(path.join(dir, filename), md, "utf-8");
  return json({ exported: true, path: `output/rtm/${filename}`, fsd, brs: brs.length, frs: frs.length });
});

// POST /api/projects/:id/rtm/:kind — create an entity (kind: br|fr|design|test)
router.post("projects/:id/rtm/:kind", async ({ params, body }) => {
  const kind = params.kind as EntityKind;
  if (!KIND_TO_TABLE[kind]) return json({ error: "Unknown entity kind" }, 400);
  const data = await body();
  const table = KIND_TO_TABLE[kind];
  const fsd = (data.fsd as string) || "default";
  const now = new Date().toISOString();
  // IDs restart per scope (each BRD/FSD → its own RTM file).
  const existing = db.select().from(table).where(and(eq(table.projectId, params.id), eq(table.fsd, fsd))).all() as any[];
  const prefix = { br: "BR", fr: "FR", design: "DS", test: "TC" }[kind];

  let code = (data.code as string)?.trim() || nextCode(existing, prefix);
  if (!new RegExp(`^${prefix}-\\d+$`, "i").test(code)) {
    code = nextCode(existing, prefix);
  }

  const values: Record<string, unknown> = {
    id: crypto.randomUUID(),
    projectId: params.id,
    fsd,
    code,
    title: (data.title as string)?.trim() || "Untitled",
    sortOrder: existing.length,
    createdAt: now,
    updatedAt: now,
  };
  if (kind === "br" || kind === "fr" || kind === "design") {
    if (data.description !== undefined) values.description = data.description;
  }
  if (kind === "fr") values.brId = data.brId ?? null;
  if (kind === "design" && data.sourceRef !== undefined) values.sourceRef = data.sourceRef;
  if (kind === "test") {
    if (data.description !== undefined) values.description = data.description;
    if (data.steps !== undefined) values.steps = data.steps;
    if (data.expected !== undefined) values.expected = data.expected;
  }
  db.insert(table).values(values).run();
  return json(db.select().from(table).where(eq(table.id, values.id)).get(), 201);
});

// PUT /api/projects/:id/rtm/:kind/:itemId
router.put("projects/:id/rtm/:kind/:itemId", async ({ params, body }) => {
  const kind = params.kind as EntityKind;
  if (!KIND_TO_TABLE[kind]) return json({ error: "Unknown entity kind" }, 400);
  const data = await body();
  const table = KIND_TO_TABLE[kind];
  const existing = db.select().from(table).where(eq(table.id, params.itemId)).get();
  if (!existing) return notFound();
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (data.code !== undefined) updates.code = data.code;
  if (data.fsd !== undefined) updates.fsd = data.fsd;
  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.brId !== undefined) updates.brId = data.brId ?? null;
  if (data.sourceRef !== undefined) updates.sourceRef = data.sourceRef;
  if (data.steps !== undefined) updates.steps = data.steps;
  if (data.expected !== undefined) updates.expected = data.expected;
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;
  db.update(table).set(updates).where(eq(table.id, params.itemId)).run();
  return json(db.select().from(table).where(eq(table.id, params.itemId)).get());
});

// DELETE /api/projects/:id/rtm/:kind/:itemId
router.delete("projects/:id/rtm/:kind/:itemId", ({ params }) => {
  const kind = params.kind as EntityKind;
  if (!KIND_TO_TABLE[kind]) return json({ error: "Unknown entity kind" }, 400);
  const table = KIND_TO_TABLE[kind];
  // Cascade cleanup of links that reference this entity
  if (kind === "fr") {
    db.delete(rtmLinks).where(eq(rtmLinks.frId, params.itemId)).run();
  } else if (kind === "design") {
    db.delete(rtmLinks).where(eq(rtmLinks.dsId, params.itemId)).run();
  } else if (kind === "test") {
    db.delete(rtmLinks).where(eq(rtmLinks.tcId, params.itemId)).run();
  } else if (kind === "br") {
    db.update(functionalRequirements).set({ brId: null }).where(eq(functionalRequirements.brId, params.itemId)).run();
  }
  db.delete(table).where(eq(table.id, params.itemId)).run();
  return json({ deleted: true });
});

// DELETE /api/projects/:id/rtm — wipe all RTM data for the project
router.delete("projects/:id/rtm", ({ params }) => {
  const id = params.id;
  db.delete(rtmLinks).where(eq(rtmLinks.projectId, id)).run();
  db.delete(testCases).where(eq(testCases.projectId, id)).run();
  db.delete(designSolutions).where(eq(designSolutions.projectId, id)).run();
  db.delete(functionalRequirements).where(eq(functionalRequirements.projectId, id)).run();
  db.delete(businessRequirements).where(eq(businessRequirements.projectId, id)).run();
  return json({ deleted: true });
});

/** Escape a markdown table cell (pipe + newlines). */
function cell(v: unknown): string {
  return String(v ?? "").replace(/\|/g, "\\|").replace(/\s*\n+\s*/g, " ").trim();
}

/** Serialize the DB state into the canonical RTM.md format (matches the parser). */
function toRtmMarkdown(brs: any[], frs: any[], designs: any[], tests: any[], links: any[]): string {
  const designById = new Map(designs.map((d) => [d.id, d]));
  const testById = new Map(tests.map((t) => [t.id, t]));
  const brById = new Map(brs.map((b) => [b.id, b]));

  const dsCodesFor = (frId: string) => links.filter((l) => l.frId === frId && l.dsId).map((l) => designById.get(l.dsId)?.code).filter(Boolean);
  const tcCodesFor = (frId: string) => links.filter((l) => l.frId === frId && l.tcId).map((l) => testById.get(l.tcId)?.code).filter(Boolean);

  const lines: string[] = [];
  lines.push("# Requirement Traceability Matrix", "");

  lines.push("## Business Requirements", "| ID | Title | Description |", "|----|-------|-------------|");
  for (const b of brs) lines.push(`| ${cell(b.code)} | ${cell(b.title)} | ${cell(b.description)} |`);
  lines.push("");

  lines.push("## Design Solutions", "| ID | Title | Source | Description |", "|----|-------|--------|-------------|");
  for (const d of designs) lines.push(`| ${cell(d.code)} | ${cell(d.title)} | ${cell(d.sourceRef)} | ${cell(d.description)} |`);
  lines.push("");

  lines.push("## Test Cases", "| ID | Title | Steps | Expected |", "|----|-------|-------|----------|");
  for (const t of tests) lines.push(`| ${cell(t.code)} | ${cell(t.title)} | ${cell(t.steps)} | ${cell(t.expected)} |`);
  lines.push("");

  lines.push("## Functional Requirements", "| ID | BR | Title | Description | Design Solution | Test Case |", "|----|----|-------|-------------|-----------------|-----------|");
  for (const f of frs) {
    const brCode = f.brId ? brById.get(f.brId)?.code ?? "" : "";
    lines.push(`| ${cell(f.code)} | ${cell(brCode)} | ${cell(f.title)} | ${cell(f.description)} | ${dsCodesFor(f.id).join("; ")} | ${tcCodesFor(f.id).join("; ")} |`);
  }
  lines.push("");
  return lines.join("\n");
}


