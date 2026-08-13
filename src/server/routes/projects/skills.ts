import { eq } from "drizzle-orm";
import { json, notFound } from "../../http/response";
import { Router } from "../../http/router";
import { defaultRoot, getProject } from "../../http/route-utils";
import { db } from "~/server/db/client";
import { projects } from "~/server/db/schema";

export const router = new Router();

// GET /api/projects/:id/skills — detect status
router.get("projects/:id/skills", async ({ params }) => {
  const proj = getProject(params.id);
  if (!proj) return notFound();
  const rootPath = proj.rootPath || defaultRoot();
  const { detectProjectSkills } = await import("~/lib/project-skills");
  const statuses = detectProjectSkills(rootPath);
  const ready = statuses.every((s) => s.status === "installed");
  const outdated = !ready && statuses.some((s) => s.status === "outdated") && statuses.every((s) => s.status === "installed" || s.status === "outdated");
  if (ready && proj.skillsStatus !== "ready") {
    db.update(projects).set({ skillsStatus: "ready", skillsError: null, skillsUpdatedAt: new Date().toISOString() }).where(eq(projects.id, params.id)).run();
  } else if (!ready && !outdated && proj.skillsStatus !== "installing" && proj.skillsStatus !== "failed") {
    db.update(projects).set({ skillsStatus: "pending", skillsUpdatedAt: new Date().toISOString() }).where(eq(projects.id, params.id)).run();
  }
  return json({ status: outdated ? "outdated" : ready ? "ready" : proj.skillsStatus, skills: statuses });
});

// POST /api/projects/:id/skills/install — install missing skills (background)
router.post("projects/:id/skills/install", async ({ params }) => {
  const proj = getProject(params.id);
  if (!proj) return notFound();
  if (proj.skillsStatus === "installing") return json({ error: "Installation already in progress" }, 409);
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
    }
  })();
  return json({ started: true, status: "installing" }, 202);
});
