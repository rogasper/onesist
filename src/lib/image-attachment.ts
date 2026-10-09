/**
 * Images sent with a chat message (M4 item 17), shared by the composer and the server.
 *
 * An image travels inside the message as a data URL, so it needs no file server and the
 * model can receive it directly. That makes the bytes part of the stored message, which is
 * why the size limits are strict.
 */
export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
/** A data URL carries the bytes as base64, a third larger, plus its header. */
export const MAX_IMAGE_URL_LENGTH = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64;

/** Why the image parts of a message cannot be stored, or null when they can. */
export function imagePartProblem(parts: unknown[]): string | null {
  const files = parts.filter((p: any) => p?.type === "file") as any[];
  if (files.length > MAX_IMAGES) return `Maksimal ${MAX_IMAGES} gambar per pesan.`;
  for (const f of files) {
    if (typeof f.mediaType !== "string" || !f.mediaType.startsWith("image/")) {
      return "Hanya gambar yang bisa dilampirkan langsung ke pesan.";
    }
    if (typeof f.url !== "string" || !f.url.startsWith(`data:${f.mediaType};base64,`)) return "Gambar tidak valid.";
    if (f.url.length > MAX_IMAGE_URL_LENGTH) return `Gambar terlalu besar (maks ${MAX_IMAGE_BYTES / 1024 / 1024} MB).`;
  }
  return null;
}
