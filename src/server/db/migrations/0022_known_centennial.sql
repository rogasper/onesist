ALTER TABLE `chat_threads` ADD `parent_thread_id` text;--> statement-breakpoint
ALTER TABLE `chat_threads` ADD `relationship_to_parent` text;--> statement-breakpoint
ALTER TABLE `chat_threads` ADD `root_thread_id` text;--> statement-breakpoint
ALTER TABLE `chat_threads` ADD `forked_at_seq` integer;--> statement-breakpoint
ALTER TABLE `chat_threads` ADD `merged_upto_seq` integer;