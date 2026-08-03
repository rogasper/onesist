import { createServerFn } from "@tanstack/react-start";

export const getProjectData = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { db } = await import("~/server/db/client");
    const { projects, erds } = await import("~/server/db/schema");
    const { eq } = await import("drizzle-orm");
    const project = db.select().from(projects).where(eq(projects.id, data.id)).get();
    const erdList = db.select().from(erds).where(eq(erds.projectId, data.id)).all();
    return { project: project ?? null, erds: erdList };
  });
