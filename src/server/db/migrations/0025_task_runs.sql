CREATE TABLE `task_run_repos` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`repo` text NOT NULL,
	`worktree_path` text,
	`branch` text,
	`base_branch` text,
	`base_commit` text,
	FOREIGN KEY (`run_id`) REFERENCES `task_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `task_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`project_id` text NOT NULL,
	`thread_id` text,
	`bundle_path` text NOT NULL,
	`provider_id` text,
	`model` text,
	`state` text DEFAULT 'running' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`integration` text DEFAULT 'pr' NOT NULL,
	`error` text,
	`created_at` text DEFAULT 'datetime(''now'')',
	`started_at` text,
	`ended_at` text,
	`updated_at` text,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE no action
);
