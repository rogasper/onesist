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
router.get("projects/:id/rtm", ({ params }) => {
  const id = params.id;
  const byCode = (prefix: string) => (rows: { code: string | null }[]) => rows.slice().sort((a, b) => {
    const n = (code: string | null) => {
      const m = code?.match(new RegExp(`${prefix}-(\\d+)`, "i"));
      return m ? parseInt(m[1], 10) : Number.MAX_SAFE_INTEGER;
    };
    return n(a.code) - n(b.code);
  });
  return json({
    brs: byCode("BR")(db.select().from(businessRequirements).where(eq(businessRequirements.projectId, id)).all()),
    frs: byCode("FR")(db.select().from(functionalRequirements).where(eq(functionalRequirements.projectId, id)).all()),
    designs: byCode("DS")(db.select().from(designSolutions).where(eq(designSolutions.projectId, id)).all()),
    tests: byCode("TC")(db.select().from(testCases).where(eq(testCases.projectId, id)).all()),
    links: db.select().from(rtmLinks).where(eq(rtmLinks.projectId, id)).all(),
  });
});

// NOTE: literal routes (links, import) MUST be registered before the
// parameterized `:kind` routes below — the Router returns the first match and
// `/rtm/links` would otherwise hit `/rtm/:kind`.

// POST /api/projects/:id/rtm/links — { frId, dsId? , tcId? }
router.post("projects/:id/rtm/links", async ({ params, body }) => {
  const data = await body();
  const frId = data.frId as string;
  if (!frId) return json({ error: "frId is required" }, 400);
  const dsId = (data.dsId as string) ?? null;
  const tcId = (data.tcId as string) ?? null;
  if (!dsId && !tcId) return json({ error: "Link needs a design solution or test case" }, 400);
  // Avoid duplicates (query by project+fr, then match in JS since null filtering
  // is awkward in drizzle's type-safe eq()).
  const frLinks = db.select().from(rtmLinks)
    .where(and(eq(rtmLinks.projectId, params.id), eq(rtmLinks.frId, frId)))
    .all() as any[];
  const dup = frLinks.find((l: any) => l.dsId === dsId && l.tcId === tcId);
  if (dup) return json(dup, 200);
  const link = {
    id: crypto.randomUUID(),
    projectId: params.id,
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

// POST /api/projects/:id/rtm/import/preview — parse output/rtm/*.md without writing
router.post("projects/:id/rtm/import/preview", async ({ params }) => {
  const proj = getProject(params.id);
  if (!proj) return notFound();
  const rootPath = proj.rootPath || "";
  const files = rtmFiles(rootPath);
  const parsed = files.map((file) => {
    const content = fs.readFileSync(path.join(rootPath, file), "utf-8");
    return { file, data: parseRtmMarkdown(content) };
  });

  const existing = (table: any) => {
    const rows = db.select().from(table).where(eq(table.projectId, params.id)).all() as any[];
    return new Set(rows.map((r) => r.code));
  };
  const brCodes = existing(businessRequirements);
  const frCodes = existing(functionalRequirements);
  const dsCodes = existing(designSolutions);
  const tcCodes = existing(testCases);

  const count = (list: { code: string }[], known: Set<string>) => ({
    total: list.length,
    new: list.filter((x) => !known.has(x.code)).length,
    update: list.filter((x) => known.has(x.code)).length,
  });

  return json({
    files: parsed.map((p) => ({
      file: p.file,
      brs: count(p.data.brs, brCodes),
      frs: count(p.data.frs, frCodes),
      designs: count(p.data.designs, dsCodes),
      tests: count(p.data.tests, tcCodes),
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
  const now = new Date().toISOString();
  let inserted = 0, updated = 0;

  const upsert = (table: any, rows: any[], map: (r: any, id: string) => any) => {
    const existing = db.select().from(table).where(eq(table.projectId, params.id)).all() as any[];
    const byCode = new Map(existing.map((r) => [r.code, r]));
    for (const row of rows) {
      const known = byCode.get(row.code);
      if (known) {
        db.update(table).set({ ...map(row, known.id), updatedAt: now }).where(eq(table.id, known.id)).run();
        updated++;
      } else {
        db.insert(table).values({ ...map(row, crypto.randomUUID()), projectId: params.id, createdAt: now, updatedAt: now, sortOrder: existing.length + inserted }).run();
        inserted++;
      }
    }
  };

  const files = rtmFiles(rootPath);
  for (const file of files) {
    const content = fs.readFileSync(path.join(rootPath, file), "utf-8");
    const parsed = parseRtmMarkdown(content);
    if (parsed.brs.length + parsed.frs.length + parsed.designs.length + parsed.tests.length === 0) continue;

    upsert(businessRequirements, parsed.brs, (r, id) => ({ id, code: r.code, title: r.title, description: r.description ?? null }));
    upsert(designSolutions, parsed.designs, (r, id) => ({ id, code: r.code, title: r.title, description: r.description ?? null, sourceRef: r.sourceRef ?? null }));
    upsert(testCases, parsed.tests, (r, id) => ({ id, code: r.code, title: r.title, description: r.description ?? null, steps: r.steps ?? null, expected: r.expected ?? null }));
    upsert(functionalRequirements, parsed.frs, (r, id) => ({ id, code: r.code, title: r.title, description: r.description ?? null, brId: null }));

    // Resolve BR codes → brId and rebuild links for each FR
    const brByCode = new Map((db.select().from(businessRequirements).where(eq(businessRequirements.projectId, params.id)).all() as any[]).map((r) => [r.code, r.id]));
    for (const fr of parsed.frs) {
      const frRow = db.select().from(functionalRequirements).where(and(eq(functionalRequirements.projectId, params.id), eq(functionalRequirements.code, fr.code))).get() as any;
      if (!frRow) continue;
      const brId = fr.brCode ? (brByCode.get(fr.brCode) ?? null) : null;
      db.update(functionalRequirements).set({ brId }).where(eq(functionalRequirements.id, frRow.id)).run();
      db.delete(rtmLinks).where(eq(rtmLinks.frId, frRow.id)).run();
      const dsIds = fr.dsCodes.map((code) => {
        const row = db.select().from(designSolutions).where(and(eq(designSolutions.projectId, params.id), eq(designSolutions.code, code))).get() as any;
        return row?.id ?? null;
      }).filter(Boolean) as string[];
      const tcIds = fr.tcCodes.map((code) => {
        const row = db.select().from(testCases).where(and(eq(testCases.projectId, params.id), eq(testCases.code, code))).get() as any;
        return row?.id ?? null;
      }).filter(Boolean) as string[];
      for (const dsId of dsIds) {
        db.insert(rtmLinks).values({ id: crypto.randomUUID(), projectId: params.id, frId: frRow.id, dsId, tcId: null, createdAt: now }).run();
      }
      for (const tcId of tcIds) {
        db.insert(rtmLinks).values({ id: crypto.randomUUID(), projectId: params.id, frId: frRow.id, dsId: null, tcId, createdAt: now }).run();
      }
    }
  }

  return json({ inserted, updated });
});

// POST /api/projects/:id/rtm/:kind — create an entity (kind: br|fr|design|test)
router.post("projects/:id/rtm/:kind", async ({ params, body }) => {
  const kind = params.kind as EntityKind;
  if (!KIND_TO_TABLE[kind]) return json({ error: "Unknown entity kind" }, 400);
  const data = await body();
  const table = KIND_TO_TABLE[kind];
  const now = new Date().toISOString();
  const existing = db.select().from(table).where(eq(table.projectId, params.id)).all() as any[];
  const prefix = { br: "BR", fr: "FR", design: "DS", test: "TC" }[kind];

  let code = (data.code as string)?.trim() || nextCode(existing, prefix);
  if (!new RegExp(`^${prefix}-\\d+$`, "i").test(code)) {
    code = nextCode(existing, prefix);
  }

  const values: Record<string, unknown> = {
    id: crypto.randomUUID(),
    projectId: params.id,
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
