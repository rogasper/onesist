// Build the self-contained server executable for the current platform.
// Tauri externalBin naming convention: binaries/<name>-<target-triple>.
//
// Cross-compilation: set SA_BUILD_TRIPLE to override the target triple when
// the host arch differs (e.g. macos-14 arm64 runner building x86_64-apple-darwin).
// `bun build --compile --target` produces the requested arch even on a
// different host.
//
// Usage:
//   bun scripts/build-server-bin.mjs                    # host triple
//   SA_BUILD_TRIPLE=x86_64-apple-darwin bun scripts/build-server-bin.mjs
import path from "node:path";
import { unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const arch = process.arch; // arm64 | x64
const platform = process.platform; // darwin | win32

const triples = {
  "darwin-arm64": "aarch64-apple-darwin",
  "darwin-x64": "x86_64-apple-darwin",
  "win32-x64": "x86_64-pc-windows-msvc",
  "win32-arm64": "aarch64-pc-windows-msvc",
};

// bun's --target value for each triple we support (bun-darwin-*/bun-windows-*).
const bunTargets = {
  "aarch64-apple-darwin": "bun-darwin-arm64",
  "x86_64-apple-darwin": "bun-darwin-x64",
  "x86_64-pc-windows-msvc": "bun-windows-x64",
  "aarch64-pc-windows-msvc": "bun-windows-arm64",
};

const triple = process.env.SA_BUILD_TRIPLE || triples[`${platform}-${arch}`];
if (!triple) {
  console.error(
    `[build-server-bin] unsupported platform: ${platform}-${arch} (set SA_BUILD_TRIPLE to override)`
  );
  process.exit(1);
}

const outName = `onesist-server-${triple}${triple.includes("windows") ? ".exe" : ""}`;
const outfile = path.resolve("src-tauri/binaries", outName);
const tmpfile = path.resolve("src-tauri/binaries", `.onesist-server-tmp-${process.pid}`);

if (existsSync(tmpfile)) unlinkSync(tmpfile);

const entry = "desktop-entry.ts";
const args = ["build", "--compile", entry, "--outfile", tmpfile];
if (bunTargets[triple]) args.push("--target", bunTargets[triple]);

const res = spawnSync("bun", args, { stdio: "inherit" });
if (res.status !== 0) {
  console.error(`[build-server-bin] compile failed`);
  process.exit(1);
}

if (existsSync(outfile)) unlinkSync(outfile);
spawnSync("mv", [tmpfile, outfile]);
console.log(`[build-server-bin] ${outfile}`);
