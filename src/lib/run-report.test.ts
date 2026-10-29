import { expect, test } from "bun:test";
import { parseRunReport, criterionStatus } from "./run-report";

const block = (json: string) => "Selesai.\n\n```onesist-report\n" + json + "\n```\n";

test("the last onesist-report block is the report", () => {
  const text = block('{"summary":"a","acceptance":[],"notes":"","questionsAsked":[]}') + block('{"summary":"b","acceptance":[{"criterion":"Login memakai OTP","met":true,"evidence":["src/auth.ts:12"]}],"notes":"","questionsAsked":[]}');
  const res = parseRunReport(text);
  expect(res.ok).toBe(true);
  if (res.ok) expect(res.report.summary).toBe("b");
});

test("a missing or broken report is refused", () => {
  expect(parseRunReport("tanpa blok").ok).toBe(false);
  expect(parseRunReport(block("{ rusak")).ok).toBe(false);
});

test("a criterion is ok only when the agent says met and gives evidence", () => {
  const report = {
    summary: "",
    notes: "",
    questionsAsked: [],
    acceptance: [
      { criterion: "A", met: true, evidence: ["x.ts:1"] },
      { criterion: "B", met: true, evidence: [] },
      { criterion: "C", met: false, evidence: ["y.ts:2"] },
    ],
  };
  expect(criterionStatus(report, "A")).toBe("met");
  expect(criterionStatus(report, "B")).toBe("no-evidence");
  expect(criterionStatus(report, "C")).toBe("not-met");
  expect(criterionStatus(report, "D")).toBe("missing");
});
