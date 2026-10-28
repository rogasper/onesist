/**
 * A unified diff split into lines with the line number each one has in the new file, so a
 * comment can point at the line it is about. Pure: the review dialog renders the result.
 */
export interface DiffLine {
  kind: "add" | "del" | "context" | "hunk" | "meta";
  text: string;
  /** Line number in the new file; null for removed lines and headers. */
  newLine: number | null;
}

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function annotateDiff(patch: string): DiffLine[] {
  let next: number | null = null;
  return patch.split("\n").map((text): DiffLine => {
    const hunk = HUNK.exec(text);
    if (hunk) {
      next = Number(hunk[1]);
      return { kind: "hunk", text, newLine: null };
    }
    if (next === null || text.startsWith("diff ") || text.startsWith("--- ") || text.startsWith("+++ ") || text.startsWith("index ")) {
      return { kind: "meta", text, newLine: null };
    }
    if (text.startsWith("-")) return { kind: "del", text, newLine: null };
    if (text.startsWith("+")) return { kind: "add", text, newLine: next++ };
    if (text.startsWith("\\")) return { kind: "meta", text, newLine: null };
    return { kind: "context", text, newLine: next++ };
  });
}
