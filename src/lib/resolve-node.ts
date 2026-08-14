import fs from "node:fs";
import path from "node:path";

// Resolving the terminal server's Node executable must NOT spawn anything:
// Bun's spawnSync of PATH executables inside the vite config misbehaves (can
// segfault Bun). Only filesystem checks + env vars here.

/** Candidate node.exe paths in resolution order. */
export function resolveNodeCandidates(): string[] {
  const candidates: string[] = [];

  // nvm-windows: versions live in %NVM_HOME% (default %APPDATA%\nvm) as
  // v<version> folders, with an optional `current` junction (nvm use --symlink).
  // GUI-launched apps inherit a stale PATH (Explorer caches the env at login),
  // so the nvm entry can be missing from PATH even though a node exists here —
  // look in the nvm layout directly.
  const nvmRoot = process.env.NVM_HOME || (process.env.APPDATA ? path.join(process.env.APPDATA, "nvm") : "");
  if (nvmRoot) {
    if (process.env.NVM_SYMLINK) candidates.push(path.join(process.env.NVM_SYMLINK, "node.exe"));
    candidates.push(path.join(nvmRoot, "current", "node.exe"));
    try {
      const versions = fs.readdirSync(nvmRoot)
        .filter((d) => /^v\d+\.\d+\.\d+$/.test(d))
        .sort((a, b) => compareVersionsDesc(a, b));
      for (const v of versions) candidates.push(path.join(nvmRoot, v, "node.exe"));
    } catch {}
  }

  // Standard MSI and per-user installs.
  if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, "nodejs", "node.exe"));
  if (process.env["ProgramFiles(x86)"]) candidates.push(path.join(process.env["ProgramFiles(x86)"], "nodejs", "node.exe"));
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "nodejs", "node.exe"));

  // Scoop and WinGet shim locations.
  if (process.env.USERPROFILE) candidates.push(path.join(process.env.USERPROFILE, "scoop", "apps", "nodejs", "current", "node.exe"));
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Microsoft", "WinGet", "Links", "node.exe"));

  return candidates;
}

/** First existing candidate, else "node" so spawn falls back to PATH lookup. */
export function resolveNodeExe(): string {
  for (const c of resolveNodeCandidates()) {
    try { if (fs.existsSync(c)) return c; } catch {}
  }
  return "node";
}

function compareVersionsDesc(a: string, b: string): number {
  const pa = a.slice(1).split(".").map(Number);
  const pb = b.slice(1).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pb[i] ?? 0) - (pa[i] ?? 0);
  }
  return 0;
}
