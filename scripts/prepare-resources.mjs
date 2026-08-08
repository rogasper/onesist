// Cross-platform copy of production assets into src-tauri for Tauri bundling.
// Tauri's `resources: ["web-dist"]` glob respects .gitignore, and `dist/` is
// gitignored — so the copy must happen here (beforeBuildCommand) into a
// non-gitignored path. Also copies vendored skills.
import path from "node:path";
import { rmSync, cpSync, mkdirSync, existsSync } from "node:fs";

const root = process.cwd();

function syncCopy(src, dest) {
  if (!existsSync(src)) {
    console.error(`[prepare-resources] source missing: ${src}`);
    process.exit(1);
  }
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`[prepare-resources] ${src} -> ${dest}`);
}

syncCopy(path.join(root, "dist"), path.join(root, "src-tauri", "web-dist"));
syncCopy(
  path.join(root, "vendor", "skills"),
  path.join(root, "src-tauri", "vendor-skills")
);
