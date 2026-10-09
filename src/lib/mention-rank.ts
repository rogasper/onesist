/**
 * Order of the `@`, `$`, `/` and `#` popups (P2.2). The best match comes first: an exact
 * name, then a name that starts with the query, then a name that contains it, then the path,
 * then the hint. Ties go to the shallower entry, then alphabetically.
 */

export interface Rankable {
  name: string;
  path: string;
  hint?: string;
}

function depthOf(path: string): number {
  return path.replace(/\/$/, "").split("/").length;
}

export function rankMentions<T extends Rankable>(items: T[], query: string, limit = 20): T[] {
  const q = query.trim().toLowerCase();
  const byDepthThenPath = (a: T, b: T) => depthOf(a.path) - depthOf(b.path) || a.path.localeCompare(b.path);
  if (!q) return [...items].sort(byDepthThenPath).slice(0, limit);
  const scored: { item: T; score: number }[] = [];
  for (const item of items) {
    const name = item.name.toLowerCase();
    const path = item.path.toLowerCase();
    const hint = (item.hint ?? "").toLowerCase();
    const score =
      name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : path.includes(q) ? 3 : hint.includes(q) ? 4 : -1;
    if (score >= 0) scored.push({ item, score });
  }
  scored.sort((a, b) => a.score - b.score || byDepthThenPath(a.item, b.item));
  return scored.slice(0, limit).map((s) => s.item);
}
