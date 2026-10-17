/**
 * The text shown when a window cannot be opened. The desktop's own message is kept as it is
 * (for example the window limit); anything without text gets a plain fallback.
 */
export function windowErrorText(e: unknown): string {
  const raw = typeof e === "string" ? e : e instanceof Error ? e.message : (e as { message?: unknown } | undefined)?.message;
  return typeof raw === "string" && raw.trim() ? raw.trim() : "Window tidak bisa dibuka.";
}
