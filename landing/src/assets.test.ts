/**
 * Every image the page references exists, is a real capture (not an empty file), and the
 * screenshots are new v0.4.0 captures rather than the old ones with the same names.
 *
 *   cd landing && bun test src/assets.test.ts
 */
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { HERO_IMAGE, SLIDES } from "./content";

const root = path.resolve(import.meta.dir, "..");
const pub = path.join(root, "public");
const CAPTURED_FROM = new Date("2026-10-18T00:00:00+07:00").getTime();

const shots = [...new Set([HERO_IMAGE.replace(/^\//, ""), ...SLIDES.map((s) => `screenshots/${s.file}`)])];

for (const rel of shots) {
  test(`${rel} exists and is a real image`, () => {
    const p = path.join(pub, rel);
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).size).toBeGreaterThan(20_000);
  });
  test(`${rel} is a v0.4.0 capture`, () => expect(fs.statSync(path.join(pub, rel)).mtimeMs).toBeGreaterThanOrEqual(CAPTURED_FROM));
}

const sizeOf = (p: string): [number, number] => {
  const out = Bun.spawnSync(["sips", "-g", "pixelWidth", "-g", "pixelHeight", p]).stdout.toString();
  return [Number(out.match(/pixelWidth: (\d+)/)?.[1]), Number(out.match(/pixelHeight: (\d+)/)?.[1])];
};
const OG_SCRIPT = path.join(root, "og", "make-og.py");

for (const name of ["og-image-onesist-1200x630.jpg", "og-image-onesist.png"]) {
  test(`${name} is a fresh 1200×630 render under 200 KB`, () => {
    const p = path.join(pub, "screenshots", name);
    expect(fs.existsSync(OG_SCRIPT)).toBe(true);
    expect(sizeOf(p)).toEqual([1200, 630]);
    expect(fs.statSync(p).size).toBeLessThan(200_000);
    expect(fs.statSync(p).mtimeMs).toBeGreaterThanOrEqual(fs.statSync(OG_SCRIPT).mtimeMs);
  });
}

test("every social image in index.html exists", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf-8");
  const urls = [...html.matchAll(/(?:og:image|twitter:image)" content="https:\/\/onesist\.rogasper\.com\/([^"]+)"/g)].map((m) => m[1]);
  expect(urls.length).toBeGreaterThan(0);
  for (const u of urls) expect(fs.existsSync(path.join(pub, u))).toBe(true);
});
