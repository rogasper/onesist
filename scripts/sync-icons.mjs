#!/usr/bin/env node
/**
 * Sync OpenFlowKit third-party icons into public/icons.
 * Usage: bun scripts/sync-icons.mjs
 * Requires git. Clones sparse, copies processed SVGs, generates manifest.json.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const REPO = "https://github.com/Vrun-design/openflowkit.git";
const PACKS = ["aws", "azure", "cncf", "developer"];
const TMP = path.join(os.tmpdir(), "onesist-openflowkit");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed`);
}

function ensureClone() {
  if (fs.existsSync(path.join(TMP, ".git"))) {
    console.log(`[sync-icons] updating existing clone ${TMP}`);
    run("git", ["-C", TMP, "fetch", "--depth", "1", "origin", "main"]);
    run("git", ["-C", TMP, "reset", "--hard", "origin/main"]);
  } else {
    console.log(`[sync-icons] cloning sparse ${REPO} -> ${TMP}`);
    fs.mkdirSync(path.dirname(TMP), { recursive: true });
    run("git", ["clone", "--depth", "1", "--filter=blob:none", "--sparse", REPO, TMP]);
  }
  run("git", ["-C", TMP, "sparse-checkout", "set", "--no-cone", "assets/third-party-icons"]);
}

function copyPacks() {
  const destRoot = path.join(process.cwd(), "public/icons");
  fs.mkdirSync(destRoot, { recursive: true });
  for (const pack of PACKS) {
    const src = path.join(TMP, "assets/third-party-icons", pack, "processed");
    const dest = path.join(destRoot, pack);
    if (!fs.existsSync(src)) {
      console.warn(`[sync-icons] skip ${pack}: no processed dir`);
      continue;
    }
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(src, dest, { recursive: true });
    console.log(`[sync-icons] copied ${pack} -> ${dest}`);
    const srcSource = path.join(TMP, "assets/third-party-icons", pack, "SOURCE.md");
    if (fs.existsSync(srcSource)) fs.copyFileSync(srcSource, path.join(destRoot, `${pack}-SOURCE.md`));
  }
  const readme = path.join(TMP, "assets/third-party-icons/README.md");
  if (fs.existsSync(readme)) fs.copyFileSync(readme, path.join(destRoot, "README.md"));
}

function generateManifest() {
  const root = path.join(process.cwd(), "public/icons");
  const shapes = [];
  for (const pack of PACKS) {
    const packDir = path.join(root, pack);
    if (!fs.existsSync(packDir)) continue;
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else if (ent.isFile() && ent.name.endsWith(".svg")) {
          const rel = path.relative(root, full).replace(/\\/g, "/");
          const category = path.relative(packDir, path.dirname(full)).split("/")[0] || "General";
          const label = ent.name.replace(/\.svg$/, "").replace(/-/g, " ");
          const id = `${pack}-${category.toLowerCase()}-${ent.name.replace(/\.svg$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
          const keywords = new Set();
          ent.name.replace(/\.svg$/, "").split(/[-_]/).forEach((k) => keywords.add(k.toLowerCase()));
          category.split(/[-_]/).forEach((k) => keywords.add(k.toLowerCase()));
          label.split(/\s+/).forEach((k) => keywords.add(k.toLowerCase()));
          shapes.push({ id, pack, category, label: label.replace(/\b\w/g, (c) => c.toUpperCase()), file: rel, keywords: [...keywords].filter(Boolean).slice(0, 10) });
        }
      }
    };
    walk(packDir);
  }
  shapes.sort((a, b) => a.id.localeCompare(b.id));
  const manifest = {
    generatedAt: new Date().toISOString(),
    total: shapes.length,
    packs: Object.fromEntries(PACKS.map((p) => [p, shapes.filter((s) => s.pack === p).length])),
    shapes,
  };
  fs.writeFileSync(path.join(root, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`[sync-icons] manifest.json: ${manifest.total} shapes`, manifest.packs);
}

ensureClone();
copyPacks();
generateManifest();
console.log("[sync-icons] done");
