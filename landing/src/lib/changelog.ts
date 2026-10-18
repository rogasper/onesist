/**
 * The latest version and the newest changelog entries, read from CHANGELOG.md on `main` so the
 * page never needs an edit per release. Sources are tried in order: raw.githubusercontent (no
 * rate limit), jsDelivr, then the GitHub Releases API. Any failure falls through to the next
 * source; when all fail the page keeps the built-in fallback.
 */

export type ChangelogEntry = { v: string; t: string; d: string };
export type ChangelogState = { version: string | null; entries: ChangelogEntry[]; live: boolean };

export const CHANGELOG_URLS = [
  "https://raw.githubusercontent.com/rogasper/onesist/main/CHANGELOG.md",
  "https://cdn.jsdelivr.net/gh/rogasper/onesist@main/CHANGELOG.md",
];
const RELEASES_API = "https://api.github.com/repos/rogasper/onesist/releases?per_page=3";

export const FALLBACK_CHANGELOG: ChangelogEntry[] = [
  { v: "v0.4.0", t: "Runtime CLI baru, workspace per thread, dan window terpisah", d: "Claude Code, Codex, Antigravity (agy), dan Pi sebagai provider chat." },
  { v: "v0.3.0", t: "Chat yang lebih rapi, pratinjau PDF dan gambar, dan konteks yang diringkas otomatis", d: "Berkas dan Memori di sheet samping." },
  { v: "v0.2.0", t: "Chat agent yang lengkap, capture desain Figma, dan performa yang lebih ringan", d: "See the full changelog on GitHub." },
];

const VERSION = String.raw`v\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?`;
const BULLET_MAX = 140;

export function stripInlineMarkdown(s: string): string {
  // Code spans first, kept verbatim: they hold identifiers like snake_case names.
  const spans: string[] = [];
  const text = s
    .replace(/`([^`]*)`/g, (_, code: string) => `\u0000${spans.push(code) - 1}\u0000`)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
    // Single markers only at word boundaries, so chat_threads.cli_session_id stays intact.
    .replace(/(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?![\w*])/g, "$1")
    .replace(/(?<![\w_])_(?=\S)(.+?)(?<=\S)_(?![\w_])/g, "$1");
  return text.replace(/\u0000(\d+)\u0000/g, (_, i: string) => spans[Number(i)]).trim();
}

export function parseLatestVersion(md: string): string | null {
  return md.match(new RegExp(`^##\\s+(${VERSION})`, "m"))?.[1] ?? null;
}

export function parseChangelog(md: string, limit = 3): ChangelogEntry[] {
  const headings = [...md.matchAll(new RegExp(`^##\\s+(${VERSION})\\s+[—–-]\\s+(.+)$`, "gm"))];
  return headings.slice(0, limit).map((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const end = headings[i + 1]?.index ?? md.length;
    const bullet = md.slice(start, end).split("\n").find((l) => /^\s*-\s+/.test(l)) ?? "";
    return { v: m[1], t: m[2].trim(), d: stripInlineMarkdown(bullet.replace(/^\s*-\s+/, "")).slice(0, BULLET_MAX) };
  });
}

function fromRelease(rel: any): ChangelogEntry {
  const tag = String(rel?.tag_name || rel?.name || "");
  const v = tag.startsWith("v") ? tag : `v${tag}`;
  const t = String(rel?.name || tag).replace(new RegExp(`^${VERSION}\\s*[—–-]\\s*`), "") || v;
  const bullet = String(rel?.body || "").split("\n").find((l) => /^\s*-\s+/.test(l)) ?? "";
  return { v, t, d: stripInlineMarkdown(bullet.replace(/^\s*-\s+/, "")).slice(0, BULLET_MAX) };
}

export async function loadChangelog(fetchImpl: typeof fetch = fetch): Promise<ChangelogState> {
  for (const url of CHANGELOG_URLS) {
    try {
      const r = await fetchImpl(url, { cache: "no-store" });
      if (!r.ok) continue;
      const md = await r.text();
      const entries = parseChangelog(md);
      if (entries.length) return { version: parseLatestVersion(md), entries, live: true };
    } catch {
      /* next source */
    }
  }
  try {
    const r = await fetchImpl(RELEASES_API, { headers: { Accept: "application/vnd.github.v3+json" } });
    if (r.ok) {
      const data = await r.json();
      const entries = Array.isArray(data) ? data.slice(0, 3).map(fromRelease).filter((e) => e.v !== "v") : [];
      if (entries.length) return { version: entries[0].v, entries, live: true };
    }
  } catch {
    /* fallback below */
  }
  return { version: null, entries: FALLBACK_CHANGELOG, live: false };
}
