/**
 * The schema guard has to converge: a database whose `__drizzle_migrations`
 * lags behind the migration files must end up with a complete journal, so the
 * next start neither warns nor replays anything.
 *
 *   bun test src/server/db/schema-guard.test.ts
 */
import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import * as schema from "./schema";
import { guardSchema, readJournal, type SchemaGuardDb } from "./schema-guard";

const MIGRATIONS = path.resolve(import.meta.dir, "migrations");
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** The guard's view of one bun:sqlite connection. */
function adapter(sqlite: Database): SchemaGuardDb {
  return {
    run: (sql) => {
      sqlite.run(sql);
    },
    all: (sql) => sqlite.prepare(sql).all() as Record<string, unknown>[],
    migrationState: () => {
      try {
        const row = sqlite
          .prepare(`SELECT COUNT(*) AS recorded, MAX(created_at) AS last FROM "__drizzle_migrations"`)
          .get() as { recorded?: unknown; last?: unknown } | null;
        return {
          recorded: Number(row?.recorded ?? 0),
          lastWhen: row?.last === null || row?.last === undefined ? null : Number(row.last),
        };
      } catch {
        return { recorded: 0, lastWhen: null };
      }
    },
  };
}

function migrateFully(file: string): void {
  const sqlite = new Database(file);
  sqlite.run("PRAGMA foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: MIGRATIONS });
  sqlite.close();
}

function journalRows(file: string): number {
  const sqlite = new Database(file, { readonly: true });
  const row = sqlite.prepare(`SELECT COUNT(*) AS n FROM "__drizzle_migrations"`).get() as { n: number };
  sqlite.close();
  return row.n;
}

function tableNames(sqlite: Database): Set<string> {
  return new Set(
    (sqlite.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all() as { name: string }[]).map(
      (row) => row.name,
    ),
  );
}

function columnNames(sqlite: Database, table: string): Set<string> {
  return new Set(
    (sqlite.prepare(`PRAGMA table_info("${table}")`).all() as { name: string }[]).map((row) => row.name),
  );
}

function writeMigrations(entries: { tag: string; when: number; sql: string }[]): string {
  const dir = tempDir("onesist-migrations-");
  fs.mkdirSync(path.join(dir, "meta"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "sqlite",
      entries: entries.map((entry, idx) => ({ idx, version: "6", when: entry.when, tag: entry.tag, breakpoints: true })),
    }),
  );
  for (const entry of entries) fs.writeFileSync(path.join(dir, `${entry.tag}.sql`), entry.sql);
  return dir;
}

describe("#58 — journal reconciliation", () => {
  test("a lagging journal is reconciled completely, and the next start is clean", () => {
    const file = path.join(tempDir("onesist-db-"), "data.db");
    migrateFully(file);

    const total = journalRows(file);
    expect(total).toBeGreaterThan(4);

    // The victim state: an old build stopped after 0003.
    const victim = new Database(file);
    victim.run("DELETE FROM __drizzle_migrations WHERE rowid > 4");
    expect(journalRows(file)).toBe(4);

    const logs: string[] = [];
    const first = guardSchema(adapter(victim), MIGRATIONS, {
      migrationsStopped: true,
      log: (line) => logs.push(line),
    });
    expect(first.journalStoppedAt).toBeNull();
    expect(first.journalRecorded).toBe(total - 4);
    expect(journalRows(file)).toBe(total);
    expect(logs.some((line) => line.includes("migration journal reconciled"))).toBe(true);
    victim.close();

    // Second start on the same file: migrate() must actually pass now.
    const clean = new Database(file);
    const db = drizzle(clean, { schema });
    expect(() => migrate(db, { migrationsFolder: MIGRATIONS })).not.toThrow();

    const secondLogs: string[] = [];
    const second = guardSchema(adapter(clean), MIGRATIONS, {
      migrationsStopped: false,
      log: (line) => secondLogs.push(line),
    });
    expect(second.journalRecorded).toBe(0);
    expect(second.missingTables).toEqual([]);
    expect(second.missingColumns).toEqual([]);
    expect(second.replayedStatements).toBe(0);
    expect(secondLogs).toEqual([]);
    clean.close();
  });

  test("the written rows look like drizzle's own rows", () => {
    const file = path.join(tempDir("onesist-db-"), "data.db");
    migrateFully(file);
    const sqlite = new Database(file);
    sqlite.run("DELETE FROM __drizzle_migrations WHERE rowid > 1");
    guardSchema(adapter(sqlite), MIGRATIONS, { migrationsStopped: true, log: () => {} });

    const journal = readJournal(MIGRATIONS);
    const rows = sqlite
      .prepare(`SELECT hash, created_at FROM "__drizzle_migrations" ORDER BY created_at`)
      .all() as { hash: string; created_at: number }[];
    expect(rows.length).toBe(journal.length);
    expect(rows.map((row) => Number(row.created_at))).toEqual(journal.map((entry) => entry.when));
    for (const row of rows) expect(row.hash).toMatch(/^[0-9a-f]{64}$/);
    sqlite.close();
  });

  test("a missing column is repaired even when every table exists", () => {
    const file = path.join(tempDir("onesist-db-"), "data.db");
    migrateFully(file);
    const sqlite = new Database(file);
    sqlite.run("ALTER TABLE tasks DROP COLUMN archived");
    expect(columnNames(sqlite, "tasks").has("archived")).toBe(false);

    const logs: string[] = [];
    const summary = guardSchema(adapter(sqlite), MIGRATIONS, {
      migrationsStopped: false,
      log: (line) => logs.push(line),
    });
    expect(summary.missingTables).toEqual([]);
    expect(summary.missingColumns).toEqual([{ table: "tasks", column: "archived" }]);
    expect(columnNames(sqlite, "tasks").has("archived")).toBe(true);
    expect(summary.journalRecorded).toBe(0);
    expect(logs.some((line) => line.includes("tasks.archived"))).toBe(true);
    sqlite.close();
  });

  test("a missing table is recreated from the recorded migrations", () => {
    const file = path.join(tempDir("onesist-db-"), "data.db");
    migrateFully(file);
    const sqlite = new Database(file);
    sqlite.run("DROP TABLE app_settings");
    expect(tableNames(sqlite).has("app_settings")).toBe(false);

    const summary = guardSchema(adapter(sqlite), MIGRATIONS, { migrationsStopped: false, log: () => {} });
    expect(summary.missingTables).toEqual(["app_settings"]);
    expect(tableNames(sqlite).has("app_settings")).toBe(true);
    expect(summary.journalRecorded).toBe(0);
    sqlite.close();
  });

  test("a healthy database costs nothing and logs nothing", () => {
    const file = path.join(tempDir("onesist-db-"), "data.db");
    migrateFully(file);
    const sqlite = new Database(file);
    const logs: string[] = [];
    const summary = guardSchema(adapter(sqlite), MIGRATIONS, {
      migrationsStopped: false,
      log: (line) => logs.push(line),
    });
    expect(summary).toMatchObject({
      missingTables: [],
      missingColumns: [],
      replayedStatements: 0,
      journalRecorded: 0,
      journalStoppedAt: null,
    });
    expect(logs).toEqual([]);
    sqlite.close();
  });
});

describe("#58 — unrecorded migrations with data/DDL statements", () => {
  const seed = [
    "CREATE TABLE items (id integer primary key, name text);",
    "INSERT INTO items (id, name) VALUES (1, 'alpha');",
  ].join("--> statement-breakpoint");

  const rebuild = [
    "CREATE TABLE items_new (id integer primary key, name text, note text);",
    "INSERT INTO items_new (id, name) SELECT id, name FROM items;",
    "DROP TABLE items;",
    "ALTER TABLE items_new RENAME TO items;",
  ].join("--> statement-breakpoint");

  test("an unrecorded rebuild migration runs instead of being skipped", () => {
    const dir = writeMigrations([
      { tag: "0000_items", when: 1000, sql: seed },
      { tag: "0001_rebuild", when: 2000, sql: rebuild },
    ]);
    const sqlite = new Database(":memory:");
    const logs: string[] = [];
    const summary = guardSchema(adapter(sqlite), dir, { migrationsStopped: true, log: (line) => logs.push(line) });

    expect(summary.journalRecorded).toBe(2);
    expect(summary.journalStoppedAt).toBeNull();
    expect(columnNames(sqlite, "items").has("note")).toBe(true);
    expect(sqlite.prepare("SELECT id, name FROM items").all()).toEqual([{ id: 1, name: "alpha" }]);
    expect(logs.some((line) => line.includes("repair replay skipped"))).toBe(false);
    sqlite.close();
  });

  test("a rebuild's scratch table is not expected to survive", () => {
    const dir = writeMigrations([
      { tag: "0000_items", when: 1000, sql: seed },
      {
        tag: "0001_rebuild",
        when: 2000,
        sql: [
          "CREATE TABLE `__new_items` (id integer primary key, name text, note text);",
          "INSERT INTO `__new_items` (id, name) SELECT id, name FROM items;",
          "DROP TABLE items;",
          "ALTER TABLE `__new_items` RENAME TO items;",
        ].join("--> statement-breakpoint"),
      },
    ]);
    const sqlite = new Database(":memory:");
    const first = guardSchema(adapter(sqlite), dir, { migrationsStopped: true, log: () => {} });
    expect(first.journalRecorded).toBe(2);
    expect(columnNames(sqlite, "items").has("note")).toBe(true);
    // A rebuild leaves `__new_items` renamed away; expecting it would report a
    // missing table on every start and repair it back as a stray table.
    const logs: string[] = [];
    const second = guardSchema(adapter(sqlite), dir, { migrationsStopped: false, log: (line) => logs.push(line) });
    expect(second.missingTables).toEqual([]);
    expect(second.missingColumns).toEqual([]);
    expect(second.journalRecorded).toBe(0);
    expect(logs).toEqual([]);
    sqlite.close();
  });

  test("a column that a later migration removes is not expected", () => {
    // Rebuild: the new CREATE defines the final shape, `legacy` is gone.
    const rebuildDir = writeMigrations([
      { tag: "0000_items", when: 1000, sql: "CREATE TABLE items (id integer primary key, name text);" },
      { tag: "0001_add", when: 2000, sql: "ALTER TABLE items ADD legacy text;" },
      {
        tag: "0002_rebuild",
        when: 3000,
        sql: [
          "CREATE TABLE `__new_items` (id integer primary key, name text);",
          "INSERT INTO `__new_items` (id, name) SELECT id, name FROM items;",
          "DROP TABLE items;",
          "ALTER TABLE `__new_items` RENAME TO items;",
        ].join("--> statement-breakpoint"),
      },
    ]);
    const rebuilt = new Database(":memory:");
    expect(guardSchema(adapter(rebuilt), rebuildDir, { migrationsStopped: true, log: () => {} }).journalRecorded).toBe(3);
    expect(columnNames(rebuilt, "items").has("legacy")).toBe(false);
    const rebuildLogs: string[] = [];
    const second = guardSchema(adapter(rebuilt), rebuildDir, {
      migrationsStopped: false,
      log: (line) => rebuildLogs.push(line),
    });
    expect(second.missingColumns).toEqual([]);
    expect(rebuildLogs).toEqual([]);
    rebuilt.close();

    // Plain `ALTER TABLE ... DROP COLUMN`.
    const dropDir = writeMigrations([
      { tag: "0000_items", when: 1000, sql: "CREATE TABLE items (id integer primary key, name text, legacy text);" },
      { tag: "0001_add", when: 2000, sql: "ALTER TABLE items ADD legacy text;" },
      { tag: "0002_drop", when: 3000, sql: "ALTER TABLE items DROP COLUMN legacy;" },
    ]);
    const dropped = new Database(":memory:");
    expect(guardSchema(adapter(dropped), dropDir, { migrationsStopped: true, log: () => {} }).journalRecorded).toBe(3);
    const dropLogs: string[] = [];
    const third = guardSchema(adapter(dropped), dropDir, { migrationsStopped: false, log: (line) => dropLogs.push(line) });
    expect(third.missingColumns).toEqual([]);
    expect(dropLogs).toEqual([]);
    dropped.close();
  });

  test("a failing unrecorded migration leaves the journal behind it and reports why", () => {
    const dir = writeMigrations([
      { tag: "0000_items", when: 1000, sql: seed },
      { tag: "0001_broken", when: 2000, sql: "INSERT INTO items (missing_col) VALUES (1);" },
      { tag: "0002_items", when: 3000, sql: "CREATE TABLE later (id integer primary key);" },
    ]);
    const sqlite = new Database(":memory:");
    const logs: string[] = [];
    const summary = guardSchema(adapter(sqlite), dir, { migrationsStopped: true, log: (line) => logs.push(line) });

    expect(summary.journalRecorded).toBe(1);
    expect(summary.journalStoppedAt).toBe("0001_broken");
    expect(readJournal(dir).length).toBe(3);
    expect(logs.some((line) => line.includes("stopped at 0001_broken"))).toBe(true);
    // The savepoint rolled the failed file back, so no partial schema was left.
    expect(tableNames(sqlite).has("later")).toBe(false);
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM items").get()).toEqual({ n: 1 });
    sqlite.close();
  });
});

describe("#58 — the guard never depends on a hard-coded migration number", () => {
  test("the reconciliation counts come from the journal, not from source", () => {
    const dir = writeMigrations([
      { tag: "0000_one", when: 1000, sql: "CREATE TABLE one (id integer primary key);" },
      { tag: "0001_two", when: 2000, sql: "CREATE TABLE two (id integer primary key);" },
      { tag: "0002_three", when: 3000, sql: "CREATE TABLE three (id integer primary key);" },
    ]);
    const sqlite = new Database(":memory:");
    sqlite.run(`CREATE TABLE "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`);
    sqlite.run(`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ('abc', 1000)`);
    const summary = guardSchema(adapter(sqlite), dir, { migrationsStopped: true, log: () => {} });
    expect(summary.journalRecorded).toBe(2);
    sqlite.close();
  });
});
