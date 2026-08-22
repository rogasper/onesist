// Cross-platform post-build step (macOS + Windows CI):
//  1. Copy Drizzle migrations into the server bundle (import.meta.dirname = dist/server/assets/)
//  2. Copy vendored skills into the bundle
//  3. Write desktop-entry.ts — re-exports the TanStack server handler for the
//     compiled Bun executable (`bun build --compile` needs a TS/JS entry).
import path from "node:path";
import { rmSync, cpSync, mkdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";

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
// Bundle the PlantUML converter into a SINGLE self-contained Node file so the
// Tauri sidecar can run it without node_modules (@grethel-labs/excaliplant).
// post-build runs under `bun`, so Bun.build is available.
const plantPath = path.join(root, "scripts", "plantuml-convert.mjs");
const plantOut = path.join(root, "dist", "server", "scripts", "plantuml-convert.js");
try {
  // Use the bun CLI (proven vs the Bun.build API — the API's absolute `outfile`
  // doesn't reliably write the file). CLI bundles all deps so the Tauri sidecar
  // needs no node_modules at the script location.
  mkdirSync(path.dirname(plantOut), { recursive: true });
  const bunExe = typeof Bun !== "undefined" ? process.execPath : "bun";
  const res = spawnSync(
    bunExe,
    ["build", plantPath, "--target", "node", "--outfile", plantOut, "--minify"],
    { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] }
  );
  if (res.status === 0 && existsSync(plantOut) && statSync(plantOut).size > 1000) {
    console.log(`[post-build] bundled plantuml-convert -> ${plantOut} (${(statSync(plantOut).size / 1024 / 1024).toFixed(2)}MB)`);
  } else {
    console.warn(`[post-build] plantuml bundling failed (${res.status}) ${res.stderr?.slice(0, 400)}; copying source as fallback`);
    syncCopy(plantPath, plantOut);
  }
} catch (e) {
  console.warn("[post-build] plantuml bundling failed, copying source as fallback", e);
  syncCopy(plantPath, plantOut);
}
syncCopy(
  path.join(root, "scripts", "plantuml-convert.mjs"),
  path.join(root, "dist", "server", "scripts", "plantuml-convert.mjs")
);
syncCopy(
  path.join(root, "scripts", "plantuml-convert.mjs"),
  path.join(root, "dist", "server", "assets", "scripts", "plantuml-convert.mjs")
);

writeFileSync(
  path.join(root, "desktop-entry.ts"),
  'export { default } from "./dist/server/server.js";\n'
);
console.log("[post-build] desktop-entry.ts written");
