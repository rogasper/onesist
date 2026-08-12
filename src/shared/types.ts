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
  createdAt: string;
  updatedAt: string;
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
