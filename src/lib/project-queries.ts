import { createServerFn } from "@tanstack/react-start";

export const loadAllData = createServerFn().handler(async () => {
  const { db } = await import("~/server/db/client");
  const schema = await import("~/server/db/schema");
  return {
    projects: db.select().from(schema.projects).all(),
    erds: db.select().from(schema.erds).all(),
    apiSpecs: db.select().from(schema.apiSpecs).all(),
    apiEndpoints: db.select().from(schema.apiEndpoints).all(),
    wikiPages: db.select().from(schema.wikiPages).all(),
    tasks: db.select().from(schema.tasks).all(),
  };
});
