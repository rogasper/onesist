CREATE TABLE `api_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`spec_id` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`module` text NOT NULL,
	`purpose` text,
	`body_schema` text,
	`response_schema` text,
	`sort_order` integer DEFAULT 0,
	FOREIGN KEY (`spec_id`) REFERENCES `api_specs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `api_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`spec_id` text NOT NULL,
	`markdown_content` text,
	`openapi_json` text,
	`change_log_id` text,
	`created_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`spec_id`) REFERENCES `api_specs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `api_specs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`markdown_content` text,
	`openapi_json` text,
	`created_at` text DEFAULT 'datetime(''now'')',
	`updated_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `change_log` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`entity_name` text,
	`action` text NOT NULL,
	`summary` text,
	`diff_json` text,
	`snapshot_id` text,
	`created_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `erd_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`erd_id` text NOT NULL,
	`dbml_content` text NOT NULL,
	`change_log_id` text,
	`created_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`erd_id`) REFERENCES `erds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `erds` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`dbml_content` text NOT NULL,
	`created_at` text DEFAULT 'datetime(''now'')',
	`updated_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exports` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`target_type` text NOT NULL,
	`format` text NOT NULL,
	`file_path` text,
	`created_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `fsd_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`fsd_input_path` text,
	`fsd_content` text,
	`mode` text NOT NULL,
	`status` text DEFAULT 'pending',
	`artifacts_json` text,
	`agent_output` text,
	`created_at` text DEFAULT 'datetime(''now'')',
	`updated_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`company` text,
	`description` text,
	`created_at` text DEFAULT 'datetime(''now'')',
	`updated_at` text DEFAULT 'datetime(''now'')'
);
--> statement-breakpoint
CREATE TABLE `task_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`title` text,
	`description` text,
	`status` text,
	`story_points` integer,
	`assignee` text,
	`change_log_id` text,
	`created_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'todo',
	`story_points` integer,
	`assignee` text,
	`module` text,
	`dependencies_json` text,
	`created_at` text DEFAULT 'datetime(''now'')',
	`updated_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `wiki_pages` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`parent_id` text,
	`title` text NOT NULL,
	`slug` text NOT NULL,
	`content_md` text,
	`content_html` text,
	`sort_order` integer DEFAULT 0,
	`created_at` text DEFAULT 'datetime(''now'')',
	`updated_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `wiki_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`page_id` text NOT NULL,
	`content_md` text,
	`change_log_id` text,
	`created_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`page_id`) REFERENCES `wiki_pages`(`id`) ON UPDATE no action ON DELETE no action
);
