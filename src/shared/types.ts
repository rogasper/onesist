export interface WikiPage {
  id: string;
  projectId: string;
  parentId: string | null;
  title: string;
  slug: string;
  contentMd: string | null;
  contentHtml: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocMeta {
  customerName: string;
  projectName: string;
  projectId: string;
  version: string;
  author: string;
}

export interface Task {
  id: string;
  projectId: string;
  code: string | null;
  title: string;
  description: string | null;
  status: string;
  storyPoints: number | null;
  assignee: string | null;
  module: string | null;
  dependenciesJson: string | null;
  sourcePath: string | null;
  phase: string | null;
  archived: boolean;
  blocksJson: string | null;
  critical: boolean;
  risk: string | null;
  filesScopeJson: string | null;
  specRef: string | null;
  erdRef: string | null;
  rtmRef: string | null;
  acceptanceCriteriaJson: string | null;
  execProviderId: string | null;
  execModel: string | null;
  reposJson: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `execution` lets agents run tasks from the board; `delivery` only shows and manages them. */
export type TaskMode = "execution" | "delivery";

/** How a finished task reaches the repo: a pull request, a local branch, or a local merge. */
export type Integration = "pr" | "branch" | "merge";

export interface ExecSettings {
  taskMode: TaskMode;
  execProviderId: string | null;
  execModel: string | null;
  reviewerProviderId: string | null;
  reviewerModel: string | null;
  maxParallel: number;
  integration: Integration;
  /** Base branch per repo, keyed by repo path (e.g. "input/code/api"). */
  baseBranches: Record<string, string>;
}

export interface CheckCommandSummary {
  name: string;
  command: string;
}

/** A git repo a task can target, with the check commands configured for it. */
export interface RepoSummary {
  id: string;
  path: string;
  isGit: boolean;
  baseBranch: string | null;
  checks: CheckCommandSummary[];
  suggestedChecks: CheckCommandSummary[];
}

/** The state of one run of a task, as the board shows it. */
export type RunState = "running" | "waiting_input" | "validating" | "failed";

export interface RunSummary {
  id: string;
  taskId: string;
  threadId: string | null;
  state: RunState;
  bundlePath: string;
  repos: { repo: string; branch: string | null; worktreePath: string | null }[];
  error: string | null;
  /** Result of the last validation, or null before the first one. */
  validation: RunValidation | null;
  /** The AI reviewer's findings, or null before a review. */
  review: { threadId: string | null; findings: unknown[] } | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface RunValidation {
  ranAt: string;
  /** False when a mechanical check failed. Scope and acceptance never block. */
  passed: boolean;
  checks: { repo: string; name: string; command: string; ok: boolean; exitCode: number | null; tail: string }[];
  outsideScope: string[];
  acceptance: { criterion: string; status: "met" | "no-evidence" | "not-met" | "missing" }[];
  reportFound: boolean;
}

export interface BusinessRequirement {
  id: string;
  projectId: string;
  code: string;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface FunctionalRequirement {
  id: string;
  projectId: string;
  brId: string | null;
  code: string;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DesignSolution {
  id: string;
  projectId: string;
  code: string;
  title: string;
  description: string | null;
  sourceRef: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface TestCase {
  id: string;
  projectId: string;
  code: string;
  title: string;
  description: string | null;
  steps: string | null;
  expected: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RtmLink {
  id: string;
  projectId: string;
  frId: string;
  dsId: string | null;
  tcId: string | null;
  createdAt: string;
}

export interface RtmDataset {
  brs: BusinessRequirement[];
  frs: FunctionalRequirement[];
  designs: DesignSolution[];
  tests: TestCase[];
  links: RtmLink[];
}
