/**
 * What the `@` popup can point at (P2.1): files and folders of the project.
 *
 * Breadth-first, so the entries near the root are always listed, even when a large folder
 * deeper in the tree would use up the cap. Folders end with `/` and are offered as `kind: "dir"`.
 */
import fs from "node:fs";
import path from "node:path";

export interface Mentionable {
  name: string;
  /** Project-relative path; folders end with `/`. */
  path: string;
  kind: "file" | "dir";
  depth: number;
}

/** Machine output and dependency folders: never worth mentioning. */
const SKIP = new Set(["node_modules", ".git", "dist", "binaries", "target", ".cache", ".next", ".turbo", "coverage", ".mastra"]);
/** Listed by other triggers (`$` skills, subagents), so they would only bury the workspace. */
const SKIP_PATHS = new Set([".agents/skills", ".agents/agents"]);
const MAX_DEPTH = 6;

export function listMentionables(root: string, cap = 2000): Mentionable[] {
  const out: Mentionable[] = [];
  let level: { abs: string; rel: string }[] = [{ abs: root, rel: "" }];
  for (let depth = 0; level.length > 0 && out.length < cap; depth++) {
    const next: { abs: string; rel: string }[] = [];
    for (const dir of level) {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir.abs, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (out.length >= cap) break;
        if (entry.name.startsWith(".") && entry.name !== ".agents") continue;
        const rel = dir.rel ? `${dir.rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (SKIP.has(entry.name) || SKIP_PATHS.has(rel)) continue;
          out.push({ name: entry.name, path: `${rel}/`, kind: "dir", depth });
          if (depth < MAX_DEPTH) next.push({ abs: path.join(dir.abs, entry.name), rel });
        } else if (entry.isFile()) {
          out.push({ name: entry.name, path: rel, kind: "file", depth });
        }
      }
    }
    level = next;
  }
  // Shallow first; within a level, folders before files, then by path.
  out.sort((a, b) => a.depth - b.depth || (a.kind === b.kind ? a.path.localeCompare(b.path) : a.kind === "dir" ? -1 : 1));
  return out;
}
