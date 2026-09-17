/**
 * `code_search` (FR-I5).
 *
 * Three modes, because they answer three different questions and mixing them
 * wastes the model's context: `symbol` = "where is X declared", `text` = "where is
 * this phrase", `path` = "which file is called something like this".
 *
 * The output is grouped per file with line numbers on purpose: a flat list of
 * snippets from fifteen files is unreadable, and `path:line` is what lets the
 * agent jump straight to the spot with `read_file` instead of reading whole files.
 */
import { z } from "zod";
import { tool } from "../ai";
import { ensureIndexed, getIndexStatus, indexProject } from "./service";
import { getSearchBackend } from "./backend";

const LIMITS = { results: 60, snippetChars: 400, perFile: 4 } as const;

export interface CodeSearchContext {
  projectId: string;
  root: string;
}

/** Groups hits by file so one chatty file cannot fill the whole result list. */
function groupByPath<T extends { path: string }>(hits: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const hit of hits) {
    const list = map.get(hit.path) ?? [];
    if (list.length < LIMITS.perFile) list.push(hit);
    map.set(hit.path, list);
  }
  return map;
}

export function buildCodeSearchTool(ctx: CodeSearchContext) {
  return tool({
    description:
      "Cari di index project: `symbol` untuk menemukan di mana sebuah nama dideklarasikan (fungsi, kelas, heading markdown, tabel DBML), " +
      "`text` untuk mencari frasa di dalam isi berkas, `path` untuk mencari berkas berdasarkan namanya. " +
      "Hasilnya dikelompokkan per berkas dengan nomor baris — pakai read_file untuk membuka bagian yang relevan, jangan membaca berkas utuh.",
    inputSchema: z.object({
      query: z.string().describe("Kata atau frasa yang dicari"),
      mode: z.enum(["symbol", "text", "path"]).optional().describe("Default: text"),
      limit: z.number().int().min(1).max(LIMITS.results).optional(),
    }),
    execute: async ({ query, mode, limit }) => {
      const trimmed = query.trim();
      if (!trimmed) throw new Error("Query kosong.");

      // A fresh project (or a first search) builds its index here, so search works
      // without the user configuring anything first (acceptance criterion 7).
      const first = ensureIndexed(ctx.projectId, ctx.root);
      const backend = getSearchBackend();
      const effectiveMode = mode ?? "text";
      const limit2 = limit ?? (effectiveMode === "symbol" ? 30 : 20);
      const req = { projectId: ctx.projectId, query: trimmed, limit: limit2 };

      const lines: string[] = [];
      if (first.built) {
        const st = getIndexStatus(ctx.projectId);
        lines.push(`(Index project dibuat sekarang: ${st.stats.files} berkas, ${st.stats.chunks} bagian.)`, "");
      }

      if (effectiveMode === "symbol") {
        const hits = backend.symbols(req);
        if (!hits.length) return [...lines, `Tidak ada simbol yang cocok dengan "${trimmed}".`].join("\n");
        const byPath = groupByPath(hits);
        lines.push(`${hits.length} simbol cocok dengan "${trimmed}":`);
        for (const [file, list] of byPath) {
          lines.push(`\n${file}`);
          for (const hit of list) lines.push(`  ${hit.line}: ${hit.kind} ${hit.name}`);
        }
        return lines.join("\n");
      }

      if (effectiveMode === "path") {
        const hits = backend.paths(req);
        if (!hits.length) return [...lines, `Tidak ada berkas yang namanya memuat "${trimmed}".`].join("\n");
        lines.push(`${hits.length} berkas cocok:`);
        for (const hit of hits) lines.push(`  ${hit.path}  (${hit.chunkCount} bagian terindeks)`);
        return lines.join("\n");
      }

      const hits = backend.text(req);
      if (!hits.length) return [...lines, `Tidak ada isi berkas yang memuat "${trimmed}".`].join("\n");
      const byPath = groupByPath(hits);
      lines.push(`${hits.length} kecocokan di ${byPath.size} berkas untuk "${trimmed}":`);
      for (const [file, list] of byPath) {
        lines.push(`\n${file}`);
        for (const hit of list) {
          const snippet = hit.snippet.replace(/\s+/g, " ").trim().slice(0, LIMITS.snippetChars);
          lines.push(`  ${hit.label ? `[${hit.label}] ` : ""}${snippet}`);
        }
      }
      return lines.join("\n");
    },
  });
}

export { indexProject };
