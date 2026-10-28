CREATE TABLE `project_exec_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`task_mode` text DEFAULT 'execution' NOT NULL,
	`exec_provider_id` text,
	`exec_model` text,
	`reviewer_provider_id` text,
	`reviewer_model` text,
	`max_parallel` integer DEFAULT 2 NOT NULL,
	`integration` text DEFAULT 'pr' NOT NULL,
	`base_branches_json` text,
	`updated_at` text,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `exec_provider_id` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `exec_model` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `repos_json` text;