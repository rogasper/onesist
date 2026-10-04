-- Cross-thread message search (Fase 5.3, FR-B17).
--
-- Hand-written like 0011_index.sql: `chat_fts` is an FTS5 VIRTUAL table and
-- drizzle-kit cannot express one. The same statements live in the runtime
-- migration path in client.ts, so a database created before this migration
-- also gets them.
--
-- Why FTS5 rather than LIKE: the artifact index already proved FTS5 works in
-- both SQLite drivers this app uses (Bun + better-sqlite3, including bm25), it
-- needs no dependency, and `snippet()` is what makes a search result readable.
CREATE VIRTUAL TABLE IF NOT EXISTS `chat_fts` USING fts5(
	text, message_id UNINDEXED, thread_id UNINDEXED, role UNINDEXED,
	tokenize='unicode61 remove_diacritics 2'
);
