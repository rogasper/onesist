/**
 * Tells every CLI agent the follow-up format the native prompt uses (issue #55).
 * It goes in front of the prompt the runtime receives, never into the stored
 * transcript, so the user's own message stays as they wrote it.
 */

const NOTE =
  'Saran lanjutan: kalau jawaban punya langkah berikutnya, akhiri dengan SATU blok ```suggestions berisi maksimal 6 baris "- <saran>". Jangan pakai blok itu untuk hal lain dan jangan menyebutnya di luar jawaban.';

export function withSuggestionsNote(text: string): string {
  return `${NOTE}\n\n${text}`;
}
