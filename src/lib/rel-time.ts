/**
 * One relative-time label for the whole app ("baru saja", "3 jam lalu").
 *
 * Three copies had grown: the chat transcript, the index panel and the chat
 * panel's thread list. They must agree — a timestamp that says "2 jam lalu" in
 * one surface and "1 jam lalu" in another is the kind of wrongness a user
 * cannot report precisely.
 *
 * `fallback` covers surfaces where a missing timestamp has a meaning of its own
 * (the index panel says "belum pernah"); everything else shows "baru saja".
 */
export function relTime(iso: string | null | undefined, fallback = "baru saja"): string {
  if (!iso) return fallback;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return fallback;
  // A clock skew (server wrote a timestamp slightly in the future) reads as
  // "baru saja" rather than a negative age.
  if (ms < 0) return fallback;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "baru saja";
  if (min < 60) return `${min} menit lalu`;
  const jam = Math.floor(min / 60);
  if (jam < 24) return `${jam} jam lalu`;
  return `${Math.floor(jam / 24)} hari lalu`;
}
