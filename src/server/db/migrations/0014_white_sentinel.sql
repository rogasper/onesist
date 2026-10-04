-- Files are attributed to the assistant turn that wrote them, so the transcript
-- can show a turn's artifacts as its own section (UJI-MANUAL C9b). Rows written
-- before this column stay NULL and are listed at thread level instead.
ALTER TABLE `chat_thread_files` ADD `message_id` text;

-- NOTE: `drizzle-kit generate` ALSO emitted a full rebuild of `chat_threads`
-- (`CREATE __new_chat_threads` / copy / drop / rename), because the schema's
-- `max_steps` default moved 30 -> 60 without a migration. That rebuild is not
-- applied here, deliberately: the default only matters for inserts that omit the
-- value (the app always passes `maxSteps`), it would rewrite a table holding the
-- user's chat history, and the runtime path in `src/server/db/client.ts` is what
-- brings existing and fresh databases to the same state. The 0014 snapshot does
-- record the new default, so drizzle will not propose that rebuild again.
