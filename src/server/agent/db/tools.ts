/**
 * Database tools for the agent (Fase 6, FR-M1..M3) and the app-write tool (FR-M5).
 *
 * Why these exist at all: three tabs (Tasks, RTM, Wiki) read the SQLite database
 * rather than files, so without database access the agent cannot see — or
 * correctly talk about — half the app's state. The alternative was not "no
 * database access": `bash` already reached it through the inherited environment.
 * This replaces an accidental, unlimited path with a designed, read-only one.
 */
import { z } from "zod";
import { tool } from "../ai";
import { runReadOnlyQuery } from "~/server/db/client";
import { handleApiRequest } from "~/server/api-router";
import { DB_LIMITS, checkStatement, visibleColumns } from "./guard";

export interface DbToolContext {
  projectId: string;
  /** Kuota izin thread, untuk pesan error yang bisa ditindaklanjuti. */
  permissionMode: string;
}

/** Nama tabel yang boleh ditulis lewat `app_write` (FR-M5).
 *
 *  Whitelist, bukan "semua endpoint": jalur tulis ke permukaan berbasis DB harus
 *  eksplisit, dan setiap penambahan di sini adalah keputusan sadar. */
const WRITABLE_PREFIXES = [
  "projects/:id/tasks",
  "projects/:id/rtm",
  "projects/:id/wiki",
] as const;

function rowsToText(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "(tidak ada baris)";
  // Nilai dipotong supaya satu kolom teks panjang tidak memenuhi konteks.
  const compact = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = typeof v === "string" && v.length > 300 ? `${v.slice(0, 300)}…` : v;
    }
    return out;
  });
  return JSON.stringify(compact, null, 1);
}

export function buildDbTools(ctx: DbToolContext) {
  const dbQuery = tool({
    description:
      "Jalankan satu query SELECT ke database aplikasi (read-only). Pakai `db_schema` lebih dulu untuk melihat tabel dan kolomnya. " +
      "Berguna untuk data yang TIDAK ada di berkas: task, RTM, wiki, riwayat percakapan, dan biaya token. " +
      "Hasilnya dipotong pada " +
      String(DB_LIMITS.rows) +
      " baris; pakai agregat (COUNT/GROUP BY) kalau butuh ringkasan. " +
      "Kolom yang memuat kredensial tidak bisa dibaca dan akan ditolak dengan penjelasan.",
    inputSchema: z.object({
      sql: z.string().describe("Satu pernyataan SELECT atau WITH"),
    }),
    execute: async ({ sql }) => {
      const check = checkStatement(sql);
      if (!check.ok) throw new Error(check.error);
      try {
        const { rows, truncated } = await runReadOnlyQuery(sql, DB_LIMITS.rows);
        const suffix = truncated ? `\n\n… dipotong pada ${DB_LIMITS.rows} baris. Pakai LIMIT/agregat untuk mempersempit.` : "";
        return `${rows.length} baris:\n${rowsToText(rows)}${suffix}`;
      } catch (err: any) {
        throw new Error(`Query gagal: ${err?.message ?? err}`);
      }
    },
  });

  const dbSchema = tool({
    description:
      "Daftar tabel dan kolom di database aplikasi (tanpa data). Panggil ini sebelum `db_query` supaya tidak menebak nama tabel. " +
      "Kolom yang menyimpan kredensial tidak ditampilkan.",
    inputSchema: z.object({
      table: z.string().optional().describe("Nama tabel tertentu; kosong berarti semua tabel"),
    }),
    execute: async ({ table }) => {
      const sql = table
        ? `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${table.replace(/'/g, "''")}'`
        : "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name";
      const { rows } = await runReadOnlyQuery(sql, 200);
      const names = rows.map((r) => String(r.name)).filter((n) => n && !n.startsWith("index_fts_"));
      if (!names.length) return `Tabel "${table}" tidak ada. Coba panggil db_schema tanpa argumen.`;

      const lines: string[] = [];
      for (const name of names) {
        try {
          const info = await runReadOnlyQuery(`PRAGMA table_info(${name})`, 200);
          const columns = info.rows.map((r) => String(r.name));
          lines.push(`${name}(${visibleColumns(columns).join(", ")})`);
        } catch {
          lines.push(`${name}(?)`);
        }
      }
      return `${names.length} tabel:\n\n${lines.join("\n")}`;
    },
  });

  // Menulis lewat endpoint aplikasi (FR-M5), bukan SQL: invariant aplikasi
  // (penomoran task, integritas link RTM, ekspor wiki) tetap berlaku, sehingga
  // tab yang membaca DB ikut berubah persis seperti kalau user mengeditnya di UI.
  const appWrite = tool({
    description:
      "Ubah data aplikasi lewat endpoint-nya sendiri (task, RTM, wiki). Pakai ini — bukan SQL — untuk membuat/memperbarui task, link RTM, atau halaman wiki, " +
      "karena validasi dan aturan aplikasi ikut dijalankan sehingga tab yang bersangkutan langsung berubah. " +
      `Path yang diizinkan berawalan salah satu dari: ${WRITABLE_PREFIXES.join(", ")}.`,
    inputSchema: z.object({
      method: z.enum(["POST", "PUT", "DELETE"]).describe("POST membuat, PUT memperbarui, DELETE menghapus"),
      path: z.string().describe("Path API setelah /api, mis. projects/<projectId>/tasks"),
      body: z.record(z.string(), z.unknown()).optional().describe("Body JSON untuk POST/PUT"),
    }),
    execute: async ({ method, path: apiPath, body }) => {
      const normalized = apiPath.replace(/^\/+/, "").replace(/^api\//, "").replaceAll(ctx.projectId, ":id");
      const allowed = WRITABLE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
      if (!allowed) {
        throw new Error(
          `Path "${apiPath}" tidak diizinkan. Yang boleh: ${WRITABLE_PREFIXES.map((p) => p.replace(":id", ctx.projectId)).join(", ")}. ` +
            "Permukaan lain diubah lewat berkas (read_file/write_file).",
        );
      }
      const realPath = `/api/${apiPath.replace(/^\/?api\//, "").replace(/^\/+/, "")}`;
      const res = await handleApiRequest(
        new Request(`http://localhost${realPath}`, {
          method,
          headers: body ? { "content-type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
        }),
      );
      if (!res) throw new Error(`Endpoint ${realPath} tidak ada.`);
      const text = await res.text();
      if (!res.ok) throw new Error(`${method} ${realPath} gagal (HTTP ${res.status}): ${text.slice(0, 400)}`);
      return `${method} ${realPath} → HTTP ${res.status}${text ? `\n${text.slice(0, 600)}` : ""}`;
    },
  });

  return { dbQuery, dbSchema, appWrite };
}
