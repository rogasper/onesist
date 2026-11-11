/**
 * Menyimpan respons HTTP langsung ke disk, tanpa `response.blob()`.
 *
 * Kenapa: di WebView, `blob()` menahan seluruh isi ZIP di memori proses WebView —
 * untuk proyek 387 MB itu satu salinan besar lagi, tepat setelah server selesai
 * mengirimnya. Kalau proses WebView kehabisan memori, fetch-nya berakhir sebagai
 * TypeError ("Failed to fetch") dan yang terlihat sama seperti server yang mati.
 *
 * File System Access API (Chromium/WebView2) bisa menulis stream respons ke berkas
 * yang dipilih user, jadi memori tetap datar. Ini API web di dalam WebView — tidak
 * ada fungsi Rust/Tauri yang dipakai. WebView tanpa API itu (WKWebView di macOS)
 * mengembalikan null dan pemanggil memakai jalur blob lama.
 */

export interface WritableFileStream {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(reason?: unknown): Promise<void>;
}

export interface SaveFileHandle {
  createWritable(): Promise<WritableFileStream>;
  /** Chrome 110+; dipakai untuk membersihkan berkas yang gagal ditulis. */
  remove?(): Promise<void>;
}

export type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}) => Promise<SaveFileHandle>;

function pickerFromGlobal(): SaveFilePicker | null {
  const candidate = (globalThis as { showSaveFilePicker?: SaveFilePicker }).showSaveFilePicker;
  return typeof candidate === "function" ? candidate : null;
}

/**
 * Meminta tujuan simpan SEBELUM fetch.
 *
 * Pickernya butuh gestur user, dan gestur itu hilang setelah menunggu respons —
 * karena itu urutannya picker dulu, baru request. `suggestedName` dipakai apa adanya
 * karena nama dari `Content-Disposition` baru diketahui setelah respons datang.
 *
 * @returns handle, `"cancelled"` bila user menutup dialog, atau null bila API tidak
 *          tersedia (pemanggil memakai jalur blob).
 */
export async function pickSaveDestination(
  suggestedName: string,
  picker: SaveFilePicker | null = pickerFromGlobal(),
): Promise<SaveFileHandle | "cancelled" | null> {
  if (!picker) return null;

  try {
    return await picker({
      suggestedName,
      types: [{ description: "ZIP", accept: { "application/zip": [".zip"] } }],
    });
  } catch (error) {
    if ((error as { name?: unknown })?.name === "AbortError") return "cancelled";

    // API-nya ada tetapi ditolak WebView (mis. picker dikunci): jangan gagalkan
    // export, pakai jalur blob yang sudah terbukti.
    return null;
  }
}

/** Menyalurkan body respons ke berkas; kegagalan di tengah jalan membersihkan sisanya. */
export async function streamResponseToFile(response: Response, handle: SaveFileHandle): Promise<void> {
  if (!response.body) throw new Error("Respons export tidak punya isi untuk dialirkan.");

  const writable = await handle.createWritable();
  const reader = response.body.getReader();

  // A loop, not `pipeTo`: the destination only has to be writable-like (write /
  // close / abort), which keeps it testable and avoids a cast to WritableStream.
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value && value.length > 0) await writable.write(value);
    }
    await writable.close();
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch {
      /* stream sudah berhenti */
    }
    try {
      await writable.abort(error);
    } catch {
      /* sudah batal */
    }
    await discardSaveDestination(handle);
    throw error;
  }
}

/** Membuang berkas kosong ketika server menolak sebelum satu byte pun dikirim. */
export async function discardSaveDestination(handle: SaveFileHandle): Promise<void> {
  try {
    await handle.remove?.();
  } catch {
    /* tidak semua implementasi punya remove() */
  }
}
