// Build the self-contained server executable for the current platform.
// Tauri externalBin naming convention: binaries/<name>-<target-triple>.
// Usage: bun scripts/build-server-bin.mjs
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

const triple = triples[`${platform}-${arch}`];
if (!triple) {
  console.error(`[build-server-bin] unsupported platform: ${platform}-${arch}`);
  process.exit(1);
}

const outName = `onesist-server-${triple}${platform === "win32" ? ".exe" : ""}`;
const outfile = path.resolve("src-tauri/binaries", outName);
const tmpfile = path.resolve("src-tauri/binaries", `.onesist-server-tmp-${process.pid}`);

if (existsSync(tmpfile)) unlinkSync(tmpfile);

const entry = "desktop-entry.ts";
const res = spawnSync(
  "bun",
  ["build", "--compile", entry, "--outfile", tmpfile],
  { stdio: "inherit" }
);
if (res.status !== 0) {
  console.error(`[build-server-bin] compile failed`);
  process.exit(1);
}

if (existsSync(outfile)) unlinkSync(outfile);
spawnSync("mv", [tmpfile, outfile]);
console.log(`[build-server-bin] ${outfile}`);
