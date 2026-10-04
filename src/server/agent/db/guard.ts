/**
 * Guard for the agent's read-only database access (FR-M1, FR-M2).
 *
 * Two layers, deliberately:
 *   1. this module rejects statements that are not reads or that name a secret
 *      column, with a message that explains WHY — a bare SQL error teaches the
 *      model nothing and it will retry variations;
 *   2. the connection itself is opened `readonly: true` (see db/client.ts), so a
 *      statement this guard fails to imagine still cannot write.
 *
 * Layer 1 alone would be a promise; layer 2 is the enforcement. Both exist because
 * layer 1 is what produces a usable answer for the model, and layer 2 is what
 * protects the data when layer 1 is wrong.
 */

/** Columns the agent must never read, and the reason each one is here. */
export const DENIED_COLUMNS: Record<string, string> = {
  api_key: "menyimpan API key provider dalam bentuk plaintext; FR-A8 menjamin kunci itu tidak pernah masuk konteks model",
  custom_headers_json: "header kustom kerap memuat token atau kunci",
  cli_env_json: "berisi environment CLI agent, termasuk kredensialnya",
};

export const DB_LIMITS = {
  /** Baris yang dikembalikan per query. Query yang lebih besar dari ini dipotong
   *  dan pemotongannya diberitahukan. */
  rows: 200,
  /** Panjang SQL yang diterima; query yang lebih panjang dari ini hampir pasti
   *  bukan pertanyaan melainkan percobaan menyusun sesuatu. */
  sqlChars: 8000,
} as const;

export type StatementCheck = { ok: true } | { ok: false; error: string };

/** Membuang komentar dan spasi di awal supaya `-- komentar\nSELECT …` tetap dikenali. */
function stripLeading(sql: string): string {
  let text = sql.trim();
  // Blok komentar di awal
  while (text.startsWith("/*")) {
    const end = text.indexOf("*/");
    if (end === -1) break;
    text = text.slice(end + 2).trim();
  }
  // Komentar baris di awal
  while (text.startsWith("--")) {
    const nl = text.indexOf("\n");
    if (nl === -1) return "";
    text = text.slice(nl + 1).trim();
  }
  return text;
}

/**
 * Memeriksa satu pernyataan sebelum dijalankan.
 *
 * Yang ditolak: selain SELECT/WITH, pernyataan bertumpuk (`;` di tengah, cara
 * klasik menyelipkan DDL di belakang SELECT), kolom rahasia, dan `SELECT *` pada
 * tabel yang di dalamnya ada kolom rahasia.
 */
export function checkStatement(sql: string): StatementCheck {
  const trimmed = (sql ?? "").trim();
  if (!trimmed) return { ok: false, error: "Query kosong." };
  if (trimmed.length > DB_LIMITS.sqlChars) {
    return { ok: false, error: `Query terlalu panjang (${trimmed.length} karakter, maksimum ${DB_LIMITS.sqlChars}).` };
  }

  const head = stripLeading(trimmed).toUpperCase();
  if (!/^(SELECT|WITH)\b/.test(head)) {
    return {
      ok: false,
      error:
        "Hanya SELECT/WITH yang diizinkan. Akses database agent bersifat read-only: menulis lewat SQL mentah akan melewati validasi dan invariant aplikasi. " +
        "Untuk mengubah data (task, RTM, wiki), pakai tool `app_write` yang memanggil endpoint aplikasi.",
    };
  }

  // Satu pernyataan saja: `;` hanya boleh muncul di akhir (atau tidak sama sekali).
  const withoutTrailing = trimmed.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) {
    return { ok: false, error: "Hanya satu pernyataan per query. Tanda `;` di tengah tidak diizinkan." };
  }

  const lower = withoutTrailing.toLowerCase();
  for (const [column, reason] of Object.entries(DENIED_COLUMNS)) {
    if (new RegExp(`\\b${column}\\b`).test(lower)) {
      return {
        ok: false,
        error: `Kolom \`${column}\` tidak boleh dibaca agent: ${reason}. Pilih kolom lain; daftar kolom yang aman ada di tool \`db_schema\`.`,
      };
    }
  }

  // `SELECT * FROM llm_providers` akan membocorkan kolom rahasia tanpa
  // menyebutnya — jadi bintang pada tabel itu ditolak, dan model diminta
  // menyebut kolomnya.
  if (/\bllm_providers\b/.test(lower) && /select\s+\*/i.test(withoutTrailing)) {
    return {
      ok: false,
      error:
        "`SELECT *` pada `llm_providers` tidak diizinkan karena tabel itu memuat kolom rahasia. " +
        "Sebutkan kolom yang kamu butuhkan (mis. `SELECT id, name, model, is_default FROM llm_providers`).",
    };
  }

  return { ok: true };
}

/** Menyaring kolom yang boleh diperlihatkan `db_schema`. */
export function visibleColumns(columns: string[]): string[] {
  return columns.filter((c) => !(c in DENIED_COLUMNS));
}
