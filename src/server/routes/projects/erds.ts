import { eq } from "drizzle-orm";
import { json } from "../../http/response";
import { Router } from "../../http/router";
import { db } from "~/server/db/client";
import { erds } from "~/server/db/schema";

export const router = new Router();

// GET /api/projects/:id/erds
router.get("projects/:id/erds", ({ params }) => {
  const result = db.select().from(erds).where(eq(erds.projectId, params.id)).all();
  return json(result);
});

// POST /api/projects/:id/erds
router.post("projects/:id/erds", async ({ params, body }) => {
  const data = await body();
  const erdId = crypto.randomUUID();
  const erd = {
    id: erdId,
    projectId: params.id,
    name: (data.name as string) ?? "Master ERD",
    dbmlContent: (data.dbmlContent as string) ?? "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.insert(erds).values(erd).run();
  return json(erd, 201);
});
