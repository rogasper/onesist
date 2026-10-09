CREATE TABLE `chat_checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`run_id` text NOT NULL,
	`message_id` text,
	`seq` integer NOT NULL,
	`path` text NOT NULL,
	`before_kind` text NOT NULL,
	`before_text` text,
	`after_kind` text NOT NULL,
	`after_text` text,
	`created_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_chat_checkpoints_message` ON `chat_checkpoints` (`thread_id`,`message_id`);--> statement-breakpoint
CREATE INDEX `idx_chat_checkpoints_run` ON `chat_checkpoints` (`run_id`);