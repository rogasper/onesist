import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rootPath: text("root_path"),
  company: text("company"),
  description: text("description"),
  defaultAgent: text("default_agent").default("opencode"),
  skillsStatus: text("skills_status").default("pending"),
  skillsError: text("skills_error"),
  skillsUpdatedAt: text("skills_updated_at"),
  customerName: text("customer_name"),
  docVersion: text("doc_version"),
  docAuthor: text("doc_author"),
  createdAt: text("created_at").default("datetime('now')"),
  updatedAt: text("updated_at").default("datetime('now')"),
});

export const erds = sqliteTable("erds", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  dbmlContent: text("dbml_content").notNull(),
  createdAt: text("created_at").default("datetime('now')"),
  updatedAt: text("updated_at").default("datetime('now')"),
});

export const erdSnapshots = sqliteTable("erd_snapshots", {
  id: text("id").primaryKey(),
  erdId: text("erd_id").notNull().references(() => erds.id),
  dbmlContent: text("dbml_content").notNull(),
  changeLogId: text("change_log_id"),
  createdAt: text("created_at").default("datetime('now')"),
});

export const apiSpecs = sqliteTable("api_specs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  name: text("name").notNull(),
  markdownContent: text("markdown_content"),
  openapiJson: text("openapi_json"),
  createdAt: text("created_at").default("datetime('now')"),
  updatedAt: text("updated_at").default("datetime('now')"),
});

export const apiSnapshots = sqliteTable("api_snapshots", {
  id: text("id").primaryKey(),
  specId: text("spec_id").notNull().references(() => apiSpecs.id),
  markdownContent: text("markdown_content"),
  openapiJson: text("openapi_json"),
  changeLogId: text("change_log_id"),
  createdAt: text("created_at").default("datetime('now')"),
});

export const apiEndpoints = sqliteTable("api_endpoints", {
  id: text("id").primaryKey(),
  specId: text("spec_id").notNull().references(() => apiSpecs.id),
  method: text("method").notNull(),
  path: text("path").notNull(),
  module: text("module").notNull(),
  purpose: text("purpose"),
  bodySchema: text("body_schema"),
  responseSchema: text("response_schema"),
  sortOrder: integer("sort_order").default(0),
});

export const wikiPages = sqliteTable("wiki_pages", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  parentId: text("parent_id"),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  contentMd: text("content_md"),
  contentHtml: text("content_html"),
  sortOrder: integer("sort_order").default(0),
  createdAt: text("created_at").default("datetime('now')"),
  updatedAt: text("updated_at").default("datetime('now')"),
});

export const wikiSnapshots = sqliteTable("wiki_snapshots", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull().references(() => wikiPages.id),
  contentMd: text("content_md"),
  changeLogId: text("change_log_id"),
  createdAt: text("created_at").default("datetime('now')"),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  code: text("code"),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("todo"),
  storyPoints: integer("story_points"),
  assignee: text("assignee"),
  module: text("module"),
  dependenciesJson: text("dependencies_json"),
  sourcePath: text("source_path"),
  phase: text("phase"),
  createdAt: text("created_at").default("datetime('now')"),
  updatedAt: text("updated_at").default("datetime('now')"),
});

export const taskSnapshots = sqliteTable("task_snapshots", {
  id: text("id").primaryKey(),
  taskId: text("task_id").notNull().references(() => tasks.id),
  title: text("title"),
  description: text("description"),
  status: text("status"),
  storyPoints: integer("story_points"),
  assignee: text("assignee"),
  changeLogId: text("change_log_id"),
  createdAt: text("created_at").default("datetime('now')"),
});

export const fsdSessions = sqliteTable("fsd_sessions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  fsdInputPath: text("fsd_input_path"),
  fsdContent: text("fsd_content"),
  mode: text("mode").notNull(),
  status: text("status").default("pending"),
  artifactsJson: text("artifacts_json"),
  agentOutput: text("agent_output"),
  title: text("title"),
  sourceType: text("source_type").default("manual"),
  sourceFilePath: text("source_file_path"),
  markdownPath: text("markdown_path"),
  completenessJson: text("completeness_json"),
  contentHash: text("content_hash"),
  generatedFromHash: text("generated_from_hash"),
  conversionStatus: text("conversion_status"),
  conversionError: text("conversion_error"),
  createdAt: text("created_at").default("datetime('now')"),
  updatedAt: text("updated_at").default("datetime('now')"),
});

export const changeLog = sqliteTable("change_log", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  entityName: text("entity_name"),
  action: text("action").notNull(),
  summary: text("summary"),
  diffJson: text("diff_json"),
  snapshotId: text("snapshot_id"),
  createdAt: text("created_at").default("datetime('now')"),
});

export const exports_ = sqliteTable("exports", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  targetType: text("target_type").notNull(),
  format: text("format").notNull(),
  filePath: text("file_path"),
  createdAt: text("created_at").default("datetime('now')"),
});
