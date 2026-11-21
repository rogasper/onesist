/**
 * Regression (#69): every human-facing Monday output (Copy HTML, Monday CSV, Monday MCP)
 * must share one minimal, consistent shape with zero Onesist-internal workspace paths,
 * artifact filenames, planner summary tables, or empty placeholders.
 *
 *   bun test src/lib/external-task-card.test.ts
 */
import { describe, expect, test } from "bun:test";
import {
  findInternalTaskLeaks,
  formatExternalTaskCard,
  formatExternalTaskTitle,
  sanitizeExternalTaskMarkdown,
} from "./external-task-card";

const REALISTIC_LEAKY_DESCRIPTION = [
  "## Task LOAN-1: Create loan application",
  "",
  "| Field | Detail |",
  "|-------|--------|",
  "| Service | POST /api/v1/loans |",
  "| Method | POST |",
  "| Status | New |",
  "| Purpose | Buat pengajuan pinjaman baru |",
  "| Story Point | 3 |",
  "| Duration | 12h |",
  "| Developer | Budi |",
  "| Depends On | AUTH-1 |",
  "| Blocks | LOAN-2 |",
  "| Critical Path | Yes |",
  "| Risk Level | Medium |",
  "| Files Scope | `src/modules/loan/*` |",
  "| Spec Ref | `output/spec/spec_loan.md#NO:3 POST /loans` |",
  "| ERD Ref | `output/erd/erd_loan.dbml#trn_loan` |",
  "| RTM Ref | `FR-001 -> DS-001` |",
  "",
  "### Context",
  "Sales membuat pengajuan pinjaman baru (lihat `input/fsd/fsd_loan.md` bab 3).",
  "",
  "### Deskripsi",
  "Endpoint ini memvalidasi payload dan menyimpan transaksi ke `trn_loan` (ref `output/erd/erd_loan.dbml#trn_loan`).",
  "",
  "### Scope",
  "- Validasi tenor 12-60 bulan dan nominal pinjaman",
  "- Simpan record ke `trn_loan` sesuai `MASTER_ERD.md`",
  "- Lihat `output/spec/spec_loan.md` untuk detail error",
  "",
  "### Out of scope",
  "- Approval berjenjang",
  "",
  "### Acceptance Criteria",
  "- [ ] Given payload valid When POST /api/v1/loans Then status 201 dan id tersimpan",
  "- [x] Given tenor > 60 When POST /api/v1/loans Then status 400",
  "",
  "### Flow Logic (step by step)",
  "1. Verifikasi JWT dan role sales.",
  "2. Validasi payload sesuai aturan bisnis.",
  "3. Insert transaksi ke `trn_loan` dan kembalikan response 201.",
  "",
  "### Request",
  "```json",
  '{ "amount": 50000000, "tenor": 12 }',
  "```",
  "",
  "### Response (200)",
  "```json",
  '{ "id": "ln_123", "status": "created" }',
  "```",
  "",
  "### Output — Design image",
  "![Loan form — desktop](input/assets/loan-form.png)",
  "Figma: https://figma.com/design/abc?node-id=1-2",
  "",
  "### Output — UI Copy",
  "| Elemen | Teks eksak (dari Figma) |",
  "|--------|-------------------------|",
  "| Button submit | Ajukan Pinjaman |",
  "",
  "### Notes",
  "- Wajib kirim header `Idempotency-Key`.",
  "- Source: `output/task/task_loan.md`",
  "- Cek juga `tasks.json`, `.agents/skills/fsd-analyzer/SKILL.md`, `data.db`, `LOAN-1.prompt.md`, dan `MASTER_SPEC_API.md`.",
].join("\n");

describe("formatExternalTaskCard", () => {
  test("strips planner table, duplicate heading, and every internal Onesist path/artifact", () => {
    const card = formatExternalTaskCard({
      code: "LOAN-1",
      title: "LOAN-1: Create loan application",
      description: REALISTIC_LEAKY_DESCRIPTION,
      status: "in_progress",
      storyPoints: 3,
      assignee: "Budi",
      module: "loan",
      phase: "Phase 1",
      dependenciesJson: '["AUTH-1"]',
      blocksJson: '["LOAN-2"]',
    });

    expect(card.title).toBe("LOAN-1: Create loan application");
    expect(card.group).toBe("Phase 1");
    expect(card.fields).toEqual([
      { label: "Assignee", value: "Budi" },
      { label: "Status", value: "In Progress" },
      { label: "Story Points", value: "3 SP" },
      { label: "Depends On", value: "AUTH-1" },
      { label: "Blocks", value: "LOAN-2" },
    ]);

    // Zero internal leaks in HTML, plain text, or sanitized markdown.
    expect(findInternalTaskLeaks(card.html)).toEqual([]);
    expect(findInternalTaskLeaks(card.text)).toEqual([]);
    expect(findInternalTaskLeaks(card.bodyMarkdown)).toEqual([]);

    for (const forbidden of [
      "output/",
      "input/",
      ".agents/",
      "data.db",
      "tasks.json",
      "MASTER_ERD.md",
      "MASTER_SPEC_API.md",
      "task_loan.md",
      "spec_loan.md",
      "erd_loan.dbml",
      "LOAN-1.prompt.md",
      "Files Scope",
      "Spec Ref",
      "ERD Ref",
      "RTM Ref",
      "src/modules/loan/*",
    ]) {
      expect(card.html).not.toContain(forbidden);
      expect(card.text).not.toContain(forbidden);
    }

    // Heading appears once, never duplicated by `## Task LOAN-1: ...`.
    expect(card.html.match(/<h2>/g)?.length).toBe(1);
    expect(card.html).toContain("<h2>LOAN-1: Create loan application</h2>");
    expect(card.html).not.toContain("Task LOAN-1");

    // Legitimate developer content stays intact.
    expect(card.html).toContain("POST /api/v1/loans");
    expect(card.html).toContain('type="checkbox"');
    expect(card.html).toContain("[Gambar: Loan form — desktop]");
    expect(card.html).not.toContain("<img");
    expect(card.html).toContain("https://figma.com/design/abc?node-id=1-2");
    expect(card.html).toContain("Ajukan Pinjaman");
    expect(card.html).toContain("Idempotency-Key");
    expect(card.html).toContain("50000000");

    // Plain-text fallback stays synced with HTML, including checklists and image placeholder.
    expect(card.text).toContain("LOAN-1: Create loan application");
    expect(card.text).toContain("- [ ] Given payload valid When POST /api/v1/loans Then status 201 dan id tersimpan");
    expect(card.text).toContain("- [x] Given tenor > 60 When POST /api/v1/loans Then status 400");
    expect(card.text).toContain("[Gambar: Loan form — desktop]");
    expect(card.text).toContain("Idempotency-Key");
  });

  test("omits empty/placeholder fields instead of rendering em-dashes or Unassigned", () => {
    const card = formatExternalTaskCard({
      code: "FE-2",
      title: "Halaman Login",
      description: "### Scope\n- Form login email & password",
      status: "todo",
      storyPoints: null,
      assignee: null,
      module: "auth",
      phase: null,
      dependenciesJson: '["—", ""]',
      blocksJson: null,
    });

    expect(card.title).toBe("FE-2: Halaman Login");
    expect(card.group).toBe("auth");
    expect(card.fields).toEqual([{ label: "Status", value: "To Do" }]);
    expect(card.html).not.toContain("Unassigned");
    expect(card.html).not.toContain("Story Points");
    expect(card.html).not.toContain("Module");
    expect(card.html).not.toContain("Depends On");
    expect(card.html).not.toContain("Blocks");
    expect(card.html).not.toContain("—");
  });

  test("appends Acceptance Criteria checklist from task record when missing in body", () => {
    const card = formatExternalTaskCard({
      code: "API-3",
      title: "Logout endpoint",
      description: "### Deskripsi\nMenghapus sesi aktif user.",
      status: "todo",
      acceptanceCriteriaJson: '["Token dicabut dan mengembalikan 204", "Lihat output/spec/spec_auth.md"]',
    });

    expect(card.html).toContain("<h3>Acceptance Criteria</h3>");
    expect(card.text).toContain("- [ ] Token dicabut dan mengembalikan 204");
    expect(findInternalTaskLeaks(card.html)).toEqual([]);
    expect(findInternalTaskLeaks(card.text)).toEqual([]);
  });

  test("strips Files Scope sections and compact horizontal dependency tables", () => {
    const md = [
      "| Depends On | — | Blocks | T2, T3 | Critical | Yes |",
      "",
      "### Files Scope",
      "- `src/modules/auth/*`",
      "",
      "### Scope",
      "- Validasi OTP 6 digit",
    ].join("\n");

    const sanitized = sanitizeExternalTaskMarkdown(md);
    expect(sanitized).toBe("### Scope\n- Validasi OTP 6 digit");
  });

  test("scrubs internal artifact names inside headings, bold spans, and ../../ relative markdown links", () => {
    const md = [
      "#### SQL — ekspresi turunan (contoh CTE; selaras `spec_api_summary.md` NO A4)",
      "- Selaras **`task_leads.md`** (C1) dan **`spec_api_leads.md`**. Perubahan harus ikut di **A4b**.",
      "Sama dengan [`all_spec_api_existing.md`](../../input/fsd/all_spec_api_existing.md) untuk `/leads/send-leads`.",
    ].join("\n");

    const sanitized = sanitizeExternalTaskMarkdown(md);
    expect(findInternalTaskLeaks(sanitized)).toEqual([]);
    expect(sanitized).not.toContain("spec_api_summary.md");
    expect(sanitized).not.toContain("all_spec_api_existing.md");
    expect(sanitized).not.toContain("../../input/");
    expect(sanitized).not.toContain("****");
    expect(sanitized).toContain("#### SQL — ekspresi turunan");
    expect(sanitized).toContain("/leads/send-leads");
    expect(sanitized).toContain("**A4b**");
  });

  test("scrubs relative ../md links, trailing HR separators, backticks in title, and whitespace inside bold after link removal", () => {
    const card = formatExternalTaskCard({
      code: "TSL-1",
      title: "Database — `tsl_activity_logs` + UNIQUE profil",
      description: [
        "1. Pastikan migrasi **[task_fsd_role_tsl.md](task_fsd_role_tsl.md) Task 1** selesai.",
        "2. Flow existing: JWT, pagination/search/sort — [existing_cms_tsl_management.md](../spec/existing_cms_tsl_management.md).",
        "",
        "---",
      ].join("\n"),
      status: "done",
      storyPoints: 1,
    });

    expect(card.title).toBe("TSL-1: Database — tsl_activity_logs + UNIQUE profil");
    expect(card.html).toContain("<h2>TSL-1: Database — tsl_activity_logs + UNIQUE profil</h2>");
    expect(card.html).toContain("<strong>Task 1</strong>");
    expect(card.html).not.toContain("** Task 1**");
    expect(card.html).not.toContain("../spec/");
    expect(card.html).not.toContain("existing_cms_tsl_management.md");
    expect(card.html).not.toMatch(/<hr\s*\/?>\s*$/);
    expect(findInternalTaskLeaks(card.html)).toEqual([]);
  });

  test("preserves colons inside titles when formatting title with code", () => {
    expect(formatExternalTaskTitle("BE-01", "POST /loans: validasi limit")).toBe("BE-01: POST /loans: validasi limit");
    expect(formatExternalTaskTitle("BE-01", "BE-01: POST /loans: validasi limit")).toBe("BE-01: POST /loans: validasi limit");
  });

  test("findInternalTaskLeaks detects regressions when any internal path or handoff field leaks", () => {
    expect(findInternalTaskLeaks("lihat output/task/task_a.md")).toContain("output/task/task_a.md");
    expect(findInternalTaskLeaks("gambar input/assets/a.png")).toContain("input/assets/a.png");
    expect(findInternalTaskLeaks("cek .agents/skills/a.md dan data.db")).toEqual(
      expect.arrayContaining([".agents/skills/a.md", "data.db"]),
    );
    expect(findInternalTaskLeaks("Spec Ref: foo")).toContain("Spec Ref");
    expect(findInternalTaskLeaks("<td><strong>Source</strong></td>")).toContain("Source");
  });
});
