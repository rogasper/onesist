ALTER TABLE `tasks` ADD `blocks_json` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `critical` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `risk` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `files_scope_json` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `spec_ref` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `erd_ref` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `rtm_ref` text;--> statement-breakpoint
ALTER TABLE `tasks` ADD `acceptance_criteria_json` text;
