/**
 * Version and changelog entries for the landing page, parsed from CHANGELOG.md.
 *
 *   cd landing && bun test src/lib/changelog.test.ts
 */
import { expect, test } from "bun:test";
import { FALLBACK_CHANGELOG, loadChangelog, parseChangelog, parseLatestVersion, stripInlineMarkdown } from "./changelog";

const MD = `# Changelog

## v0.4.0 — Runtime CLI baru, workspace per thread, dan window terpisah

Intro paragraph.

### Feat — Chat
- **Claude Code, Codex, Antigravity (agy), dan Pi** sebagai provider chat. Masing-masing dideteksi.

## v0.3.0 — Chat yang lebih rapi

### Feat — Chat
- **Berkas dan Memori di sheet samping** (\`Berkas\`, \`Memori\`).

## v0.2.0 - Plain hyphen title
- Uses [the docs](https://x.y) link.
`;

test("latest version is the first heading", () => expect(parseLatestVersion(MD)).toBe("v0.4.0"));
test("a suffixed version parses", () => expect(parseLatestVersion("## v0.4.1-beta.1 — X\n- a")).toBe("v0.4.1-beta.1"));
test("no heading gives null", () => expect(parseLatestVersion("nothing here")).toBeNull());
test("entries keep version, title and a clean first bullet", () => {
  expect(parseChangelog(MD)).toEqual([
    { v: "v0.4.0", t: "Runtime CLI baru, workspace per thread, dan window terpisah", d: "Claude Code, Codex, Antigravity (agy), dan Pi sebagai provider chat. Masing-masing dideteksi." },
    { v: "v0.3.0", t: "Chat yang lebih rapi", d: "Berkas dan Memori di sheet samping (Berkas, Memori)." },
    { v: "v0.2.0", t: "Plain hyphen title", d: "Uses the docs link." },
  ]);
});
test("limit is honoured", () => expect(parseChangelog(MD, 1)).toHaveLength(1));
test("garbage input gives no entries and does not throw", () => expect(parseChangelog("<html>404</html>")).toEqual([]));
test("underscores inside identifiers are kept", () => expect(stripInlineMarkdown("Column chat_threads.cli_session_id is set")).toBe("Column chat_threads.cli_session_id is set"));
test("code spans keep their contents verbatim", () => expect(stripInlineMarkdown("Uses `snake_case_name` and `**raw**`")).toBe("Uses snake_case_name and **raw**"));
test("word-level emphasis is still removed", () => expect(stripInlineMarkdown("**Bold.** and _italic_ and *star*")).toBe("Bold. and italic and star"));
test("long bullets are cut at 140 chars", () => expect(parseChangelog(`## v1.0.0 — T\n- ${"a".repeat(300)}`)[0].d.length).toBeLessThanOrEqual(140));
test("every source failing keeps the fallback", async () => {
  const failing = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  expect(await loadChangelog(failing)).toEqual({ version: null, entries: FALLBACK_CHANGELOG, live: false });
});
test("a 404 page falls through to the next source", async () => {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(String(url));
    return calls.length === 1 ? new Response("nope", { status: 404 }) : new Response(MD);
  }) as unknown as typeof fetch;
  const s = await loadChangelog(f);
  expect(calls[0]).toContain("raw.githubusercontent.com");
  expect(calls[1]).toContain("cdn.jsdelivr.net");
  expect(s).toMatchObject({ version: "v0.4.0", live: true });
  expect(s.entries[0].v).toBe("v0.4.0");
});
