import { eq } from "drizzle-orm";
import { json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { db } from "~/server/db/client";
import { wikiPages } from "~/server/db/schema";

export const router = new Router();

// GET /api/projects/:id/wiki
router.get("projects/:id/wiki", ({ params }) => {
  const result = db.select().from(wikiPages).where(eq(wikiPages.projectId, params.id)).all();
  return json(result);
});

// POST /api/projects/:id/wiki
router.post("projects/:id/wiki", async ({ params, body }) => {
  const data = await body();
  const now = new Date().toISOString();
  const pageId = crypto.randomUUID();
  const slug = (data.slug as string) || ((data.title as string) || "untitled")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "untitled";
  const page = {
    id: pageId,
    projectId: params.id,
    title: (data.title as string) ?? "Untitled",
    slug,
    contentMd: (data.contentMd as string) ?? "",
    parentId: (data.parentId as string) ?? null,
    sortOrder: (data.sortOrder as number) ?? 0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(wikiPages).values(page).run();
  return json(page, 201);
});

// GET /api/projects/:id/wiki/:pageId
router.get("projects/:id/wiki/:pageId", ({ params }) => {
  const result = db.select().from(wikiPages).where(eq(wikiPages.id, params.pageId)).get();
  return result ? json(result) : notFound();
});

// PUT /api/projects/:id/wiki/:pageId
router.put("projects/:id/wiki/:pageId", async ({ params, body }) => {
  const data = await body();
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updatedAt: now };
  if (data.title !== undefined) updates.title = data.title;
  if (data.contentMd !== undefined) updates.contentMd = data.contentMd;
  if (data.parentId !== undefined) updates.parentId = data.parentId;
  if (data.sortOrder !== undefined) updates.sortOrder = data.sortOrder;
  db.update(wikiPages).set(updates).where(eq(wikiPages.id, params.pageId)).run();
  const updated = db.select().from(wikiPages).where(eq(wikiPages.id, params.pageId)).get();
  return json(updated);
});

// DELETE /api/projects/:id/wiki/:pageId
router.delete("projects/:id/wiki/:pageId", ({ params }) => {
  db.delete(wikiPages).where(eq(wikiPages.id, params.pageId)).run();
  return json({ deleted: true });
});
