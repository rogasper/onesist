CREATE TABLE `chat_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`position` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_chat_queue_thread` ON `chat_queue` (`thread_id`,`position`);--> statement-breakpoint
ALTER TABLE `chat_threads` ADD `queue_paused` integer DEFAULT false NOT NULL;