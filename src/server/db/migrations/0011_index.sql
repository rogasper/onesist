-- Full-text + symbol index (Fase 3, FR-I1).
--
-- Hand-written, unlike 0000–0010: `index_fts` is an FTS5 VIRTUAL table and
-- drizzle-kit cannot express one from schema.ts, so it cannot be generated. The
-- same statements live in the runtime migration path in client.ts, so a database
-- created before this migration also gets them.
CREATE TABLE IF NOT EXISTS `index_files` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`ext` text,
	`size` integer,
	`mtime_ms` integer,
	`chunk_count` integer DEFAULT 0 NOT NULL,
	`symbol_count` integer DEFAULT 0 NOT NULL,
	`indexed_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_index_files_project_path` ON `index_files` (`project_id`,`path`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `index_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`ord` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text,
	`start_line` integer,
	`end_line` integer,
	`text` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_index_chunks_project_path` ON `index_chunks` (`project_id`,`path`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `index_symbols` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`line` integer,
	`container` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_index_symbols_project_name` ON `index_symbols` (`project_id`,`name`);
--> statement-breakpoint
CREATE VIRTUAL TABLE IF NOT EXISTS `index_fts` USING fts5(
	text, path UNINDEXED, label UNINDEXED, chunk_id UNINDEXED, project_id UNINDEXED,
	tokenize='unicode61 remove_diacritics 2'
);
