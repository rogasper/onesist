/**
 * Regression (#69): the read-only task_external_card / onesist_task_card tool returns
 * the exact same sanitized Monday-friendly card as Copy HTML and Monday CSV, scoped to
 * one project and free of Onesist-internal paths.
 *
 *   bun test src/server/agent/task-card-tool.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findInternalTaskLeaks, formatExternalTaskCard } from "~/lib/external-task-card";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-task-card-tool-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, tasks } = await import("~/server/db/schema");
const { buildTaskCardTool } = await import("./task-card-tool");

const SAMPLE_ROW = {
  id: "t-loan-1",
  projectId: "p-a",
  code: "LOAN-1",
  title: "LOAN-1: Create loan application",
  description: [
    "## Task LOAN-1: Create loan application",
    "",
    "| Field | Detail |",
    "|-------|--------|",
    "| Story Point | 5 |",
    "| Files Scope | `src/modules/loan/*` |",
    "| Spec Ref | `output/spec/spec_loan.md#NO:1` |",
    "| ERD Ref | `output/erd/erd_loan.dbml#trn_loan` |",
    "| RTM Ref | `FR-1 -> DS-1` |",
    "",
    "### Scope",
    "- Validasi pengajuan (lihat `input/fsd/fsd_loan.md`)",
    "",
    "### Acceptance Criteria",
    "- [ ] Given valid input When POST /api/v1/loans Then return 201",
    "",
    "![Mockup](input/assets/loan.png)",
  ].join("\n"),
  status: "todo",
  storyPoints: 5,
  assignee: "Sari",
  module: "loan",
  phase: "Phase 1",
  dependenciesJson: '["AUTH-1"]',
  blocksJson: '["LOAN-2"]',
  sourcePath: "output/task/task_loan.md",
  specRef: "output/spec/spec_loan.md#NO:1",
  erdRef: "output/erd/erd_loan.dbml#trn_loan",
  rtmRef: "FR-1 -> DS-1",
  filesScopeJson: '["src/modules/loan/*"]',
};

beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-task-card-ws-"));
  db.insert(projects).values({ id: "p-a", name: "Project A", rootPath: root }).run();
  db.insert(projects).values({ id: "p-b", name: "Project B", rootPath: root }).run();
  db.insert(tasks).values(SAMPLE_ROW).run();
  db.insert(tasks)
    .values({
      id: "t-other",
      projectId: "p-b",
      code: "OTHER-1",
      title: "OTHER-1: Secret task",
      description: "Internal only",
      status: "todo",
    })
    .run();
});

test("returns sanitized external card matching formatExternalTaskCard for a task code", async () => {
  const { taskExternalCard } = buildTaskCardTool("p-a");
  const raw = await taskExternalCard.execute!({ code: "loan-1" }, {} as any);
  const parsed = JSON.parse(String(raw));
  expect(parsed.cards).toHaveLength(1);

  const card = parsed.cards[0];
  const expected = formatExternalTaskCard(SAMPLE_ROW);
  expect(card.title).toBe(expected.title);
  expect(card.group).toBe("Phase 1");
  expect(card.fields).toEqual(expected.fields);
  expect(card.html).toBe(expected.html);
  expect(card.text).toBe(expected.text);

  expect(findInternalTaskLeaks(card.html)).toEqual([]);
  expect(findInternalTaskLeaks(card.text)).toEqual([]);
});

test("lists active project tasks when called without id/code and isolates projects", async () => {
  const { taskExternalCard } = buildTaskCardTool("p-a");
  const raw = await taskExternalCard.execute!({}, {} as any);
  const parsed = JSON.parse(String(raw));
  expect(parsed.total).toBe(1);
  expect(parsed.tasks[0].code).toBe("LOAN-1");

  // Asking for another project's task fails cleanly.
  await expect(taskExternalCard.execute!({ code: "OTHER-1" }, {} as any)).rejects.toThrow("Task tidak ditemukan");
});
