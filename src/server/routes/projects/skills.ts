import { eq } from "drizzle-orm";
import { json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { defaultRoot, getProject } from "../../http/route-utils";
import { db } from "~/server/db/client";
import { projects } from "~/server/db/schema";

export const router = new Router();

// Project ids with an install running in THIS process. The database's
// `skillsStatus` is not a reliable "an install is running" flag: if the server
// restarts (or the app is relaunched) while the status is `installing`, nothing
// ever clears it — the banner then sits on "Installing required project skills"
// forever and every retry is answered with 409 "Installation already in
// progress". Track the truth in memory and keep the DB column as history only.
const installingNow = new Set<string>();

// GET /api/projects/:id/skills — detect status
router.get("projects/:id/skills", async ({ params }) => {
  const proj = getProject(params.id);
  if (!proj) return notFound();
  const rootPath = proj.rootPath || defaultRoot();
  const { detectProjectSkills } = await import("~/lib/project-skills");
  const statuses = detectProjectSkills(rootPath);
  const ready = statuses.every((s) => s.status === "installed");
  const outdated = !ready && statuses.some((s) => s.status === "outdated") && statuses.every((s) => s.status === "installed" || s.status === "outdated");
  // What disk says wins over a stale DB column, and "installing" is only reported
  // while an install is actually running in this process.
  const status = ready ? "ready" : outdated ? "outdated" : installingNow.has(params.id) ? "installing" : "pending";
  if (status !== proj.skillsStatus) {
    db.update(projects)
      .set({ skillsStatus: status, skillsUpdatedAt: new Date().toISOString() })
      .where(eq(projects.id, params.id))
      .run();
  }
  return json({ status, skills: statuses });
});

// POST /api/projects/:id/skills/install — install missing skills (background)
router.post("projects/:id/skills/install", async ({ params }) => {
  const proj = getProject(params.id);
  if (!proj) return notFound();
  if (installingNow.has(params.id)) return json({ error: "Installation already in progress" }, 409);
  installingNow.add(params.id);
  db.update(projects).set({ skillsStatus: "installing", skillsError: null, skillsUpdatedAt: new Date().toISOString() }).where(eq(projects.id, params.id)).run();
  const rootPath = proj.rootPath || defaultRoot();
  void (async () => {
    try {
      const { installProjectSkills } = await import("~/lib/project-skills");
      const result = await installProjectSkills(rootPath);
      db.update(projects).set({
        skillsStatus: result.ok ? "ready" : "failed",
        skillsError: result.ok ? null : result.failed.map((f) => `${f.name}: ${f.error}`).join("\n---\n"),
        skillsUpdatedAt: new Date().toISOString(),
      }).where(eq(projects.id, params.id)).run();
    } catch (e: any) {
      db.update(projects).set({
        skillsStatus: "failed",
        skillsError: e?.message ?? String(e),
        skillsUpdatedAt: new Date().toISOString(),
      }).where(eq(projects.id, params.id)).run();
    } finally {
      installingNow.delete(params.id);
    }
  })();
  return json({ started: true, status: "installing" }, 202);
});
