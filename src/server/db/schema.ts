import { sqliteTable, text, integer, real, uniqueIndex, index } from "drizzle-orm/sqlite-core";

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
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  // Agentic handoff fields
  blocksJson: text("blocks_json"),
  critical: integer("critical", { mode: "boolean" }).notNull().default(false),
  risk: text("risk"),
  filesScopeJson: text("files_scope_json"),
  specRef: text("spec_ref"),
  erdRef: text("erd_ref"),
  rtmRef: text("rtm_ref"),
  acceptanceCriteriaJson: text("acceptance_criteria_json"),
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

export const businessRequirements = sqliteTable("business_requirements", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  fsd: text("fsd").notNull().default("default"),
  code: text("code").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  createdAt: text("created_at").default("datetime('now')"),
  updatedAt: text("updated_at").default("datetime('now')"),
});

export const functionalRequirements = sqliteTable("functional_requirements", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  fsd: text("fsd").notNull().default("default"),
  brId: text("br_id"),
  code: text("code").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0),
  createdAt: text("created_at").default("datetime('now')"),
  updatedAt: text("updated_at").default("datetime('now')"),
});

export const designSolutions = sqliteTable("design_solutions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  fsd: text("fsd").notNull().default("default"),
  code: text("code").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  sourceRef: text("source_ref"),
  sortOrder: integer("sort_order").default(0),
  createdAt: text("created_at").default("datetime('now')"),
  updatedAt: text("updated_at").default("datetime('now')"),
});

export const testCases = sqliteTable("test_cases", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  fsd: text("fsd").notNull().default("default"),
  code: text("code").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  steps: text("steps"),
  expected: text("expected"),
  sortOrder: integer("sort_order").default(0),
  createdAt: text("created_at").default("datetime('now')"),
  updatedAt: text("updated_at").default("datetime('now')"),
});

export const rtmLinks = sqliteTable("rtm_links", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  fsd: text("fsd").notNull().default("default"),
  frId: text("fr_id").notNull().references(() => functionalRequirements.id),
  dsId: text("ds_id"),
  tcId: text("tc_id"),
  createdAt: text("created_at").default("datetime('now')"),
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

// ─────────────────────────────────────────────────────────────────────────────
// Agent native — BYOK providers & chat
// Providers are app-level (not bound to a project); threads are project-bound.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Application-level preferences, key → JSON value.
 *
 * The first store of its kind in this app: everything else is project-scoped or
 * lives in `llm_providers`. It exists because FR-L7 ("agent turn limit") is a
 * machine-wide default — it applies to threads that do not exist yet, so it
 * cannot live on a thread, and it is not provider-specific either.
 *
 * Kept deliberately small and schema-less: a new preference should not need a
 * migration. Values are validated on write by the owning route, not here.
 */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  /** JSON-encoded so booleans and numbers keep their type. */
  value: text("value").notNull(),
  updatedAt: text("updated_at").default("datetime('now')"),
});

/**
 * Subagents created through the UI (FR-G2).
 *
 * App-level on purpose: a *project's* subagents belong in its own workspace as
 * markdown files (`<project>/.agents/agents/`, FR-G1, shareable with the team),
 * while these are the ones a user wants everywhere. A project file with the same
 * name wins.
 */
export const subagents = sqliteTable(
  "subagents",
  {
    id: text("id").primaryKey(),
    /** Unique; the name the main agent calls it by. */
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** JSON array of READ-ONLY tool names; mutating ones are refused on write. */
    toolsJson: text("tools_json"),
    /** Markdown body: the subagent's instructions. */
    instructions: text("instructions").notNull(),
    maxSteps: integer("max_steps"),
    createdAt: text("created_at").default("datetime('now')"),
    updatedAt: text("updated_at").default("datetime('now')"),
  },
  (t) => [uniqueIndex("idx_subagents_name").on(t.name)],
);

/** BYOK provider configuration. Several rows may share the same `preset`
 *  (users reasonably hold multiple keys for the same provider). */
export const llmProviders = sqliteTable("llm_providers", {
  id: text("id").primaryKey(),
  /** The name the user sees. Must be unique — validated in the UI (FR-L2). */
  name: text("name").notNull(),
  preset: text("preset").notNull().default("custom"),
  /** Protocol style: completions | responses | anthropic-messages | cli */
  apiStyle: text("api_style").notNull().default("completions"),
  /** Full base URL INCLUDING the API version (e.g. .../v1) — the AI SDK does
   *  not append a version for us (spike T4). */
  endpoint: text("endpoint"),
  apiKey: text("api_key"),
  /** bearer | api-key | none */
  authMethod: text("auth_method").notNull().default("bearer"),
  model: text("model"),
  /** User-entered/typed models. Merged with discovery results, never
   *  overwritten — many OpenAI-compatible providers have no GET /models (FR-L4). */
  modelsJson: text("models_json"),
  customHeadersJson: text("custom_headers_json"),
  proxyUrl: text("proxy_url"),
  skipTlsVerify: integer("skip_tls_verify", { mode: "boolean" }).notNull().default(false),
  enableThinking: integer("enable_thinking", { mode: "boolean" }).notNull().default(false),
  /** Supported effort-control shape + where the info came from (FR-A12). */
  effortCapabilityJson: text("effort_capability_json"),
  /** REQUIRED when in use: without an explicit value, registry providers
   *  cap output at 4096 tokens (spike T2). */
  maxOutputTokens: integer("max_output_tokens"),
  /** Harga per 1 juta token, diisi user (Fase 5.5).
   *
   *  Nullable dan TIDAK ada tabel harga bawaan: satu-satunya sumber yang jujur
   *  untuk biaya endpoint BYOK adalah user — harga per model berubah, berbeda per
   *  penyedia, dan menebaknya akan menghasilkan angka yang salah dengan percaya
   *  diri. Tanpa harga, UI menampilkan token saja. */
  inputPricePerMTok: real("input_price_per_mtok"),
  outputPricePerMTok: real("output_price_per_mtok"),
  contextWindow: integer("context_window"),
  /** CLI provider (apiStyle = "cli") — path + per-CLI env (FR-A13). */
  cliAgent: text("cli_agent"),
  cliPath: text("cli_path"),
  cliEnvJson: text("cli_env_json"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  lastTestOk: integer("last_test_ok", { mode: "boolean" }),
  lastTestedAt: text("last_tested_at"),
  lastTestLatencyMs: integer("last_test_latency_ms"),
  lastTestErrorCategory: text("last_test_error_category"),
  /** user = created via UI · env = bootstrapped from the environment (FR-A17).
   *  DB providers always win over environment ones. */
  source: text("source").notNull().default("user"),
  createdAt: text("created_at").default("datetime('now')"),
  updatedAt: text("updated_at").default("datetime('now')"),
});

export const chatThreads = sqliteTable(
  "chat_threads",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id),
    title: text("title"),
    /** ask = read-only/text production only · agent = may use tools */
    mode: text("mode").notNull().default("agent"),
    providerId: text("provider_id"),
    model: text("model"),
    /** ask | auto | readonly (FR-E1). `ask` = default: state-changing tools
     *  wait for approval. */
    permissionMode: text("permission_mode").notNull().default("ask"),
    /** Summary of old messages once the context budget is exceeded (FR-B8 layer 2). */
    summary: text("summary"),
    /** Step limit per turn (FR-L7). Default 60, clamped 5..500; the ceiling is
     *  reported in the transcript when reached, and the notice can raise it. */
    maxSteps: integer("max_steps").notNull().default(60),
    tokensUsed: integer("tokens_used").notNull().default(0),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").default("datetime('now')"),
    updatedAt: text("updated_at").default("datetime('now')"),
  },
  (t) => [index("idx_chat_threads_project").on(t.projectId)],
);

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id),
    seq: integer("seq").notNull(),
    /** system | user | assistant | tool */
    role: text("role").notNull(),
    /** The UI message as parts (AI SDK UIMessage format), as JSON. */
    contentJson: text("content_json"),
    toolCallsJson: text("tool_calls_json"),
    toolCallId: text("tool_call_id"),
    /** null = ordinary message · compactNotice = context-was-compacted marker (FR-B9) */
    kind: text("kind"),
    providerId: text("provider_id"),
    model: text("model"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    /** Thinking-phase length in milliseconds. Reasoning parts carry no
     *  persistent time marker, so the duration is measured during the pass
     *  through the stream (FR-B5) — without this column the transcript could
     *  only show a character count. */
    reasoningMs: integer("reasoning_ms"),
    /** ok | error | aborted */
    status: text("status").notNull().default("ok"),
    /** Already sanitized: provider responseBody can echo the API key (FR-K7). */
    error: text("error"),
    createdAt: text("created_at").default("datetime('now')"),
  },
  (t) => [index("idx_chat_messages_thread_seq").on(t.threadId, t.seq)],
);

export const chatToolCalls = sqliteTable(
  "chat_tool_calls",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id),
    messageId: text("message_id"),
    /** Stable key from the AI SDK: start and end land on the same card (FR-B4). */
    toolCallId: text("tool_call_id").notNull(),
    name: text("name").notNull(),
    argsJson: text("args_json"),
    /** Truncated — tool results can be very long and need not be stored whole. */
    resultPreview: text("result_preview"),
    isError: integer("is_error", { mode: "boolean" }).notNull().default(false),
    /** {added, removed, diff} computed AT write time, not re-read (FR-C3). */
    diffJson: text("diff_json"),
    /** auto | approved | denied | user-approval | protected-path */
    approval: text("approval"),
    startedAt: text("started_at"),
    endedAt: text("ended_at"),
  },
  (t) => [index("idx_chat_tool_calls_thread").on(t.threadId, t.toolCallId)],
);

/** Ledger of files a thread touched. This is what keeps the
 *  "Changed files" card alive across restarts, independent of the replayed
 *  SSE (FR-C4). `source` separates tool writes, agent-run bash,
 *  and outside changes (the user editing in another tab). */
export const chatThreadFiles = sqliteTable(
  "chat_thread_files",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id),
    path: text("path").notNull(),
    route: text("route"),
    /** create | update | delete | rename */
    op: text("op").notNull(),
    /** tool | bash | external */
    source: text("source").notNull().default("tool"),
    linesAdded: integer("lines_added"),
    linesRemoved: integer("lines_removed"),
    /** Diff computed AT write time (FR-C3) and stored here so the
     *  "changed files" card can show its changes after a restart, without
     *  re-reading the disk or depending on stream history. */
    diffJson: text("diff_json"),
    firstSeenAt: text("first_seen_at").default("datetime('now')"),
    lastSeenAt: text("last_seen_at").default("datetime('now')"),
  },
  (t) => [uniqueIndex("idx_chat_thread_files_thread_path").on(t.threadId, t.path)],
);

export const chatRuns = sqliteTable(
  "chat_runs",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id),
    /** running | done | error | stopped | interrupted */
    status: text("status").notNull().default("running"),
    stepCount: integer("step_count").notNull().default(0),
    error: text("error"),
    startedAt: text("started_at").default("datetime('now')"),
    finishedAt: text("finished_at"),
  },
  (t) => [index("idx_chat_runs_thread").on(t.threadId)],
);

/**
 * Files a thread has READ, with the hash at read time (FR-C12).
 *
 * Why a table of its own instead of the change ledger: the ledger answers "what
 * did this conversation change", and a read is not a change. Mixing them would
 * either pollute the changed-files card or lose the read record the moment a read
 * is followed by a write.
 *
 * With this, "the agent's context is stale" becomes computable instead of
 * guessed: compare the stored hash against the file on disk. The write path
 * already refuses a write whose `expected_hash` no longer matches (FR-C11); this
 * is the visible counterpart, so the user learns that a file moved under the
 * agent before the next write fails.
 */
export const chatThreadReads = sqliteTable(
  "chat_thread_reads",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id),
    path: text("path").notNull(),
    /** Content hash returned by `read_file` (sha256, first 16 chars). */
    hash: text("hash").notNull(),
    readAt: text("read_at").default("datetime('now')"),
  },
  (t) => [uniqueIndex("idx_chat_thread_reads_thread_path").on(t.threadId, t.path)],
);
