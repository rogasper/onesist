import { reportClientError } from "~/lib/use-client-error-report";

/** Long enough for a large project, short enough to end a hung request. */
export const EXPORT_TIMEOUT_MS = 5 * 60 * 1000;

const CONNECTION_FAILURE =
  /load failed|failed to fetch|networkerror|network error|fetch failed|the operation couldn|connection (reset|closed)/i;

/**
 * Saves a blob as a file.
 *
 * WebView2 ignores a click on an anchor that is not in the document, and
 * revoking the object URL in the same tick can cancel the download before it
 * starts — hence append → click → remove here, and the revoke on a later tick.
 */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The filename the server asked for, falling back to the caller's own. */
export function downloadFilename(response: Response, fallback: string): string {
  const match = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "");
  return match?.[1] ?? fallback;
}

/** Bytes in readable Indonesian units: `980 B`, `12,4 KB`, `124,8 MB`. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  // No decimals for plain bytes or for values already at/over 100.
  const digits = index === 0 || value >= 100 ? 0 : 1;
  return `${value.toFixed(digits).replace(".", ",")} ${units[index]}`;
}

/**
 * A message a user can act on. The browser's own wording ("Failed to fetch",
 * "Load failed") says nothing about what to do — and used to be shown as the
 * application's own error message (#59).
 */
export function downloadErrorText(error: unknown, fallback = "Export gagal"): string {
  if ((error as { name?: unknown } | null)?.name === "AbortError") {
    return "Server tidak merespons sampai batas waktu export — coba lagi. Kalau berulang, kirim server.log.";
  }
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (CONNECTION_FAILURE.test(raw)) {
    return "Koneksi ke server terputus saat export — coba lagi. Kalau berulang, kirim server.log.";
  }
  return raw.trim() || fallback;
}

/** Reports a failed download into the server log and returns the text to show. */
export function reportDownloadFailure(where: string, error: unknown, fallback?: string): string {
  const message = downloadErrorText(error, fallback);
  reportClientError(where, message, error instanceof Error ? error.stack : undefined);
  return message;
}
