CREATE TABLE IF NOT EXISTS `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`seq` integer NOT NULL,
	`role` text NOT NULL,
	`content_json` text,
	`tool_calls_json` text,
	`tool_call_id` text,
	`kind` text,
	`provider_id` text,
	`model` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`status` text DEFAULT 'ok' NOT NULL,
	`error` text,
	`created_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chat_messages_thread_seq` ON `chat_messages` (`thread_id`,`seq`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`step_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` text DEFAULT 'datetime(''now'')',
	`finished_at` text,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chat_runs_thread` ON `chat_runs` (`thread_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_thread_files` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`path` text NOT NULL,
	`route` text,
	`op` text NOT NULL,
	`source` text DEFAULT 'tool' NOT NULL,
	`lines_added` integer,
	`lines_removed` integer,
	`first_seen_at` text DEFAULT 'datetime(''now'')',
	`last_seen_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_chat_thread_files_thread_path` ON `chat_thread_files` (`thread_id`,`path`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`title` text,
	`mode` text DEFAULT 'agent' NOT NULL,
	`provider_id` text,
	`model` text,
	`permission_mode` text DEFAULT 'ask' NOT NULL,
	`summary` text,
	`max_steps` integer DEFAULT 30 NOT NULL,
	`tokens_used` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT 'datetime(''now'')',
	`updated_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chat_threads_project` ON `chat_threads` (`project_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `chat_tool_calls` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`message_id` text,
	`tool_call_id` text NOT NULL,
	`name` text NOT NULL,
	`args_json` text,
	`result_preview` text,
	`is_error` integer DEFAULT false NOT NULL,
	`diff_json` text,
	`approval` text,
	`started_at` text,
	`ended_at` text,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_chat_tool_calls_thread` ON `chat_tool_calls` (`thread_id`,`tool_call_id`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `llm_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`preset` text DEFAULT 'custom' NOT NULL,
	`api_style` text DEFAULT 'completions' NOT NULL,
	`endpoint` text,
	`api_key` text,
	`auth_method` text DEFAULT 'bearer' NOT NULL,
	`model` text,
	`models_json` text,
	`custom_headers_json` text,
	`proxy_url` text,
	`skip_tls_verify` integer DEFAULT false NOT NULL,
	`enable_thinking` integer DEFAULT false NOT NULL,
	`effort_capability_json` text,
	`max_output_tokens` integer,
	`context_window` integer,
	`cli_agent` text,
	`cli_path` text,
	`cli_env_json` text,
	`is_default` integer DEFAULT false NOT NULL,
	`last_test_ok` integer,
	`last_tested_at` text,
	`last_test_latency_ms` integer,
	`last_test_error_category` text,
	`source` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT 'datetime(''now'')',
	`updated_at` text DEFAULT 'datetime(''now'')'
);
