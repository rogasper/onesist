import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * Schema guard: heals a database whose schema and migration journal disagree.
 *
 * Two states it exists for:
 *  1. An old DB whose runtime ALTERs ran BEFORE drizzle's migrations: a
 *     migration then failed with "duplicate column name", drizzle rolled the
 *     whole sequence back, and the journal never caught up. Every launch warned,
 *     replayed every file, and could never converge — the journal stayed behind
 *     forever because the replay never wrote to it.
 *  2. A data.db copied between machines without its -wal (or while the app was
 *     running) arrives with a journal that records migrations whose tables are
 *     missing. drizzle never re-runs a recorded revision, so the app dies with
 *     "no such table".
 *
 * What it does:
 *  - replays migration files, tolerating what is already there;
 *  - then RECORDS the migrations it has verified in `__drizzle_migrations`
 *    (same hash/created_at format drizzle writes), so the next start is clean;
 *  - checks columns, not only tables, so a missing column is repaired even when
 *    every table exists;
 *  - runs data/DDL statements (DROP/INSERT/UPDATE/DELETE/RENAME) for migrations
 *    the journal has not recorded yet — a rebuild-style migration that is
 *    skipped leaves the schema silently wrong. Those statements run inside a
 *    savepoint: a failure rolls the file back and the journal stays behind it,
 *    so drizzle retries the migration on the next start.
 */

const STATEMENT_SPLITTER = /-->\s*statement-breakpoint/;
const DESTRUCTIVE_STATEMENT = /^(DROP|INSERT|UPDATE|DELETE)\b|RENAME\s+TO/i;
const ALREADY_APPLIED = /already exists|duplicate column name/i;
const MIGRATIONS_TABLE = "__drizzle_migrations";
const MIGRATIONS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at numeric
)`;

export interface MigrationJournalEntry {
  idx: number;
  when: number;
  tag: string;
}

export interface MigrationState {
  /** Rows in `__drizzle_migrations` (0 when the table does not exist yet). */
  recorded: number;
  /** `MAX(created_at)`; drizzle only applies entries whose `when` is greater. */
  lastWhen: number | null;
}

/** The few driver operations the guard needs, so it works on Bun and Node. */
export interface SchemaGuardDb {
  run: (sql: string) => void;
  all: (sql: string) => Record<string, unknown>[];
  migrationState: () => MigrationState;
}

export interface SchemaGuardOptions {
  /** `migrate()` threw, so its journal cannot be trusted as complete. */
  migrationsStopped: boolean;
  /** Replay even when nothing looks missing (manual repair). */
  force?: boolean;
  log?: (message: string) => void;
}

export interface SchemaGuardSummary {
  missingTables: string[];
  missingColumns: { table: string; column: string }[];
  replayedStatements: number;
  skippedDestructive: string[];
  failed: string[];
  /** Journal rows written by this run. */
  journalRecorded: number;
  /** Tag the reconciliation stopped at (schema could not be verified). */
  journalStoppedAt: string | null;
}

export function readJournal(migrationsDir: string): MigrationJournalEntry[] {
  try {
    const raw = fs.readFileSync(path.join(migrationsDir, "meta", "_journal.json"), "utf-8");
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
    return entries
      .filter((entry: unknown) => {
        const item = entry as { tag?: unknown; when?: unknown };
        return typeof item?.tag === "string" && Number.isFinite(Number(item.when));
      })
      .map((entry: { tag: string; when: number; idx?: number }) => ({
        idx: Number(entry.idx ?? 0),
        when: Number(entry.when),
        tag: entry.tag,
      }));
  } catch {
    return [];
  }
}

/** Migration files in journal order; files the journal does not list come last. */
function orderedTags(migrationsDir: string, journal: MigrationJournalEntry[]): string[] {
  const onDisk = (() => {
    try {
      return fs
        .readdirSync(migrationsDir)
        .filter((file) => file.endsWith(".sql"))
        .sort()
        .map((file) => file.slice(0, -4));
    } catch {
      return [];
    }
  })();
  const known = new Set(journal.map((entry) => entry.tag));
  return [...journal.map((entry) => entry.tag), ...onDisk.filter((tag) => !known.has(tag))];
}

function migrationSql(migrationsDir: string, tag: string): string | null {
  try {
    return fs.readFileSync(path.join(migrationsDir, `${tag}.sql`), "utf-8");
  } catch {
    return null;
  }
}

function statements(sql: string): string[] {
  return sql
    .split(STATEMENT_SPLITTER)
    .map((raw) => raw.replace(/^\s*--[^\n]*$/gm, "").trim())
    .filter(Boolean);
}

function firstLine(value: unknown): string {
  return String((value as { message?: unknown })?.message ?? value).split("\n")[0];
}

/** Table names the migration files are expected to leave behind (FTS included). */
export function expectedTableNames(migrationsDir: string, journal = readJournal(migrationsDir)): string[] {
  const names = new Set<string>();
  for (const tag of orderedTags(migrationsDir, journal)) {
    const sql = migrationSql(migrationsDir, tag);
    if (!sql) continue;
    for (const match of sql.matchAll(
      /CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"[]?([A-Za-z_][A-Za-z0-9_]*)/gi,
    )) {
      names.add(match[1]);
    }
  }
  // `__new_x` is drizzle-kit's temporary table for a rebuild migration: it is
  // renamed away before the migration ends, so expecting it would report a
  // missing table on every start — and the repair would leave it behind.
  return [...names].filter((name) => !name.startsWith("__"));
}

/**
 * Columns the migration files add with `ALTER TABLE ... ADD COLUMN`.
 * Columns baked into `CREATE TABLE` are covered by the table check: a table
 * that exists was created by a revision that carried all of its columns.
 */
export function expectedAddedColumns(
  migrationsDir: string,
  journal = readJournal(migrationsDir),
): { table: string; column: string }[] {
  const tags = orderedTags(migrationsDir, journal);
  // Index of the last migration that rebuilds each table. A rebuild defines the
  // final shape, so a column added before it and left out of the new CREATE was
  // dropped on purpose — keeping it would report a missing column forever.
  const lastRebuild = new Map<string, number>();
  const lastDrop = new Map<string, number>();
  tags.forEach((tag, index) => {
    const sql = migrationSql(migrationsDir, tag);
    if (!sql) return;
    for (const statement of statements(sql)) {
      const renamed = /RENAME\s+TO\s+[`"[]?([A-Za-z_][A-Za-z0-9_]*)/i.exec(statement);
      if (renamed) lastRebuild.set(renamed[1], index);
      const dropped = /ALTER\s+TABLE\s+[`"[]?([A-Za-z_][A-Za-z0-9_]*)[`"\]]?\s+DROP\s+(?:COLUMN\s+)?[`"[]?([A-Za-z_][A-Za-z0-9_]*)/i.exec(
        statement,
      );
      if (dropped) lastDrop.set(`${dropped[1]}.${dropped[2]}`, index);
    }
  });

  const seen = new Set<string>();
  const columns: { table: string; column: string }[] = [];
  tags.forEach((tag, index) => {
    const sql = migrationSql(migrationsDir, tag);
    if (!sql) return;
    for (const match of sql.matchAll(
      /ALTER\s+TABLE\s+[`"[]?([A-Za-z_][A-Za-z0-9_]*)[`"\]]?\s+ADD\s+(?:COLUMN\s+)?[`"[]?([A-Za-z_][A-Za-z0-9_]*)/gi,
    )) {
      const [, table, column] = match;
      if (table.startsWith("__")) continue; // rebuild scratch table
      const key = `${table}.${column}`;
      if (index <= (lastRebuild.get(table) ?? -1)) continue; // superseded by a rebuild
      if (index <= (lastDrop.get(key) ?? -1)) continue; // added, then dropped on purpose
      if (seen.has(key)) continue;
      seen.add(key);
      columns.push({ table, column });
    }
  });
  return columns;
}

/** `recorded/total` plus the last tag, for the startup warning text. */
export function journalSummary(
  migrationsDir: string,
  state: MigrationState,
): { recorded: number; total: number; lastRecorded: string | null; lastFile: string | null } {
  const journal = readJournal(migrationsDir);
  // The newest entry the journal row could belong to: exact match first, then the
  // latest entry not newer than the recorded timestamp.
  const lastWhen = state.lastWhen;
  const lastRecorded =
    lastWhen === null
      ? null
      : (journal.find((entry) => entry.when === lastWhen)?.tag ??
        [...journal].reverse().find((entry) => entry.when <= lastWhen)?.tag ??
        null);
  return {
    recorded: state.recorded,
    total: journal.length,
    lastRecorded,
    lastFile: journal.at(-1)?.tag ?? null,
  };
}

export function guardSchema(
  db: SchemaGuardDb,
  migrationsDir: string,
  options: SchemaGuardOptions,
): SchemaGuardSummary {
  const log = options.log ?? ((message: string) => console.warn(message));
  const journal = readJournal(migrationsDir);
  const state = db.migrationState();
  const tags = orderedTags(migrationsDir, journal);
  const pending = journal.filter((entry) => state.lastWhen === null || entry.when > state.lastWhen);

  const expectedTables = expectedTableNames(migrationsDir, journal);
  const expectedColumns = expectedAddedColumns(migrationsDir, journal);
  const tables = new Set(
    db.all("SELECT name FROM sqlite_master WHERE type IN ('table','view')").map((row) => String(row.name)),
  );
  const missingTables = expectedTables.filter((name) => !tables.has(name));
  const missingColumns = expectedColumns.filter(({ table, column }) => {
    if (!tables.has(table)) return false; // reported as a missing table instead
    return !columnNames(db, table).has(column);
  });

  const summary: SchemaGuardSummary = {
    missingTables,
    missingColumns,
    replayedStatements: 0,
    skippedDestructive: [],
    failed: [],
    journalRecorded: 0,
    journalStoppedAt: null,
  };

  const needsRepair = missingTables.length > 0 || missingColumns.length > 0 || options.force === true;
  if (options.migrationsStopped && !journal.length) {
    log("[db] migrations stopped and the journal could not be read — only an idempotent replay is possible");
  }
  if (!needsRepair && !pending.length) return summary; // healthy and journal complete — zero cost

  if (needsRepair) {
    if (missingTables.length) {
      log(`[db] incomplete schema: missing table(s) ${missingTables.join(", ")} — replaying migration files…`);
    }
    if (missingColumns.length) {
      log(
        `[db] incomplete schema: missing column(s) ${missingColumns.map((c) => `${c.table}.${c.column}`).join(", ")} — replaying migration files…`,
      );
    }
    // Repair mode never touches data: it only recreates what is missing.
    // Unrecorded migrations are left entirely to the reconciliation below, which
    // runs them whole (data statements included) and records them — replaying
    // them twice would duplicate work and could duplicate rows.
    const pendingTags = new Set(pending.map((entry) => entry.tag));
    for (const tag of tags) {
      if (pendingTags.has(tag)) continue;
      const sql = migrationSql(migrationsDir, tag);
      if (!sql) continue;
      for (const statement of statements(sql)) {
        if (DESTRUCTIVE_STATEMENT.test(statement)) {
          summary.skippedDestructive.push(`${tag}: ${statement.replace(/\s+/g, " ").slice(0, 80)}`);
          continue;
        }
        try {
          db.run(statement);
          summary.replayedStatements++;
        } catch (err) {
          const message = firstLine(err);
          if (!ALREADY_APPLIED.test(message)) summary.failed.push(`${tag}: ${message}`);
        }
      }
    }
  }

  if (pending.length) {
    let canRecord = true;
    try {
      db.run(MIGRATIONS_TABLE_DDL);
    } catch (err) {
      // A read-only or full disk: the replay below may still fix the schema,
      // but nothing can be recorded. Startup must not die over it.
      canRecord = false;
      summary.journalStoppedAt = pending[0].tag;
      log(`[db] journal reconciliation skipped: ${firstLine(err)}`);
    }
    for (const entry of canRecord ? pending : []) {
      const sql = migrationSql(migrationsDir, entry.tag);
      if (sql === null) {
        summary.journalStoppedAt = entry.tag;
        log(`[db] journal reconciliation stopped at ${entry.tag}: migration file not found`);
        break;
      }
      const outcome = replayUnrecordedMigration(db, sql);
      if (!outcome.ok) {
        summary.journalStoppedAt = entry.tag;
        log(`[db] journal reconciliation stopped at ${entry.tag}: ${outcome.error}`);
        break;
      }
      try {
        insertJournalRow(db, entry, sql);
        summary.journalRecorded++;
      } catch (err) {
        summary.journalStoppedAt = entry.tag;
        log(`[db] journal reconciliation stopped at ${entry.tag}: ${firstLine(err)}`);
        break;
      }
    }
    if (summary.journalRecorded > 0) {
      log(
        `[db] migration journal reconciled: ${summary.journalRecorded} entr${summary.journalRecorded === 1 ? "y" : "ies"} recorded ` +
          `(${state.recorded} → ${state.recorded + summary.journalRecorded} of ${journal.length}).`,
      );
    }
  }

  if (summary.skippedDestructive.length) {
    log(
      `[db] repair replay skipped ${summary.skippedDestructive.length} data/DDL statement(s) from recorded migrations: ` +
        summary.skippedDestructive.slice(0, 3).join("; "),
    );
  }
  if (summary.failed.length) {
    log(`[db] statements that failed beyond 'already applied': ${summary.failed.slice(0, 5).join("; ")}`);
  }

  const stillMissingTables = expectedTables.filter((name) => !currentTables(db).has(name));
  const stillMissingColumns = expectedColumns.filter(({ table, column }) => {
    if (!currentTables(db).has(table)) return false;
    return !columnNames(db, table).has(column);
  });
  if (stillMissingTables.length || stillMissingColumns.length) {
    log(
      `[db] WARNING: schema repair did not finish (${stillMissingTables.length} table(s), ${stillMissingColumns.length} column(s) still missing). ` +
        `The database file is likely damaged: close the app, move data.db (with -wal/-shm) out of the app data folder, then reopen — the schema is rebuilt from scratch.`,
    );
  }

  return summary;
}

function currentTables(db: SchemaGuardDb): Set<string> {
  return new Set(
    db.all("SELECT name FROM sqlite_master WHERE type IN ('table','view')").map((row) => String(row.name)),
  );
}

function columnNames(db: SchemaGuardDb, table: string): Set<string> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) return new Set();
  return new Set(db.all(`PRAGMA table_info("${table}")`).map((row) => String(row.name)));
}

/** Runs one unrecorded migration; a failure rolls the whole file back. */
function replayUnrecordedMigration(db: SchemaGuardDb, sql: string): { ok: boolean; error?: string } {
  db.run("SAVEPOINT onesist_reconcile");
  try {
    for (const statement of statements(sql)) {
      try {
        db.run(statement);
      } catch (err) {
        const message = firstLine(err);
        if (!ALREADY_APPLIED.test(message)) throw err;
      }
    }
    db.run("RELEASE onesist_reconcile");
    return { ok: true };
  } catch (err) {
    try {
      db.run("ROLLBACK TO onesist_reconcile");
      db.run("RELEASE onesist_reconcile");
    } catch {
      /* the savepoint may already be gone — the journal stays behind either way */
    }
    return { ok: false, error: firstLine(err) };
  }
}

/** Same shape drizzle writes: sha256 of the raw file, plus the journal's `when`. */
function insertJournalRow(db: SchemaGuardDb, entry: MigrationJournalEntry, sql: string): void {
  const hash = crypto.createHash("sha256").update(sql).digest("hex");
  db.run(`INSERT INTO "${MIGRATIONS_TABLE}" ("hash", "created_at") VALUES ('${hash}', ${Number(entry.when)})`);
}
