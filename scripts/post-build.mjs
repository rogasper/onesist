// Cross-platform post-build step (macOS + Windows CI):
//  1. Copy Drizzle migrations into the server bundle (import.meta.dirname = dist/server/assets/)
//  2. Copy vendored skills into the bundle
//  3. Write desktop-entry.ts — re-exports the TanStack server handler for the
//     compiled Bun executable (`bun build --compile` needs a TS/JS entry).
import path from "node:path";
import { rmSync, cpSync, mkdirSync, existsSync, writeFileSync } from "node:fs";

const root = process.cwd();

function syncCopy(src, dest) {
  if (!existsSync(src)) {
    console.warn(`[post-build] source missing, skipped: ${src}`);
    return;
  }
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`[post-build] ${src} -> ${dest}`);
}

syncCopy(
  path.join(root, "src", "server", "db", "migrations"),
  path.join(root, "dist", "server", "assets", "migrations")
);
syncCopy(
  path.join(root, "vendor", "skills"),
  path.join(root, "dist", "server", "vendor-skills")
);

writeFileSync(
  path.join(root, "desktop-entry.ts"),
  'export { default } from "./dist/server/server.js";\n'
);
console.log("[post-build] desktop-entry.ts written");
