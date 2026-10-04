CREATE TABLE `subagents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`tools_json` text,
	`instructions` text NOT NULL,
	`max_steps` integer,
	`created_at` text DEFAULT 'datetime(''now'')',
	`updated_at` text DEFAULT 'datetime(''now'')'
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_subagents_name` ON `subagents` (`name`);