/**
 * The `@` mention rules of the chat composer, kept pure so they can be tested (P2.2).
 *
 * A folder is a mention that ends with `/` (`@reports/` in the field, `output/reports/`
 * in the message). Files and folders are matched by name; a name that matches more than
 * one entry is left as typed, so the ambiguity stays visible.
 */

export interface MentionEntry {
  name: string;
  /** Project-relative path; folders end with `/`. */
  path: string;
}

export function isFolderPath(path: string): boolean {
  return path.endsWith("/");
}

/** Expands `@name` and `@folder/` chips back into project paths before a message is sent. */
export function expandMentions(text: string, entries: MentionEntry[]): string {
  if (!text.includes("@") || !entries.length) return text;
  return text
    .split(/(\s+)/)
    .map((chunk) => {
      const at = chunk.indexOf("@");
      if (at < 0) return chunk;
      // The `@` must not sit inside a word — an e-mail address is not a mention.
      if (at > 0 && /[\p{L}\p{N}]/u.test(chunk[at - 1])) return chunk;
      const after = chunk.slice(at + 1);
      // Surrounding punctuation belongs to the sentence, not to the mention
      // (`(@name),` must still expand).
      const trailing = after.match(/[,.;:!?)\]}"]+$/)?.[0] ?? "";
      const label = after.slice(0, after.length - trailing.length);
      if (!label) return chunk;
      const wantsFolder = label.endsWith("/");
      const name = wantsFolder ? label.slice(0, -1) : label;
      if (!name || name.includes("/")) return chunk;
      // A folder mention matches folders only; a file mention matches files only.
      const matches = entries.filter((e) => e.name === name && isFolderPath(e.path) === wantsFolder);
      if (matches.length !== 1) return chunk;
      return `${chunk.slice(0, at)}@${matches[0].path}${trailing}`;
    })
    .join("");
}
