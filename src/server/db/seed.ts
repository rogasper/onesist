import { db } from "~/server/db/client";
import { projects, erds, apiSpecs, apiEndpoints, tasks, changeLog, wikiPages } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "..");

export function seedIfEmpty() {
  const rows = db.all("SELECT COUNT(*) as cnt FROM projects");
  const count = (rows as any[])[0]?.cnt ?? 0;
  if (count > 0) return;
  // No hardcoded seed — user creates projects by opening a folder
  console.log("[seed] No projects found. Use dashboard to open a folder.");
}

export function seedMissingEndpoints() {}
export function seedTasksFromArtifacts() {}
