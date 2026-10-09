import * as schema from "~/server/db/schema";
import fs from "node:fs";
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
  `CREATE TABLE IF NOT EXISTS chat_queue (
    id text PRIMARY KEY NOT NULL, thread_id text NOT NULL, position integer NOT NULL,
    text text NOT NULL, created_at text DEFAULT (datetime('now')),
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id)
  )`,
  "CREATE INDEX IF NOT EXISTS idx_chat_queue_thread ON chat_queue (thread_id, position)",
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
/**
 * @returns true when drizzle ran everything it had; false when it stopped
 * (the schema guard below then replays the migration files idempotently).
 */
function runDrizzleMigrations(run: () => void): boolean {
  try {
    run();
    return true;
  } catch (err: any) {
    if (!migrationWarningShown) {
      migrationWarningShown = true;
      const pesan = err?.message ?? String(err);
      console.warn(
        `[db] migrasi drizzle tidak selesai: ${pesan}\n` +
          `     Ini normal pada DB lama yang __drizzle_migrations-nya tertinggal (mis. hanya 0000-0003 sementara journal sudah 0007).\n` +
          `     Skema tetap benar karena applyMigrations() + penjaga skema di client.ts menanganinya secara idempoten.`,
      );
    }
    return false;
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
    // Which assistant turn wrote a file (the transcript's per-answer file
    // section, UJI-MANUAL C9b) — see migrations/0014_white_sentinel.sql.
    "ALTER TABLE chat_thread_files ADD COLUMN message_id TEXT",
    "ALTER TABLE chat_threads ADD COLUMN queue_paused INTEGER DEFAULT 0 NOT NULL",
    // Fase 5.5: harga per juta token untuk perkiraan biaya (diisi user).
    "ALTER TABLE llm_providers ADD COLUMN input_price_per_mtok REAL",
    "ALTER TABLE llm_providers ADD COLUMN output_price_per_mtok REAL",
  ];
  for (const sql of statements) {
    try { runSql(sql); } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Penjaga skema — "menyembuhkan diri" setelah DB cedera (2026-10-04)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kenapa ada: DB yang berpindah antar-laptop lewat zip bisa pulang dalam
 * keadaan di mana `__drizzle_migrations` SUDAH mencatat suatu revisi sementara
 * tabelnya sendiri tidak ikut tersalin — zip diambil saat aplikasi masih
 * berjalan (isi terbaru masih di `data.db-wal`), atau `data.db` disalin tanpa
 * `-wal`/`-shm`-nya. drizzle TIDAK pernah mengulang revisi yang sudah tercatat,
 * jadi aplikasi gagal permanen dengan "no such table" (kejadian nyata: project
 * pindah laptop, tab Traceability mati karena `business_requirements` hilang
 * sementara `projects` ada; markdown-nya sendiri utuh di folder project).
 *
 * Yang dilakukan: membaca berkas migrasi dan MENJALANKAN ULANG tiap pernyataan,
 * toleran terhadap error yang berarti "sudah ada" (`already exists`,
 * `duplicate column name`). Urutannya sama dengan urutan migrasi, sehingga tabel
 * yang hilang dibuat lengkap dengan indeks dan kolomnya.
 *
 * Batas yang disengaja:
 *  - Pernyataan merusak (DROP/RENAME/INSERT/UPDATE/DELETE — mis. rebuild tabel
 *    yang di-generate drizzle-kit) DILEWATI: replay tidak boleh menyentuh data.
 *  - Dijalankan hanya bila diperlukan (migrate() berhenti, atau ada tabel yang
 *    seharusnya ada tetapi tidak ada), jadi DB sehat tidak membayar apa pun.
 *  - Nama tabel yang diharapkan dibaca DARI BERKAS MIGRASI, bukan dari daftar
 *    manual, supaya tidak bisa melenceng dari skema yang dikirim aplikasi.
 */
const STATEMENT_SPLITTER = /-->\s*statement-breakpoint/;
const DESTRUCTIVE_STATEMENT = /^(DROP|INSERT|UPDATE|DELETE)\b|RENAME\s+TO/i;
const ALREADY_APPLIED = /already exists|duplicate column name/i;

function migrationFiles(): string[] {
  try {
    return fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  } catch {
    return [];
  }
}

/** Nama tabel (termasuk FTS virtual) yang seharusnya ada setelah semua migrasi. */
function expectedTables(): string[] {
  const names = new Set<string>();
  for (const file of migrationFiles()) {
    let sql = "";
    try {
      sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    } catch {
      continue;
    }
    for (const m of sql.matchAll(/CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?([A-Za-z_][A-Za-z0-9_]*)/gi)) {
      names.add(m[1]);
    }
  }
  return [...names];
}

function repairMissingSchema(
  runStatement: (statement: string) => void,
  listNames: () => string[],
  migrationsStopped: boolean,
): void {
  const expected = expectedTables();
  if (!expected.length) return; // folder migrasi tidak terbaca — tidak ada yang bisa dipulihkan di sini

  const missing = () => {
    const have = new Set(listNames());
    return expected.filter((n) => !have.has(n));
  };

  const before = missing();
  if (!before.length && !migrationsStopped) return; // sehat dan jurnal utuh — nol biaya
  if (before.length) {
    console.warn(`[db] skema tidak lengkap: ${before.join(", ")} — memperbaiki dari berkas migrasi…`);
  }

  let applied = 0;
  let skipped = 0;
  const failed: string[] = [];
  for (const file of migrationFiles()) {
    const content = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    for (const raw of content.split(STATEMENT_SPLITTER)) {
      const stmt = raw.replace(/^\s*--[^\n]*$/gm, "").trim();
      if (!stmt) continue;
      if (DESTRUCTIVE_STATEMENT.test(stmt)) {
        skipped++;
        continue;
      }
      try {
        runStatement(stmt);
        applied++;
      } catch (err) {
        const msg = String((err as { message?: string })?.message ?? err).split("\n")[0];
        if (!ALREADY_APPLIED.test(msg)) failed.push(`${file}: ${msg}`);
      }
    }
  }

  const after = missing();
  if (after.length) {
    console.warn(
      `[db] PERINGATAN: perbaikan skema tidak tuntas (${applied} pernyataan dijalankan, ${skipped} dilewati, ${failed.length} gagal).\n` +
        `     Tabel yang masih hilang: ${after.join(", ")}.\n` +
        `     Berkas DB kemungkinan rusak: tutup aplikasi, pindahkan data.db (beserta -wal/-shm) keluar dari folder data aplikasi, lalu buka lagi — skema akan dibuat dari nol.`,
    );
  } else if (before.length) {
    console.warn(`[db] perbaikan skema selesai: ${before.length} tabel dipulihkan (${applied} pernyataan dijalankan, ${skipped} dilewati).`);
  } else {
    console.warn(`[db] migrasi tertinggal tetapi skema lengkap — replay idempoten dijalankan (${applied} pernyataan, ${skipped} dilewati).`);
  }
  if (failed.length) {
    console.warn(`[db] pernyataan yang gagal di luar 'sudah ada': ${failed.slice(0, 5).join("; ")}`);
  }
}

// Runtime detection: Bun ships bun:sqlite built-in. Under Node.js we use the
// better-sqlite3 driver instead (never loaded under Bun — it crashes the Bun
// process, so the branches below are strictly exclusive).
const isBun = typeof Bun !== "undefined";

/** Satu pernyataan lewat driver aktif: Bun `run`, Node lewat prepared `run`. */
function driverRunStatement(statement: string) {
  return isBun ? rawSqlite.run(statement) : rawSqlite.prepare(statement).run();
}

/** Nama tabel & view yang ada sekarang — bahan pemeriksaan penjaga skema. */
function driverListNames(): string[] {
  const query = "SELECT name FROM sqlite_master WHERE type IN ('table','view')";
  const rows = isBun ? rawSqlite.query(query).all() : rawSqlite.prepare(query).all();
  return (rows as { name: string }[]).map((r) => r.name);
}

/**
 * Menjalankan penjaga skema SEKARANG, tanpa menunggu restart aplikasi — dipakai
 * suite verifikasi (`plan/agent-chat/spike/verify-schema-repair.ts`) dan berguna
 * manual setelah `data.db` dipulihkan dari salinan yang cedera.
 * `force` menjalankan replay walau tidak ada tabel yang hilang (memperbaiki
 * kolom yang tertinggal).
 */
export function repairSchemaNow(force = true): void {
  repairMissingSchema(driverRunStatement, driverListNames, force);
}

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
  const migrationsComplete = runDrizzleMigrations(() => migrate(db, { migrationsFolder: migrationsDir }));
  // Penjaga skema: lihat penjelasan di repairMissingSchema(). Dijalankan SEBELUM
  // applyMigrations() supaya tabel yang hilang sudah ada saat ALTER berjalan.
  repairMissingSchema(driverRunStatement, driverListNames, !migrationsComplete);
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
  const migrationsComplete = runDrizzleMigrations(() => migrate(db, { migrationsFolder: migrationsDir }));
  // Penjaga skema: lihat penjelasan di repairMissingSchema().
  repairMissingSchema(driverRunStatement, driverListNames, !migrationsComplete);
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
