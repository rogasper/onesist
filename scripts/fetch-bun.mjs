// Fetch Bun binaries for the Tauri sidecar (3 platforms).
// Usage: bun scripts/fetch-bun.mjs
// Output: src-tauri/binaries/bun-<target-triple> (+ .exe for windows)
import { mkdirSync, chmodSync, createWriteStream, existsSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const BUN_VERSION = process.env.BUN_VERSION || "latest";
const BIN_DIR = path.resolve("src-tauri/binaries");

const targets = [
  {
    name: "bun-aarch64-apple-darwin",
    asset: "bun-darwin-aarch64.zip",
    exe: false,
  },
  {
    name: "bun-x86_64-apple-darwin",
    asset: "bun-darwin-x64.zip",
    exe: false,
  },
  {
    name: "bun-x86_64-pc-windows-msvc.exe",
    asset: "bun-windows-x64.zip",
    exe: true,
  },
];

mkdirSync(BIN_DIR, { recursive: true });

async function unzip(buffer, dest, exe) {
  const tmp = path.join(BIN_DIR, `.tmp-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const zipPath = path.join(tmp, "bun.zip");
  await Bun.write(zipPath, buffer);
  await Bun.$`cd ${tmp} && unzip -o bun.zip`.quiet();
  // Zip contains a folder like bun-darwin-aarch64/bun — find the binary
  const candidates = Bun.spawnSync(["find", tmp, "-type", "f", "-name", "bun", "-o", "-name", "bun.exe"]).stdout
    .toString().trim().split("\n").filter(Boolean);
  const extracted = candidates[0];
  if (!extracted) throw new Error(`bun binary not found in zip for ${dest}`);
  await Bun.write(dest, await Bun.file(extracted).arrayBuffer());
  if (!exe) chmodSync(dest, 0o755);
  Bun.spawnSync(["rm", "-rf", tmp]);
}

for (const t of targets) {
  const dest = path.join(BIN_DIR, t.name);
  if (existsSync(dest)) {
    console.log(`[skip] ${t.name} already exists`);
    continue;
  }
  const versionPart = BUN_VERSION === "latest" ? "latest/download" : `download/${BUN_VERSION}`;
  const url = `https://github.com/oven-sh/bun/releases/${versionPart}/${t.asset}`;
  console.log(`[fetch] ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[error] ${res.status} fetching ${t.asset}`);
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await unzip(buf, dest, t.exe);
  console.log(`[ok] ${t.name}`);
}

console.log("done");
