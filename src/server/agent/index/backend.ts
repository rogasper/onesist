/**
 * Search backend seam (FR-I8).
 *
 * The tool talks to this interface and never to FTS5 directly. That is what keeps
 * "add embeddings later" a matter of implementing three methods rather than
 * rewriting search, its ranking, and its result shape.
 */
import { searchPaths, searchSymbols, searchText, type SymbolHit, type TextHit } from "./store";

export interface SearchRequest {
  projectId: string;
  query: string;
  limit: number;
}

export interface PathHit {
  path: string;
  chunkCount: number;
}

export interface SearchBackend {
  /** Full-text search over chunk contents. */
  text(req: SearchRequest): TextHit[];
  /** Declarations by name (FR-I4). */
  symbols(req: SearchRequest): SymbolHit[];
  /** Files by path fragment. */
  paths(req: SearchRequest): PathHit[];
}

/** FTS5 + symbol tables. Synchronous: everything it needs is local SQLite. */
export const ftsBackend: SearchBackend = {
  text: ({ projectId, query, limit }) => searchText(projectId, query, limit),
  symbols: ({ projectId, query, limit }) => searchSymbols(projectId, query, limit),
  paths: ({ projectId, query, limit }) => searchPaths(projectId, query, limit),
};

/** Swappable for tests, and the extension point for a future embeddings backend. */
let backend: SearchBackend = ftsBackend;

export function getSearchBackend(): SearchBackend {
  return backend;
}

export function setSearchBackend(next: SearchBackend): void {
  backend = next;
}
