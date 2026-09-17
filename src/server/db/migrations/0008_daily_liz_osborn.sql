CREATE TABLE `chat_thread_reads` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`path` text NOT NULL,
	`hash` text NOT NULL,
	`read_at` text DEFAULT 'datetime(''now'')',
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_thread_reads_thread_path` ON `chat_thread_reads` (`thread_id`,`path`);