import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Database } from "bun:sqlite";
import * as schema from "~/server/db/schema";
import path from "node:path";

const dbPath = path.resolve(process.cwd(), "data.db");
const sqlite = new Database(dbPath);
sqlite.run("PRAGMA journal_mode = WAL");
sqlite.run("PRAGMA foreign_keys = ON");

// Migration: add rootPath column (if not already present)
try { sqlite.run("ALTER TABLE projects ADD COLUMN root_path TEXT"); } catch {}
try { sqlite.run("ALTER TABLE projects ADD COLUMN skills_status TEXT DEFAULT 'pending'"); } catch {}
try { sqlite.run("ALTER TABLE projects ADD COLUMN skills_error TEXT"); } catch {}
try { sqlite.run("ALTER TABLE projects ADD COLUMN skills_updated_at TEXT"); } catch {}

// Migration: task metadata columns (code, source_path, phase)
try { sqlite.run("ALTER TABLE tasks ADD COLUMN code TEXT"); } catch {}
try { sqlite.run("ALTER TABLE tasks ADD COLUMN source_path TEXT"); } catch {}
try { sqlite.run("ALTER TABLE tasks ADD COLUMN phase TEXT"); } catch {}

// Migration: fsd_session document metadata columns
try { sqlite.run("ALTER TABLE fsd_sessions ADD COLUMN title TEXT"); } catch {}
try { sqlite.run("ALTER TABLE fsd_sessions ADD COLUMN source_type TEXT DEFAULT 'manual'"); } catch {}
try { sqlite.run("ALTER TABLE fsd_sessions ADD COLUMN source_file_path TEXT"); } catch {}
try { sqlite.run("ALTER TABLE fsd_sessions ADD COLUMN markdown_path TEXT"); } catch {}
try { sqlite.run("ALTER TABLE fsd_sessions ADD COLUMN completeness_json TEXT"); } catch {}
try { sqlite.run("ALTER TABLE fsd_sessions ADD COLUMN content_hash TEXT"); } catch {}
try { sqlite.run("ALTER TABLE fsd_sessions ADD COLUMN generated_from_hash TEXT"); } catch {}
try { sqlite.run("ALTER TABLE fsd_sessions ADD COLUMN conversion_status TEXT"); } catch {}
try { sqlite.run("ALTER TABLE fsd_sessions ADD COLUMN conversion_error TEXT"); } catch {}

export const db = drizzle(sqlite, { schema });

// Auto-run migrations on startup
const migrationsDir = path.resolve(import.meta.dirname, "migrations");
migrate(db, { migrationsFolder: migrationsDir });
