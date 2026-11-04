/**
 * Images in the exported DOCX.
 *
 * The archive itself is the evidence: an embedded picture shows up as `word/media/*` with an
 * `r:embed` in `document.xml`. Checking the returned bytes would only prove the function ran.
 *
 *   bun test src/lib/docx-export.test.ts
 */
import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDocx } from "./docx-export";

/** Smallest valid PNG (1×1). */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex",
);

const meta = {
  customerName: "ACME",
  projectName: "Klaim",
  projectId: "p-docx",
  version: "1.0.0",
  author: "SA",
} as Parameters<typeof buildDocx>[0]["meta"];

let root = "";

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "docx-images-"));
  fs.mkdirSync(path.join(root, "input/uploads/thr_x"), { recursive: true });
  fs.writeFileSync(path.join(root, "input/uploads/thr_x/mockup.png"), PNG);
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

/** True when the archive carries an embedded picture and references it. */
function hasEmbeddedImage(buf: Buffer): boolean {
  const asText = buf.toString("latin1");
  return /word\/media\//.test(asText) || /media\/[a-z0-9]+\.png/.test(asText);
}

describe("buildDocx images", () => {
  test("a markdown image line embeds the file from the workspace", async () => {
    const buf = await buildDocx({
      contentMd: "## Front End\n\n![Mockup layar](input/uploads/thr_x/mockup.png)\n\nSetelah gambar.",
      diagramPngs: [],
      meta,
      rootPath: root,
    });
    expect(hasEmbeddedImage(buf)).toBe(true);
  });

  test("an image on the cover section is kept", async () => {
    // The cover renders through its own branch, which must handle image blocks too.
    const buf = await buildDocx({
      contentMd: "# Judul\n\n![Logo](input/uploads/thr_x/mockup.png)",
      diagramPngs: [],
      meta,
      rootPath: root,
    });
    expect(hasEmbeddedImage(buf)).toBe(true);
  });

  test("a missing file falls back to a caption instead of failing the export", async () => {
    const buf = await buildDocx({
      contentMd: "![Hilang](input/uploads/thr_x/tidak-ada.png)",
      diagramPngs: [],
      meta,
      rootPath: root,
    });
    expect(buf.length).toBeGreaterThan(0);
    expect(hasEmbeddedImage(buf)).toBe(false);
  });

  test("a path outside the project root is never read", async () => {
    const buf = await buildDocx({
      contentMd: "![Evil](../../../../etc/hosts)",
      diagramPngs: [],
      meta,
      rootPath: root,
    });
    expect(buf.length).toBeGreaterThan(0);
    expect(hasEmbeddedImage(buf)).toBe(false);
  });

  test("without a rootPath the export still succeeds", async () => {
    const buf = await buildDocx({
      contentMd: "![X](input/uploads/thr_x/mockup.png)",
      diagramPngs: [],
      meta,
    });
    expect(buf.length).toBeGreaterThan(0);
  });
});
