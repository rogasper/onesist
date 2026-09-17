/**
 * Index storage (FR-I1).
 *
 * Rows live in the app database next to everything else, keyed by project. Three
 * tables plus one FTS5 virtual table:
 *
 *   index_files   one row per indexed file (size, mtime, counts) — the ledger the
 *                 status panel reads and the incremental path consults
 *   index_chunks  the searchable pieces with their line ranges
 *   index_symbols declarations, for symbol mode
 *   index_fts     FTS5 over chunk text; `bm25()` ranks, so results are ordered by
 *                 relevance rather than by file order
 *
 * Why FTS5 rather than LIKE: FTS5 is built into both SQLite drivers this app uses
 * (verified in Bun and better-sqlite3, including `bm25`), it needs no dependency
 * and no network call (FR-I1), and a `LIKE '%x%'` scan over every chunk would get
 * slower with exactly the projects where search matters most.
 */
import { sql } from "drizzle-orm";
import { db } from "~/server/db/client";
import type { IndexChunk } from "./chunk";
import type { IndexSymbol } from "./symbols";

/** DDL shared by the drizzle migration (fresh DBs) and the runtime migration path
 *  (existing DBs). Every statement is `IF NOT EXISTS`, so applying it twice is
 *  harmless — the same rule the chat tables follow. */
export const INDEX_DDL = [
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
  // Regular (not contentless) FTS5 table: DELETE has to work per project and per
  // file, and a contentless table cannot delete a row.
  `CREATE VIRTUAL TABLE IF NOT EXISTS index_fts USING fts5(
    text, path UNINDEXED, label UNINDEXED, chunk_id UNINDEXED, project_id UNINDEXED,
    tokenize='unicode61 remove_diacritics 2'
  )`,
] as const;

export interface FileMeta {
  path: string;
  ext: string;
  size: number;
  mtimeMs: number;
  chunkCount: number;
  symbolCount: number;
}

function newRowId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Replaces a file's rows in one go. Delete-then-insert rather than a diff: the
 *  chunks of a file are derived data, so recomputing them is cheaper and far less
 *  error-prone than reconciling them. */
export function replaceFile(input: { projectId: string; path: string; ext: string; size: number; mtimeMs: number; chunks: IndexChunk[]; symbols: IndexSymbol[] }): void {
  deleteFile(input.projectId, input.path);
  const now = new Date().toISOString();

  for (const [ord, chunk] of input.chunks.entries()) {
    const chunkId = newRowId("chk");
    db.run(sql`INSERT INTO index_chunks (id, project_id, path, ord, kind, label, start_line, end_line, text)
      VALUES (${chunkId}, ${input.projectId}, ${input.path}, ${ord}, ${chunk.kind}, ${chunk.label}, ${chunk.startLine}, ${chunk.endLine}, ${chunk.text})`);
    db.run(sql`INSERT INTO index_fts (text, path, label, chunk_id, project_id)
      VALUES (${chunk.text}, ${input.path}, ${chunk.label}, ${chunkId}, ${input.projectId})`);
  }

  for (const symbol of input.symbols) {
    db.run(sql`INSERT INTO index_symbols (id, project_id, path, name, kind, line, container)
      VALUES (${newRowId("sym")}, ${input.projectId}, ${input.path}, ${symbol.name}, ${symbol.kind}, ${symbol.line}, ${symbol.container ?? null})`);
  }

  db.run(sql`INSERT INTO index_files (id, project_id, path, ext, size, mtime_ms, chunk_count, symbol_count, indexed_at)
    VALUES (${newRowId("idx")}, ${input.projectId}, ${input.path}, ${input.ext}, ${input.size}, ${input.mtimeMs}, ${input.chunks.length}, ${input.symbols.length}, ${now})
    ON CONFLICT(project_id, path) DO UPDATE SET
      ext = excluded.ext, size = excluded.size, mtime_ms = excluded.mtime_ms,
      chunk_count = excluded.chunk_count, symbol_count = excluded.symbol_count, indexed_at = excluded.indexed_at`);
}

/** Removes every trace of a file — including its FTS rows, which is what makes a
 *  deleted file stop appearing in search results (acceptance criterion 6). */
export function deleteFile(projectId: string, filePath: string): void {
  db.run(sql`DELETE FROM index_fts WHERE project_id = ${projectId} AND path = ${filePath}`);
  db.run(sql`DELETE FROM index_chunks WHERE project_id = ${projectId} AND path = ${filePath}`);
  db.run(sql`DELETE FROM index_symbols WHERE project_id = ${projectId} AND path = ${filePath}`);
  db.run(sql`DELETE FROM index_files WHERE project_id = ${projectId} AND path = ${filePath}`);
}

export function clearProject(projectId: string): void {
  for (const table of ["index_fts", "index_chunks", "index_symbols", "index_files"]) {
    db.run(sql.raw(`DELETE FROM ${table} WHERE project_id = '${projectId.replace(/'/g, "''")}'`));
  }
}

export function fileMeta(projectId: string, filePath: string): FileMeta | null {
  // `db.all(...)[0]`, not `db.get(...)`: under Bun's driver `get()` returns the
  // raw column values as an array, so a named-property read silently yields
  // undefined — which looked exactly like "no rows" the first time around.
  const row = (db.all(sql`SELECT path, ext, size, mtime_ms, chunk_count, symbol_count FROM index_files WHERE project_id = ${projectId} AND path = ${filePath}`) as any[])[0];
  if (!row) return null;
  return { path: row.path, ext: row.ext, size: row.size, mtimeMs: row.mtime_ms, chunkCount: row.chunk_count, symbolCount: row.symbol_count };
}

export function indexedPaths(projectId: string): Map<string, { size: number; mtimeMs: number }> {
  const rows = db.all(sql`SELECT path, size, mtime_ms FROM index_files WHERE project_id = ${projectId}`) as any[];
  return new Map(rows.map((r) => [r.path as string, { size: r.size as number, mtimeMs: r.mtime_ms as number }]));
}

export function stats(projectId: string): { files: number; chunks: number; symbols: number; bytes: number; lastIndexedAt: string | null } {
  const one = (query: ReturnType<typeof sql>) => (db.all(query) as any[])[0];
  const files = one(sql`SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes, MAX(indexed_at) AS last FROM index_files WHERE project_id = ${projectId}`);
  const chunks = one(sql`SELECT COUNT(*) AS n FROM index_chunks WHERE project_id = ${projectId}`);
  const symbols = one(sql`SELECT COUNT(*) AS n FROM index_symbols WHERE project_id = ${projectId}`);
  return {
    files: Number(files?.n ?? 0),
    chunks: Number(chunks?.n ?? 0),
    symbols: Number(symbols?.n ?? 0),
    bytes: Number(files?.bytes ?? 0),
    lastIndexedAt: (files?.last as string) ?? null,
  };
}

export interface TextHit {
  path: string;
  label: string | null;
  snippet: string;
  rank: number;
}

/** FTS5 text search. The query is sanitised into a phrase-per-token OR query:
 *  raw user/model input containing `"` or `*` would otherwise be FTS syntax and
 *  throw (or silently change meaning). */
export function searchText(projectId: string, query: string, limit: number): TextHit[] {
  const terms = query
    .replace(/["'*()^:]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1)
    .slice(0, 8);
  if (!terms.length) return [];

  const match = terms.map((t) => `"${t}"`).join(" OR ");
  const rows = db.all(
    sql`SELECT path, label, snippet(index_fts, 0, '', '', '…', 12) AS snippet, bm25(index_fts) AS rank
        FROM index_fts
        WHERE project_id = ${projectId} AND index_fts MATCH ${match}
        ORDER BY rank
        LIMIT ${limit}`,
  ) as any[];
  return rows.map((r) => ({ path: r.path as string, label: (r.label as string) ?? null, snippet: String(r.snippet ?? ""), rank: Number(r.rank ?? 0) }));
}

export interface SymbolHit {
  path: string;
  name: string;
  kind: string;
  line: number;
}

export function searchSymbols(projectId: string, query: string, limit: number): SymbolHit[] {
  const q = query.trim();
  if (!q) return [];
  // Prefix match on the name first (what people type), then a contains pass.
  const rows = db.all(
    sql`SELECT path, name, kind, line FROM index_symbols
        WHERE project_id = ${projectId} AND (name LIKE ${`${q}%`} OR name LIKE ${`%${q}%`})
        ORDER BY CASE WHEN name LIKE ${`${q}%`} THEN 0 ELSE 1 END, name
        LIMIT ${limit}`,
  ) as any[];
  return rows.map((r) => ({ path: r.path as string, name: r.name as string, kind: r.kind as string, line: Number(r.line ?? 0) }));
}

export function searchPaths(projectId: string, query: string, limit: number): { path: string; chunkCount: number }[] {
  const rows = db.all(
    sql`SELECT path, chunk_count FROM index_files
        WHERE project_id = ${projectId} AND path LIKE ${`%${query}%`}
        ORDER BY path LIMIT ${limit}`,
  ) as any[];
  return rows.map((r) => ({ path: r.path as string, chunkCount: Number(r.chunk_count ?? 0) }));
}
