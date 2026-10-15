CREATE TABLE `chat_provider_sessions` (
	`thread_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`session_id` text NOT NULL,
	`known_upto_seq` integer DEFAULT 0 NOT NULL,
	`updated_at` text DEFAULT 'datetime(''now'')',
	PRIMARY KEY(`thread_id`, `provider_id`),
	FOREIGN KEY (`thread_id`) REFERENCES `chat_threads`(`id`) ON UPDATE no action ON DELETE no action
);
