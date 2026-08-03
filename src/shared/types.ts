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
