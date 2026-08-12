import { createServerFn } from "@tanstack/react-start";
import { db } from "~/server/db/client";
import { projects, erds } from "~/server/db/schema";
import { eq } from "drizzle-orm";

export const getProjectData = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const project = db.select().from(projects).where(eq(projects.id, data.id)).get();
    const erdList = db.select().from(erds).where(eq(erds.projectId, data.id)).all();
    return { project: project ?? null, erds: erdList };
  });
