/**
 * Symbol extraction (FR-I4).
 *
 * Regex per language, on purpose: this runs over every text file in a project on
 * every reindex, and a real parser per language would mean seven dependencies and
 * seven times the cost for a feature whose job is "find where X is defined". The
 * patterns below are anchored, so a match is a declaration line, not a mention of
 * the name somewhere in prose.
 *
 * Markdown headings and DBML tables are symbols too: for an SA workspace those are
 * the "definitions" being searched for at least as often as code is.
 */
export interface IndexSymbol {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "const" | "enum" | "method" | "heading" | "table" | "struct" | "trait";
  /** 1-based line number. */
  line: number;
  /** Enclosing type/class, when the pattern can tell (e.g. a method). */
  container?: string | null;
}

const CODE_PATTERNS: { ext: string[]; re: RegExp; kind: IndexSymbol["kind"]; group: number }[] = [
  // TypeScript / JavaScript
  { ext: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"], re: /^\s*export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, kind: "function", group: 1 },
  { ext: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"], re: /^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/, kind: "function", group: 1 },
  { ext: [".ts", ".tsx", ".js", ".jsx"], re: /^\s*export\s+class\s+([A-Za-z_$][\w$]*)/, kind: "class", group: 1 },
  { ext: [".ts", ".tsx", ".js", ".jsx"], re: /^\s*class\s+([A-Za-z_$][\w$]*)/, kind: "class", group: 1 },
  { ext: [".ts", ".tsx"], re: /^\s*export\s+interface\s+([A-Za-z_$][\w$]*)/, kind: "interface", group: 1 },
  { ext: [".ts", ".tsx"], re: /^\s*interface\s+([A-Za-z_$][\w$]*)/, kind: "interface", group: 1 },
  { ext: [".ts", ".tsx"], re: /^\s*export\s+type\s+([A-Za-z_$][\w$]*)/, kind: "type", group: 1 },
  { ext: [".ts", ".tsx"], re: /^\s*type\s+([A-Za-z_$][\w$]*)\s*=/, kind: "type", group: 1 },
  { ext: [".ts", ".tsx", ".js", ".jsx"], re: /^\s*export\s+const\s+([A-Za-z_$][\w$]*)/, kind: "const", group: 1 },
  { ext: [".ts", ".tsx"], re: /^\s*export\s+enum\s+([A-Za-z_$][\w$]*)/, kind: "enum", group: 1 },
  // Go
  { ext: [".go"], re: /^\s*func\s+\([^)]*\)\s+([A-Za-z_]\w*)/, kind: "method", group: 1 },
  { ext: [".go"], re: /^\s*func\s+([A-Za-z_]\w*)/, kind: "function", group: 1 },
  { ext: [".go"], re: /^\s*type\s+([A-Za-z_]\w*)\s+struct/, kind: "struct", group: 1 },
  { ext: [".go"], re: /^\s*type\s+([A-Za-z_]\w*)\s+interface/, kind: "interface", group: 1 },
  // Python
  { ext: [".py"], re: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/, kind: "function", group: 1 },
  { ext: [".py"], re: /^\s*class\s+([A-Za-z_]\w*)/, kind: "class", group: 1 },
  // PHP
  { ext: [".php"], re: /^\s*(?:public|private|protected|static|\s)*function\s+([A-Za-z_]\w*)/, kind: "function", group: 1 },
  { ext: [".php"], re: /^\s*(?:abstract\s+|final\s+)?class\s+([A-Za-z_]\w*)/, kind: "class", group: 1 },
  { ext: [".php"], re: /^\s*interface\s+([A-Za-z_]\w*)/, kind: "interface", group: 1 },
  { ext: [".php"], re: /^\s*trait\s+([A-Za-z_]\w*)/, kind: "trait", group: 1 },
  // Java
  { ext: [".java"], re: /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?class\s+([A-Za-z_]\w*)/, kind: "class", group: 1 },
  { ext: [".java"], re: /^\s*(?:public\s+)?interface\s+([A-Za-z_]\w*)/, kind: "interface", group: 1 },
  { ext: [".java"], re: /^\s*(?:public\s+)?enum\s+([A-Za-z_]\w*)/, kind: "enum", group: 1 },
];

/** Extracts declarations with their line numbers. Never throws: a file that does
 *  not parse is simply a file with fewer symbols. */
export function extractSymbols(input: { path: string; ext: string; text: string }): IndexSymbol[] {
  const ext = input.ext.toLowerCase();
  const lines = input.text.split("\n");
  const out: IndexSymbol[] = [];

  if (ext === ".md" || ext === ".markdown" || ext === ".mdx") {
    lines.forEach((line, i) => {
      const m = /^(#{1,6})\s+(.*\S)\s*$/.exec(line);
      if (m) out.push({ name: m[2].slice(0, 160), kind: "heading", line: i + 1 });
    });
    return out;
  }

  if (ext === ".dbml") {
    lines.forEach((line, i) => {
      const m = /^\s*Table\s+("?[\w.]+"?)\s*(?:as\s+\w+)?\s*\{/i.exec(line);
      if (m) out.push({ name: m[1].replace(/"/g, ""), kind: "table", line: i + 1 });
    });
    return out;
  }

  // Code: try each pattern that applies to this extension. A line can match more
  // than one pattern (e.g. `export const x` and `const x`), so duplicates on the
  // same line are dropped.
  const seen = new Set<string>();
  lines.forEach((line, i) => {
    for (const pattern of CODE_PATTERNS) {
      if (!pattern.ext.includes(ext)) continue;
      const m = pattern.re.exec(line);
      if (!m) continue;
      const name = m[pattern.group];
      const key = `${i + 1}:${name}`;
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push({ name, kind: pattern.kind, line: i + 1 });
      break; // first matching pattern wins for this line
    }
  });
  return out;
}
