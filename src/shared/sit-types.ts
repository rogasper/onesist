export type SitProgress = "Complete" | "Not Yet" | "Partial Complete";
export type SitStatus = "Pass" | "Fail" | "Hold" | "Re Open" | "Stopper" | "Takeout" | "Not started";
export type SitTestType = "Positive" | "Negative";

export interface SitMetadata {
  tcId: string;
  title: string;
  description: string | null;
  systemEnv: string | null;
  tester: string | null;
  location: string | null;
  date: string | null;
  progress: SitProgress;
  status: SitStatus;
}

export interface SitBrowserResult {
  browser: string;
  tested: string | null;
  firstStatus: string | null;
  pic: string | null;
  firstDate: string | null;
  actualResult: string | null;
  lastStatus: string | null;
  lastDate: string | null;
  lastActual: string | null;
  evidence: string | null;
}

export interface SitStep {
  no: number;
  code: string;
  menu: string;
  feature: string;
  userStory: string;
  steps: string[];
  dataInput: string | null;
  expected: string;
  typeTest: SitTestType;
  tested: string;
  bugRefs: string[];
  browserResults: SitBrowserResult[];
  finalPic: string | null;
  finalResult: string | null;
  finalStatus: string | null;
}

export interface SitTestCase {
  metadata: SitMetadata;
  steps: SitStep[];
}

export interface SitSummaryRow {
  tcId: string;
  scenario: string;
  totalSteps: number;
  tested: number;
  passed: number;
  failed: number;
  progress: string;
  status: string;
  pic: string;
}

export interface SitSummary {
  project: string;
  version: string;
  created: string;
  testers: string[];
  overall: {
    totalTcGroups: number;
    totalSteps: number;
    totalPassed: number;
    totalFailed: number;
    readinessPercentage: number;
  };
  rows: SitSummaryRow[];
}

export interface SitFileEntry {
  filename: string;
  relativePath: string;
  metadata: SitMetadata;
  stepCount: number;
  passedSteps: number;
  failedSteps: number;
}

export interface SitDataset {
  files: SitFileEntry[];
  summary: SitSummary | null;
}

export interface SitBug {
  bugId: string;
  tcId: string;
  stepCode: string;
  description: string;
  status: string | null;
}
