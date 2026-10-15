/**
 * Chat threads as tools for MCP clients. A thread is the record of decisions made
 * with the native agent; an agent running outside Onesist (Claude Code, OpenCode)
 * reads it here instead of being told again. Read-only, scoped to one project.
 */
import { z } from "zod";
import { tool } from "~/server/agent/ai";
import { getThread, listMessagePage, listThreads, messageText } from "~/server/agent/store";

export const THREAD_READ_DEFAULT_LIMIT = 20;
export const THREAD_READ_MAX_LIMIT = 50;

function partsOf(contentJson: string | null): unknown {
  if (!contentJson) return [];
  try {
    return JSON.parse(contentJson);
  } catch {
    return [];
  }
}

export function buildThreadTools(projectId: string) {
  const threadList = tool({
    description:
      "Daftar thread chat di project ini: id, judul, dan waktu terakhir diperbarui. Pakai id-nya untuk onesist_thread_read.",
    inputSchema: z.object({
      include_archived: z.boolean().optional().describe("Sertakan thread yang sudah diarsipkan"),
    }),
    execute: async ({ include_archived }) => {
      const rows = listThreads(projectId, include_archived ?? false);
      if (!rows.length) return "Belum ada thread chat di project ini.";
      return rows
        .map((t) => `${t.id} · ${t.title ?? "(tanpa judul)"} · diperbarui ${t.updatedAt ?? "-"}${t.archived ? " · diarsipkan" : ""}`)
        .join("\n");
    },
  });

  const threadRead = tool({
    description:
      "Baca isi satu thread chat project ini, mulai dari pesan terbaru. Berhalaman: kalau masih ada pesan yang lebih lama, " +
      "hasilnya menyebut before_seq untuk halaman berikutnya. Langkah tool tidak ikut, hanya teks percakapan.",
    inputSchema: z.object({
      thread_id: z.string().describe("Id thread dari onesist_thread_list"),
      before_seq: z.number().int().optional().describe("Ambil pesan sebelum nomor urut ini (halaman berikutnya)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(THREAD_READ_MAX_LIMIT)
        .optional()
        .describe(`Jumlah pesan per halaman, bawaan ${THREAD_READ_DEFAULT_LIMIT}`),
    }),
    execute: async ({ thread_id, before_seq, limit }) => {
      const thread = getThread(thread_id);
      if (!thread || thread.projectId !== projectId) throw new Error(`Thread ${thread_id} tidak ada di project ini.`);
      const page = listMessagePage(thread_id, { beforeSeq: before_seq, limit: limit ?? THREAD_READ_DEFAULT_LIMIT });
      if (!page.rows.length) return "Tidak ada pesan pada halaman ini.";
      const lines = page.rows
        .filter((row) => row.role !== "tool")
        .map((row) => `#${row.seq} ${row.role}: ${messageText(partsOf(row.contentJson)) || "(tanpa teks — hanya langkah tool)"}`);
      const more = page.hasMore ? `\n\nMasih ada pesan lebih lama: panggil lagi dengan before_seq=${page.rows[0].seq}.` : "";
      return `Thread "${thread.title ?? "(tanpa judul)"}"\n\n${lines.join("\n\n")}${more}`;
    },
  });

  return { threadList, threadRead };
}
