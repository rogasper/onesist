/**
 * Regression (#69): GET /api/projects/:id/handoff?format=monday-csv must use the shared
 * external task card formatter for Description and never leak internal Onesist paths.
 *
 *   bun test src/server/routes/projects/handoff.test.ts
 */
import { beforeAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findInternalTaskLeaks, formatExternalTaskCard } from "~/lib/external-task-card";

process.env.SA_DB_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "onesist-handoff-")), "data.db");

const { db } = await import("~/server/db/client");
const { projects, tasks } = await import("~/server/db/schema");
const { router: handoffRouter } = await import("./handoff");

/** Minimal RFC-4180 CSV parser supporting quoted multiline fields. */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];
    if (inQuotes) {
      if (ch === '"' && csv[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

const SAMPLE_TASK = {
  id: "task-loan-1",
  projectId: "p-monday",
  code: "LOAN-1",
  title: "LOAN-1: Create loan endpoint",
  description: [
    "## Task LOAN-1: Create loan endpoint",
    "",
    "| Field | Detail |",
    "|-------|--------|",
    "| Story Point | 3 |",
    "| Developer | Budi |",
    "| Files Scope | `src/modules/loan/*` |",
    "| Spec Ref | `output/spec/spec_loan.md#NO:3 POST /loans` |",
    "| ERD Ref | `output/erd/erd_loan.dbml#trn_loan` |",
    "| RTM Ref | `FR-001 -> DS-001` |",
    "",
    "### Context",
    "Pengajuan pinjaman dari aplikasi sales (lihat `input/fsd/fsd_loan.md`).",
    "",
    "### Acceptance Criteria",
    "- [ ] Given payload valid When POST /api/v1/loans Then return 201",
    "",
    "![Mockup](input/assets/loan.png)",
    "- Source: `output/task/task_loan.md`",
  ].join("\n"),
  status: "in_progress",
  storyPoints: 3,
  assignee: "Budi",
  module: "loan",
  phase: "Phase 1",
  dependenciesJson: '["AUTH-1"]',
  blocksJson: '["LOAN-2"]',
  sourcePath: "output/task/task_loan.md",
  filesScopeJson: '["src/modules/loan/*"]',
  specRef: "output/spec/spec_loan.md#NO:3 POST /loans",
  erdRef: "output/erd/erd_loan.dbml#trn_loan",
  rtmRef: "FR-001 -> DS-001",
};

beforeAll(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-handoff-ws-"));
  db.insert(projects).values({ id: "p-monday", name: "LoanApp", rootPath: root }).run();
  db.insert(tasks).values(SAMPLE_TASK).run();
});

test("GET /api/projects/:id/handoff?format=monday-csv uses external-task-card output and leaks no internal paths", async () => {
  const res = await handoffRouter.handle(
    new Request("http://localhost:4321/api/projects/p-monday/handoff?format=monday-csv"),
  );
  expect(res).not.toBeNull();
  expect(res!.status).toBe(200);
  const csv = await res!.text();
  const rows = parseCsv(csv);
  expect(rows[0]).toEqual(["Group", "Name", "Description", "Status", "Person", "Numbers (SP)", "Dependency", "Tags"]);
  expect(rows).toHaveLength(2);

  const [group, name, desc, status, person, sp, dep] = rows[1];
  const expected = formatExternalTaskCard(SAMPLE_TASK);
  expect(group).toBe("Phase 1");
  expect(name).toBe("LOAN-1: Create loan endpoint");
  expect(desc).toBe(expected.text);
  expect(status).toBe("In Progress");
  expect(person).toBe("Budi");
  expect(sp).toBe("3");
  expect(dep).toBe("AUTH-1");

  expect(findInternalTaskLeaks(desc)).toEqual([]);
  expect(desc).not.toContain("## Task LOAN-1");
  expect(desc).toContain("- [ ] Given payload valid When POST /api/v1/loans Then return 201");
  expect(desc).toContain("[Gambar: Mockup]");
});
