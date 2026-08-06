import * as schema from "~/server/db/schema";
import path from "node:path";

const dbPath = path.resolve(process.cwd(), "data.db");

function applyMigrations(runSql: (sql: string) => unknown) {
  const statements = [
    // projects columns
    "ALTER TABLE projects ADD COLUMN root_path TEXT",
    "ALTER TABLE projects ADD COLUMN skills_status TEXT DEFAULT 'pending'",
    "ALTER TABLE projects ADD COLUMN skills_error TEXT",
    "ALTER TABLE projects ADD COLUMN skills_updated_at TEXT",
    // task metadata columns (code, source_path, phase)
    "ALTER TABLE tasks ADD COLUMN code TEXT",
    "ALTER TABLE tasks ADD COLUMN source_path TEXT",
    "ALTER TABLE tasks ADD COLUMN phase TEXT",
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
  ];
  for (const sql of statements) {
    try { runSql(sql); } catch {}
  }
}

// Runtime detection: Bun ships bun:sqlite built-in. Under Node.js we use the
// better-sqlite3 driver instead (never loaded under Bun — it crashes the Bun
// process, so the branches below are strictly exclusive).
const isBun = typeof Bun !== "undefined";

const migrationsDir = path.resolve(import.meta.dirname, "migrations");

let db: any;

if (isBun) {
  const { Database } = await import("bun:sqlite");
  const { drizzle } = await import("drizzle-orm/bun-sqlite");
  const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
  const sqlite = new Database(dbPath);
  sqlite.run("PRAGMA journal_mode = WAL");
  sqlite.run("PRAGMA foreign_keys = ON");
  applyMigrations((sql) => sqlite.run(sql));
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDir });
} else {
  const BetterSqlite3 = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new BetterSqlite3(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  applyMigrations((sql) => sqlite.exec(sql));
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: migrationsDir });
}

export { db };
