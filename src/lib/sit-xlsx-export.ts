import ExcelJS from "exceljs";
import type { SitDataset, SitTestCase, SitStep, SitBrowserResult } from "~/shared/sit-types";
import { parseSitTestCase, scanSitDirectory } from "~/lib/sit-parser";
import path from "node:path";
import fs from "node:fs";

const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } } as const;
const HEADER_FONT = { color: { argb: "FFFFFFFF" }, bold: true, size: 10 } as const;
const PASS_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2EFDA" } } as const;
const FAIL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFCE4D6" } } as const;
const BORDER_THIN = {
  top: { style: "thin" },
  bottom: { style: "thin" },
  left: { style: "thin" },
  right: { style: "thin" },
} as const;

function setHeaderRow(ws: ExcelJS.Worksheet, data: string[]) {
  const row = ws.getRow(1);
  for (let i = 0; i < data.length; i++) {
    const cell = row.getCell(i + 1);
    cell.value = data[i];
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = BORDER_THIN;
  }
  row.height = 32;
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: data.length } };
  // Frozen header row — explicit topLeftCell keeps the <pane>/<selection>
  // elements consistent so Excel does not flag the workbook for repair.
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1, topLeftCell: "A2", activeCell: "A2" }];
}

function statusFill(status: string | null): Partial<ExcelJS.Style> {
  if (!status) return {};
  if (/pass/i.test(status)) return { fill: PASS_FILL };
  if (/fail/i.test(status)) return { fill: FAIL_FILL };
  return {};
}

async function buildCover(ws: ExcelJS.Worksheet, data: SitDataset) {
  const title = (r: number, c: number, text: string, bold = true, size = 14) => {
    const cell = ws.getCell(r, c);
    cell.value = text;
    cell.font = { bold, size };
    cell.alignment = { vertical: "middle" };
  };

  title(3, 3, "SYSTEM INTEGRATION TEST", true, 18);
  title(4, 3, data.summary?.version || `SIT/${data.summary?.project || "Project"}/v1`);

  const infoStart = 6;
  const info: Array<[string, string]> = [
    ["Project Name", data.summary?.project || ""],
    ["Created By", data.summary?.testers.join(", ") || ""],
    ["Created On", data.summary?.created || ""],
    ["Total TC Groups", String(data.summary?.overall.totalTcGroups || data.files.length)],
    ["Total Steps", String(data.summary?.overall.totalSteps || 0)],
    ["Total Passed", String(data.summary?.overall.totalPassed || 0)],
    ["Total Failed", String(data.summary?.overall.totalFailed || 0)],
    ["Readiness", `${data.summary?.overall.readinessPercentage || 0}%`],
  ];

  for (let i = 0; i < info.length; i++) {
    ws.getCell(infoStart + i, 3).value = info[i][0];
    ws.getCell(infoStart + i, 3).font = { bold: true, size: 11 };
    ws.getCell(infoStart + i, 4).value = info[i][1];
    ws.getCell(infoStart + i, 4).font = { size: 11 };
  }

  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 4;
  ws.getColumn(3).width = 24;
  ws.getColumn(4).width = 40;
  ws.getColumn(5).width = 8;
}

async function buildSummary(ws: ExcelJS.Worksheet, data: SitDataset) {
  const summary = data.summary;
  if (!summary) return;

  ws.getCell(2, 2).value = "Report Progress QC";
  ws.getCell(2, 2).font = { bold: true, size: 12 };

  const overallRow = 4;
  ws.getCell(overallRow, 2).value = "Overall Summary";
  ws.getCell(overallRow, 2).font = { bold: true, size: 11 };
  ws.getCell(overallRow + 1, 2).value = `Total Steps: ${summary.overall.totalSteps}`;
  ws.getCell(overallRow + 1, 3).value = `Passed: ${summary.overall.totalPassed}`;
  ws.getCell(overallRow + 1, 4).value = `Failed: ${summary.overall.totalFailed}`;
  ws.getCell(overallRow + 1, 5).value = `Readiness: ${summary.overall.readinessPercentage}%`;

  const headerRow = overallRow + 3;
  const headers = ["No", "TC ID", "Scenario", "Steps", "Tested", "Pass", "Fail", "Progress", "Status", "PIC"];
  const row = ws.getRow(headerRow);
  for (let i = 0; i < headers.length; i++) {
    const cell = row.getCell(i + 1);
    cell.value = headers[i];
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = BORDER_THIN;
  }
  row.height = 24;
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: headers.length } };
  // Freeze above the table header (row headerRow). topLeftCell must point at
  // the first row below the split for the pane to be valid.
  ws.views = [{
    state: "frozen",
    xSplit: 0,
    ySplit: headerRow,
    topLeftCell: `A${headerRow + 1}`,
    activeCell: `A${headerRow + 1}`,
  }];

  summary.rows.forEach((r, idx) => {
    const dataRow = ws.getRow(headerRow + 1 + idx);
    const values = [idx + 1, r.tcId, r.scenario, r.totalSteps, r.tested, r.passed, r.failed, r.progress, r.status, r.pic];
    for (let i = 0; i < values.length; i++) {
      const cell = dataRow.getCell(i + 1);
      cell.value = values[i];
      cell.border = BORDER_THIN;
      if (i === 8) Object.assign(cell, statusFill(r.status));
    }
    dataRow.height = 20;
  });

  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 50;
  ws.getColumn(4).width = 10;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 10;
  ws.getColumn(7).width = 10;
  ws.getColumn(8).width = 18;
  ws.getColumn(9).width = 15;
  ws.getColumn(10).width = 20;
}

async function buildBoardChecklist(ws: ExcelJS.Worksheet, data: SitDataset) {
  const headers = ["No", "TC ID", "MENU", "PIC", "Activity", "STATUS TESTING", "FIRST PASS", "FIRST FAIL", "LAST PASS", "LAST FAIL"];
  setHeaderRow(ws, headers);

  const files = data.files;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const row = ws.getRow(i + 2);
    const values = [
      i + 1,
      f.metadata.tcId,
      f.metadata.title,
      f.metadata.tester || "",
      f.stepCount,
      f.metadata.status,
      f.passedSteps,
      f.failedSteps,
      f.passedSteps,
      f.failedSteps,
    ];
    for (let j = 0; j < values.length; j++) {
      const cell = row.getCell(j + 1);
      cell.value = values[j];
      cell.border = BORDER_THIN;
      if (j === 5) Object.assign(cell, statusFill(f.metadata.status));
    }
    row.height = 20;
  }

  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 10;
  ws.getColumn(3).width = 50;
  ws.getColumn(4).width = 15;
  ws.getColumn(5).width = 10;
  ws.getColumn(6).width = 15;
  ws.getColumn(7).width = 12;
  ws.getColumn(8).width = 12;
  ws.getColumn(9).width = 12;
  ws.getColumn(10).width = 12;
}

async function buildTestCaseSheet(wb: ExcelJS.Workbook, tc: SitTestCase) {
  const ws = wb.addWorksheet(tc.metadata.tcId);

  ws.getCell(1, 1).value = `Test Case ID`;
  ws.getCell(1, 1).font = { bold: true };
  ws.getCell(1, 2).value = tc.metadata.tcId;
  ws.getCell(1, 3).value = `Title`;
  ws.getCell(1, 3).font = { bold: true };
  ws.getCell(1, 4).value = tc.metadata.title;
  ws.getCell(1, 5).value = `Description`;
  ws.getCell(1, 5).font = { bold: true };
  ws.getCell(1, 6).value = tc.metadata.description;
  ws.getCell(1, 7).value = `Tester`;
  ws.getCell(1, 7).font = { bold: true };
  ws.getCell(1, 8).value = tc.metadata.tester || "";
  ws.getCell(1, 9).value = `Status`;
  ws.getCell(1, 9).font = { bold: true };
  ws.getCell(1, 10).value = tc.metadata.status;
  Object.assign(ws.getCell(1, 10), statusFill(tc.metadata.status));
  ws.getRow(1).height = 22;

  const headers = [
    "No", "NO TC", "MENU", "FEATURES", "USER STORY", "STEP", "DATA INPUT",
    "EXPECTED RESULT", "TYPE TEST", "TESTED", "STATUS FIRST TEST",
    "PIC", "FIRST TEST DATE", "ACTUAL RESULT", "STATUS LAST TEST",
    "LAST TEST DATE", "LAST ACTUAL", "EVIDENCE", "BUG", "FINAL RESULT", "FINAL STATUS"
  ];
  setHeaderRow(ws, headers);

  let rowNum = 2;
  for (const step of tc.steps) {
    const stepFirst = rowNum;
    const stepRows = Math.max(1, step.browserResults.length);

    for (let bi = 0; bi < stepRows; bi++) {
      const br: SitBrowserResult = step.browserResults[bi] || {
        browser: "Unknown", tested: null, firstStatus: null, pic: null,
        firstDate: null, actualResult: null, lastStatus: null, lastDate: null,
        lastActual: null, evidence: null,
      };

      const rowValues = [
        bi === 0 ? step.no : "",
        bi === 0 ? step.code : "",
        bi === 0 ? step.menu : "",
        bi === 0 ? step.feature : "",
        bi === 0 ? step.userStory : "",
        bi === 0 ? step.steps.join("\n") : "",
        bi === 0 ? (step.dataInput || "") : "",
        bi === 0 ? step.expected : "",
        bi === 0 ? step.typeTest : "",
        bi === 0 ? step.tested : "",
        br.firstStatus,
        br.pic,
        br.firstDate,
        br.actualResult,
        br.lastStatus,
        br.lastDate,
        br.lastActual,
        br.evidence,
        bi === 0 ? (step.bugRefs.join(", ") || "") : "",
        bi === 0 ? (step.finalResult || "") : "",
        bi === 0 ? (step.finalStatus || "") : "",
      ];

      const row = ws.getRow(rowNum);
      for (let j = 0; j < rowValues.length; j++) {
        const cell = row.getCell(j + 1);
        cell.value = rowValues[j];
        cell.border = BORDER_THIN;
        cell.alignment = { vertical: "top", wrapText: true };
        if (j === 10) Object.assign(cell, statusFill(br.firstStatus));
        if (j === 14) Object.assign(cell, statusFill(br.lastStatus));
        if (j === 19 && bi === 0) Object.assign(cell, statusFill(step.finalResult));
      }
      row.height = 28;
      rowNum++;
    }

    if (stepRows > 1) {
      const mergeCols = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 18, 19, 20];
      for (const col of mergeCols) {
        ws.mergeCells(stepFirst, col + 1, stepFirst + stepRows - 1, col + 1);
      }
    }
  }

  ws.getColumn(1).width = 5;
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 20;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 40;
  ws.getColumn(6).width = 50;
  ws.getColumn(7).width = 25;
  ws.getColumn(8).width = 50;
  ws.getColumn(9).width = 12;
  ws.getColumn(10).width = 12;
  ws.getColumn(11).width = 15;
  ws.getColumn(12).width = 12;
  ws.getColumn(13).width = 15;
  ws.getColumn(14).width = 40;
  ws.getColumn(15).width = 14;
  ws.getColumn(16).width = 14;
  ws.getColumn(17).width = 30;
  ws.getColumn(18).width = 16;
  ws.getColumn(19).width = 15;
  ws.getColumn(20).width = 12;
  ws.getColumn(21).width = 14;
}

export async function buildSitXlsx(rootPath: string): Promise<Buffer> {
  const data = scanSitDirectory(rootPath);
  const tcs: SitTestCase[] = [];

  for (const entry of data.files) {
    const content = fs.readFileSync(path.join(rootPath, entry.relativePath), "utf-8");
    tcs.push(parseSitTestCase(content));
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "SA Dashboard";
  wb.created = new Date();

  const coverWs = wb.addWorksheet("COVER");
  await buildCover(coverWs, data);

  const summaryWs = wb.addWorksheet("SUMMARY");
  await buildSummary(summaryWs, data);

  const boardWs = wb.addWorksheet("BOARD CHECKLIST");
  await buildBoardChecklist(boardWs, data);

  const usedNames = new Set<string>();
  for (const tc of tcs) {
    const safeName = uniqueSheetName(tc.metadata.tcId || "TC", usedNames);
    await buildTestCaseSheet(wb, { ...tc, metadata: { ...tc.metadata, tcId: safeName } });
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as unknown as Buffer;
}

/** Excel sheet names forbid \ / ? * [ ] : and must be ≤31 chars & unique.
 *  Fall back to a padded "TC00" style name when parsing produced a duplicate
 *  or invalid id. */
function uniqueSheetName(raw: string, used: Set<string>): string {
  const forbidden = /[\\/?*[\]:]/g;
  const name = (raw || "TC")
    .replace(forbidden, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31) || "TC";
  let candidate = name;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${name.slice(0, 28)}-${n}`;
    n++;
  }
  used.add(candidate);
  return candidate;
}
