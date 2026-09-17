import * as schema from "~/server/db/schema";
import path from "node:path";

// Desktop sidecar passes an absolute DB path via SA_DB_PATH (appData dir).
// Web mode (CWD = repo root) falls back to ./data.db.
const dbPath = process.env.SA_DB_PATH
  ? path.resolve(process.env.SA_DB_PATH)
  : path.resolve(process.cwd(), "data.db");

/**
 * Tables created at runtime, separate from drizzle migrations.
 *
 * Why this exists: `migrate()` can stop halfway, and its failure used to be
 * swallowed by a `catch {}`. On a pre-existing `data.db`, `__drizzle_migrations`
 * held only 0000–0003 while the journal had 7 entries — because the
 * `ALTER TABLE ... ADD COLUMN` statements below used to run BEFORE `migrate()`,
 * then `migrate()` tried to add the same columns and failed with
 * "duplicate column name". Since drizzle aborts the whole sequence on the
 * first failure, 0004, 0005, and **0006 (CREATE TABLE)** were never
 * applied.
 *
 * The app still looked healthy because the runtime ALTERs papered over the
 * missing columns — but ALTER cannot create tables. So new tables only appeared
 * on empty DBs, and on old DBs the feature failed with "no such table".
 *
 * The statements below must stay in sync with
 * `migrations/0006_thin_warbound.sql`. All are `IF NOT EXISTS`, so they are safe
 * to run repeatedly, and safe both for fresh DBs (drizzle already made them)
 * and old DBs (drizzle skipped them).
 */
const RUNTIME_TABLES = [
  `CREATE TABLE IF NOT EXISTS llm_providers (
    id text PRIMARY KEY NOT NULL, name text NOT NULL, preset text DEFAULT 'custom' NOT NULL,
    api_style text DEFAULT 'completions' NOT NULL, endpoint text, api_key text,
    auth_method text DEFAULT 'bearer' NOT NULL, model text, models_json text, custom_headers_json text,
    proxy_url text, skip_tls_verify integer DEFAULT false NOT NULL, enable_thinking integer DEFAULT false NOT NULL,
    effort_capability_json text, max_output_tokens integer, context_window integer,
    cli_agent text, cli_path text, cli_env_json text, is_default integer DEFAULT false NOT NULL,
    last_test_ok integer, last_tested_at text, last_test_latency_ms integer, last_test_error_category text,
    source text DEFAULT 'user' NOT NULL,
    created_at text DEFAULT (datetime('now')), updated_at text DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS chat_threads (
    id text PRIMARY KEY NOT NULL, project_id text NOT NULL, title text,
    mode text DEFAULT 'agent' NOT NULL, provider_id text, model text,
    permission_mode text DEFAULT 'ask' NOT NULL, summary text,
    max_steps integer DEFAULT 30 NOT NULL, tokens_used integer DEFAULT 0 NOT NULL,
    archived integer DEFAULT false NOT NULL,
    created_at text DEFAULT (datetime('now')), updated_at text DEFAULT (datetime('now')),
    FOREIGN KEY (project_id) REFERENCES projects(id)
  )`,
  `CREATE TABLE IF NOT EXISTS chat_messages (
    id text PRIMARY KEY NOT NULL, thread_id text NOT NULL, seq integer NOT NULL, role text NOT NULL,
    content_json text, tool_calls_json text, tool_call_id text, kind text, provider_id text, model text,
    input_tokens integer, output_tokens integer, reasoning_ms integer, status text DEFAULT 'ok' NOT NULL, error text,
    created_at text DEFAULT (datetime('now')),
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
  )`,
  `CREATE TABLE IF NOT EXISTS chat_tool_calls (
    id text PRIMARY KEY NOT NULL, thread_id text NOT NULL, message_id text, tool_call_id text NOT NULL,
    name text NOT NULL, args_json text, result_preview text, is_error integer DEFAULT false NOT NULL,
    diff_json text, approval text, started_at text, ended_at text,
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
  )`,
  `CREATE TABLE IF NOT EXISTS chat_thread_files (
    id text PRIMARY KEY NOT NULL, thread_id text NOT NULL, path text NOT NULL, route text,
    op text NOT NULL, source text DEFAULT 'tool' NOT NULL, lines_added integer, lines_removed integer,
    diff_json text,
    first_seen_at text DEFAULT (datetime('now')), last_seen_at text DEFAULT (datetime('now')),
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
  )`,
  `CREATE TABLE IF NOT EXISTS chat_runs (
    id text PRIMARY KEY NOT NULL, thread_id text NOT NULL, status text DEFAULT 'running' NOT NULL,
    step_count integer DEFAULT 0 NOT NULL, error text,
    started_at text DEFAULT (datetime('now')), finished_at text,
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
  )`,
  `CREATE TABLE IF NOT EXISTS chat_thread_reads (
    id text PRIMARY KEY NOT NULL, thread_id text NOT NULL, path text NOT NULL, hash text NOT NULL,
    read_at text DEFAULT (datetime('now')),
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
  )`,
  // FTS5 + symbol index (Fase 3). The virtual table is why this file carries the
  // DDL in addition to the drizzle migration: drizzle cannot model a virtual
  // table, so migrations/0011_index.sql is hand-written and this is its
  // idempotent counterpart for databases that predate it.
  `CREATE TABLE IF NOT EXISTS index_files (
    id text PRIMARY KEY NOT NULL, project_id text NOT NULL, path text NOT NULL, ext text,
    size integer, mtime_ms integer, chunk_count integer DEFAULT 0 NOT NULL, symbol_count integer DEFAULT 0 NOT NULL,
    indexed_at text DEFAULT (datetime('now'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_index_files_project_path ON index_files (project_id, path)`,
  `CREATE TABLE IF NOT EXISTS index_chunks (
    id text PRIMARY KEY NOT NULL, project_id text NOT NULL, path text NOT NULL,
    ord integer NOT NULL, kind text NOT NULL, label text, start_line integer, end_line integer, text text NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_index_chunks_project_path ON index_chunks (project_id, path)`,
  `CREATE TABLE IF NOT EXISTS index_symbols (
    id text PRIMARY KEY NOT NULL, project_id text NOT NULL, path text NOT NULL,
    name text NOT NULL, kind text NOT NULL, line integer, container text
  )`,
  `CREATE INDEX IF NOT EXISTS idx_index_symbols_project_name ON index_symbols (project_id, name)`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS index_fts USING fts5(
    text, path UNINDEXED, label UNINDEXED, chunk_id UNINDEXED, project_id UNINDEXED,
    tokenize='unicode61 remove_diacritics 2'
  )`,
  // Cross-thread message search (Fase 5.3, FR-B17). Same reasoning as index_fts:
  // hand-written migration 0013_chat_fts.sql, duplicated idempotently here for
  // databases that predate it.
  `CREATE VIRTUAL TABLE IF NOT EXISTS chat_fts USING fts5(
    text, message_id UNINDEXED, thread_id UNINDEXED, role UNINDEXED,
    tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TABLE IF NOT EXISTS app_settings (
    key text PRIMARY KEY NOT NULL, value text NOT NULL, updated_at text DEFAULT (datetime('now'))
  )`,
  "CREATE INDEX IF NOT EXISTS idx_chat_threads_project ON chat_threads (project_id)",
  "CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_seq ON chat_messages (thread_id, seq)",
  "CREATE INDEX IF NOT EXISTS idx_chat_tool_calls_thread ON chat_tool_calls (thread_id, tool_call_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_thread_files_thread_path ON chat_thread_files (thread_id, path)",
  "CREATE INDEX IF NOT EXISTS idx_chat_runs_thread ON chat_runs (thread_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_thread_reads_thread_path ON chat_thread_reads (thread_id, path)",
  `CREATE TABLE IF NOT EXISTS subagents (
    id text PRIMARY KEY NOT NULL, name text NOT NULL, description text NOT NULL,
    tools_json text, instructions text NOT NULL, max_steps integer,
    created_at text DEFAULT (datetime('now')), updated_at text DEFAULT (datetime('now'))
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS idx_subagents_name ON subagents (name)",
];


/**
 * Runs drizzle migrations WITHOUT silently swallowing their failure.
 *
 * This block used to be `catch {}`. As a result, on old DBs whose
 * `__drizzle_migrations` lagged behind, `migrate()` failed on an old migration
 * (the column already existed thanks to `applyMigrations`), the whole sequence
 * stopped, and later migrations — including the ones creating new tables —
 * never ran. The symptom only surfaced much later as a confusing
 * "no such table".
 *
 * Failure here is NOT fatal: `applyMigrations()` already handles tables and
 * columns idempotently. So it is reported once so an out-of-sync journal
 * becomes visible, not hidden.
 */
let migrationWarningShown = false;
function runDrizzleMigrations(run: () => void) {
  try {
    run();
  } catch (err: any) {
    if (migrationWarningShown) return;
    migrationWarningShown = true;
    const pesan = err?.message ?? String(err);
    console.warn(
      `[db] migrasi drizzle tidak selesai: ${pesan}\n` +
        `     Ini normal pada DB lama yang __drizzle_migrations-nya tertinggal (mis. hanya 0000-0003 sementara journal sudah 0007).\n` +
        `     Skema tetap benar karena applyMigrations() di client.ts menangani tabel & kolom secara idempoten.\n` +
        `     Untuk merapikan journal-nya, lihat catatan di plan/agent-chat/spike/RESULTS.md.`,
    );
  }
}

function applyMigrations(runSql: (sql: string) => unknown) {
  // Tables first: the `ALTER TABLE` below would fail on DBs that don't have
  // the tables yet, and the chat columns only make sense once the tables exist.
  for (const sql of RUNTIME_TABLES) {
    try {
      runSql(sql);
    } catch {}
  }

  const statements = [
    // projects columns
    "ALTER TABLE projects ADD COLUMN root_path TEXT",
    "ALTER TABLE projects ADD COLUMN skills_status TEXT DEFAULT 'pending'",
    "ALTER TABLE projects ADD COLUMN skills_error TEXT",
    "ALTER TABLE projects ADD COLUMN skills_updated_at TEXT",
    "ALTER TABLE projects ADD COLUMN default_agent TEXT DEFAULT 'opencode'",
    // task metadata columns (code, source_path, phase, archived)
    "ALTER TABLE tasks ADD COLUMN code TEXT",
    "ALTER TABLE tasks ADD COLUMN source_path TEXT",
    "ALTER TABLE tasks ADD COLUMN phase TEXT",
    "ALTER TABLE tasks ADD COLUMN archived integer DEFAULT 0 NOT NULL",
    // tasks agentic handoff columns
    "ALTER TABLE tasks ADD COLUMN blocks_json TEXT",
    "ALTER TABLE tasks ADD COLUMN critical integer DEFAULT 0 NOT NULL",
    "ALTER TABLE tasks ADD COLUMN risk TEXT",
    "ALTER TABLE tasks ADD COLUMN files_scope_json TEXT",
    "ALTER TABLE tasks ADD COLUMN spec_ref TEXT",
    "ALTER TABLE tasks ADD COLUMN erd_ref TEXT",
    "ALTER TABLE tasks ADD COLUMN rtm_ref TEXT",
    "ALTER TABLE tasks ADD COLUMN acceptance_criteria_json TEXT",
    // fsd_session document metadata columns
    "ALTER TABLE fsd_sessions ADD COLUMN title TEXT",
    "ALTER TABLE fsd_sessions ADD COLUMN source_type TEXT DEFAULT 'manual'",
    "ALTER TABLE fsd_sessions ADD COLUMN source_file_path TEXT",
    "ALTER TABLE fsd_sessions ADD COLUMN markdown_path TEXT",
    "ALTER TABLE fsd_sessions ADD COLUMN completeness_json TEXT",
    "ALTER TABLE fsd_sessions ADD COLUMN content_hash TEXT",
    "ALTER TABLE fsd_sessions ADD COLUMN generated_from_hash TEXT",
    "ALTER TABLE fsd_sessions ADD COLUMN conversion_status TEXT",
    "ALTER TABLE fsd_sessions ADD COLUMN conversion_error TEXT",
    // chat columns added after 0006 — see migrations/0007_*.sql
    "ALTER TABLE chat_messages ADD COLUMN reasoning_ms INTEGER",
    "ALTER TABLE chat_thread_files ADD COLUMN diff_json TEXT",
    // Fase 5.5: harga per juta token untuk perkiraan biaya (diisi user).
    "ALTER TABLE llm_providers ADD COLUMN input_price_per_mtok REAL",
    "ALTER TABLE llm_providers ADD COLUMN output_price_per_mtok REAL",
  ];
  for (const sql of statements) {
    try { runSql(sql); } catch {}
  }
}

// Runtime detection: Bun ships bun:sqlite built-in. Under Node.js we use the
// better-sqlite3 driver instead (never loaded under Bun — it crashes the Bun
// process, so the branches below are strictly exclusive).
const isBun = typeof Bun !== "undefined";

// Bundled production: import.meta.dirname points into dist/server/assets/,
// so migrations are copied there by build:server. Desktop sidecar can also
// point here explicitly via SA_MIGRATIONS_DIR.
const migrationsDir = process.env.SA_MIGRATIONS_DIR
  ? path.resolve(process.env.SA_MIGRATIONS_DIR)
  : path.resolve(import.meta.dirname, "migrations");

let db: any;
let rawSqlite: any = null;

if (isBun) {
  const { Database } = await import("bun:sqlite");
  const { drizzle } = await import("drizzle-orm/bun-sqlite");
  const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
  const sqlite = new Database(dbPath);
  rawSqlite = sqlite;
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  // ORDER MATTERS: drizzle FIRST, the runtime path AFTER.
  //
  // It used to be reversed, and that caused two different breakages:
  //  - Old DBs: the runtime path added columns first, so migration
  //    0004 failed with "duplicate column", drizzle cancelled the ENTIRE sequence,
  //    and 0006 (CREATE TABLE) never ran.
  //  - Fresh DBs: the runtime path created the chat tables first, so migration
  //    0006 failed with "table already exists", drizzle ROLLED BACK the entire sequence
  //    INCLUDING 0000 (projects), then seedIfEmpty() killed the process.
  // Flipping the order lets drizzle work on a clean DB, and the runtime path
  // becomes the idempotent safety net for old DBs.
  runDrizzleMigrations(() => migrate(db, { migrationsFolder: migrationsDir }));
  applyMigrations((sql) => sqlite.run(sql));
} else {
  const BetterSqlite3 = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new BetterSqlite3(dbPath);
  rawSqlite = sqlite;
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  // See the ordering note in the Bun branch above.
  runDrizzleMigrations(() => migrate(db, { migrationsFolder: migrationsDir }));
  applyMigrations((sql) => sqlite.exec(sql));
}

/**
 * Koneksi BACA-SAJA untuk tool agent (Fase 6, FR-M1).
 *
 * Dibuka sebagai koneksi terpisah dengan `readonly: true` pada driver, bukan
 * sekadar memvalidasi teks SQL di atas koneksi utama. Alasannya: validasi string
 * bisa bocor lewat satu bentuk sintaks yang belum saya pikirkan, sedangkan
 * koneksi read-only menolak penulisan apa pun di lapisan SQLite — termasuk
 * `PRAGMA`, `ATTACH`, dan DDL yang tidak lewat jalur biasa.
 *
 * Dibuat malas (lazy) dan dipakai ulang: membuka koneksi per query akan
 * menghabiskan file handle, dan tool ini dipanggil berkali-kali dalam satu turn.
 */
let readOnlyRaw: any = null;

async function readOnlyConnection(): Promise<any> {
  if (readOnlyRaw) return readOnlyRaw;
  if (isBun) {
    // Import dinamis, sama seperti koneksi utama: cabang Node tidak boleh pernah
    // memuat `bun:sqlite`, dan cabang Bun tidak boleh memuat better-sqlite3.
    const { Database } = await import("bun:sqlite");
    readOnlyRaw = new Database(dbPath, { readonly: true });
  } else {
    const BetterSqlite3 = (await import("better-sqlite3")).default;
    readOnlyRaw = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true });
  }
  return readOnlyRaw;
}

/**
 * Menjalankan satu query baca dan mengembalikan barisnya, berhenti pada `maxRows`.
 *
 * Memakai iterasi, bukan `all()`: `SELECT * FROM chat_messages` pada DB yang
 * sudah lama dipakai akan mewujudkan puluhan ribu baris di memori sebelum
 * dipotong, dan batas baris seharusnya membatasi kerja, bukan hanya keluarannya.
 */
export async function runReadOnlyQuery(query: string, maxRows: number): Promise<{ rows: Record<string, unknown>[]; truncated: boolean }> {
  const conn = await readOnlyConnection();
  // `prepare()` di KEDUA driver (bukan `query()` milik bun, yang meng-cache
  // statement dan jadi masalah saat kita finalisasi di bawah).
  const statement = conn.prepare(query);
  const rows: Record<string, unknown>[] = [];
  let truncated = false;
  try {
    const iterator = statement.iterate();
    for (const row of iterator) {
      if (rows.length >= maxRows) {
        truncated = true;
        break;
      }
      rows.push(row as Record<string, unknown>);
    }
    try {
      (iterator as any).return?.();
    } catch {
      /* driver tertentu tidak punya .return() */
    }
  } finally {
    // WAJIB: berhenti di tengah iterasi meninggalkan transaksi baca terbuka, dan
    // di mode WAL transaksi yang menggantung memaku SNAPSHOT — query berikutnya di
    // koneksi ini akan melihat data lama (terukur: 199 dari 226 baris sesudah
    // penyisipan, karena snapshot diambil sebelum penyisipan). Efeknya agent bisa
    // menjawab "task itu tidak ada" tepat setelah membuatnya.
    try {
      statement.finalize?.();
    } catch {
      /* sudah final */
    }
  }
  return { rows, truncated };
}

/// Checkpoint the WAL journal so it doesn't grow without bound during
/// long-running desktop sessions (frequent small writes accumulate WAL data).
export function checkpointWal() {
  try {
    if (isBun) {
      rawSqlite?.run("PRAGMA wal_checkpoint(TRUNCATE)");
    } else {
      rawSqlite?.pragma("wal_checkpoint(TRUNCATE)");
    }
  } catch {}
}

export { db };
