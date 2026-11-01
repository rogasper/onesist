import { useEffect, useMemo, useState } from "react";
import { extractDbml, parseDbml } from "~/lib/dbml";
import type { FileEntry } from "~/lib/use-file-data";

export type DbmlFileStatus = { tables: number } | { error: true };
export type DbmlFileStatusMap = Record<string, DbmlFileStatus | undefined>;

const MAX_PROBE_BYTES = 2 * 1024 * 1024;
const CONCURRENCY = 4;

interface CacheEntry {
  key: string;
  tables: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(projectId: string, file: FileEntry): string {
  return `${projectId}:${file.path}`;
}

function fileKey(file: FileEntry): string {
  return `${file.size}:${file.modifiedAt}`;
}

export function useDbmlFileStatus(files: FileEntry[], projectId: string): DbmlFileStatusMap {
  const [state, setState] = useState<DbmlFileStatusMap>({});
  const candidates = useMemo(
    () => files.filter((file) => file.ext === ".dbml" || file.ext === ".md"),
    [files],
  );

  useEffect(() => {
    let cancelled = false;
    const queue = candidates.filter((file) => {
      if (file.size > MAX_PROBE_BYTES) return false;
      const cached = cache.get(cacheKey(projectId, file));
      return !cached || cached.key !== fileKey(file);
    });
    if (queue.length === 0) return;

    let next = 0;
    const worker = async () => {
      while (!cancelled) {
        const file = queue[next];
        next += 1;
        if (!file) return;
        try {
          const res = await fetch(
            `/api/files/read?path=${encodeURIComponent(file.path)}&projectId=${encodeURIComponent(projectId)}`,
            { cache: "no-store" },
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const extracted = extractDbml(String(data.content ?? ""), file.ext === ".md");
          const tables = parseDbml(extracted.dbml).tables.length;
          cache.set(cacheKey(projectId, file), { key: fileKey(file), tables });
          if (!cancelled) setState((prev) => ({ ...prev, [file.path]: { tables } }));
        } catch {
          if (!cancelled) setState((prev) => ({ ...prev, [file.path]: { error: true } }));
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    return () => {
      cancelled = true;
    };
  }, [candidates, projectId]);

  return useMemo(() => {
    const map: DbmlFileStatusMap = {};
    for (const file of candidates) {
      const current = state[file.path];
      if (current) {
        map[file.path] = current;
        continue;
      }
      if (file.size > MAX_PROBE_BYTES) {
        map[file.path] = { error: true };
        continue;
      }
      const cached = cache.get(cacheKey(projectId, file));
      if (cached && cached.key === fileKey(file)) map[file.path] = { tables: cached.tables };
    }
    return map;
  }, [state, candidates, projectId]);
}
