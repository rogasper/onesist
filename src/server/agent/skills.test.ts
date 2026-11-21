/**
 * Regression (#69): bundled `monday-task` skill is discoverable by native chat
 * (`resolveSkills` / `readSkill`) and installable into project `.agents/skills/`
 * via `installProjectSkills` for external CLI agents.
 *
 *   bun test src/server/agent/skills.test.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "bun:test";
import { detectProjectSkills, installProjectSkills, REQUIRED_SKILLS } from "~/lib/project-skills";
import { readSkill, resolveSkills, SKILL_LIMITS, skillSummaries } from "./skills";

const tempDirs: string[] = [];

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-skills-test-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()!;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bundled monday-task skill is discovered via vendor layer with untruncated summary", () => {
  const projectRoot = makeTempProject();
  const emptyUserSkills = makeTempProject();

  const skills = resolveSkills(projectRoot, { userDir: emptyUserSkills });
  const monday = skills.find((s) => s.name === "monday-task");
  expect(monday).toBeDefined();
  expect(monday!.source).toBe("vendor");
  expect(monday!.description.length).toBeGreaterThan(20);
  expect(monday!.description.length).toBeLessThanOrEqual(SKILL_LIMITS.descriptionChars);

  const summary = skillSummaries(skills).find((s) => s.name === "monday-task");
  expect(summary).toBeDefined();
  expect(summary!.description).toBe(monday!.description);
});

test("readSkill returns monday-task workflow rules for Item+Update and Parent->Subitem+Update", () => {
  const projectRoot = makeTempProject();
  const res = readSkill(projectRoot, "monday-task");
  expect(res.ok).toBe(true);
  if (!res.ok) return;

  expect(res.content).toContain("task_external_card");
  expect(res.content).toContain("onesist_task_card");
  expect(res.content).toContain("Item → Update");
  expect(res.content).toContain("Parent Item → Subitem → Update");
  expect(res.content).toContain("Monday Update");
  expect(res.content).toContain("Files Scope");
  expect(res.content).toContain("output/task/*.md");
});

test("REQUIRED_SKILLS includes monday-task and installProjectSkills copies it cleanly", async () => {
  expect(REQUIRED_SKILLS.some((s) => s.name === "monday-task")).toBe(true);

  const projectRoot = makeTempProject();
  const before = detectProjectSkills(projectRoot).find((s) => s.name === "monday-task");
  expect(before?.status).toBe("missing");

  const result = await installProjectSkills(projectRoot);
  expect(result.ok).toBe(true);
  expect(result.installed).toContain("monday-task");

  const after = detectProjectSkills(projectRoot).find((s) => s.name === "monday-task");
  expect(after?.status).toBe("installed");
  expect(after?.version).toBe("1.0.0");
  expect(fs.existsSync(path.join(projectRoot, ".agents", "skills", "monday-task", "SKILL.md"))).toBe(true);
});
