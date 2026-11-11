/**
 * The ZIP writer exists because Windows Explorer refuses an archive whose entries
 * use data descriptors (JSZip's `streamFiles`). These tests pin the properties
 * that make the archive readable everywhere: sizes and CRC in the local header,
 * flag bit 3 clear, and a central directory that agrees with the entries.
 *
 *   bun test src/server/zip-stream.test.ts
 */
import { afterAll, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import JSZip from "jszip";
import { zipChunks } from "./zip-stream";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "onesist-zip-"));

afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

function writeFile(name: string, contents: string | Buffer): string {
  const abs = path.join(tmp, name);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, contents);
  return abs;
}

async function buildZip(entries: { name: string; abs: string }[]): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of zipChunks(entries)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/** Parses one local file header, the part Windows Explorer reads for sizes. */
function localHeader(zip: Buffer, offset = 0) {
  expect(zip.readUInt32LE(offset)).toBe(0x04034b50);
  const nameLength = zip.readUInt16LE(offset + 26);
  const extraLength = zip.readUInt16LE(offset + 28);
  return {
    flags: zip.readUInt16LE(offset + 6),
    method: zip.readUInt16LE(offset + 8),
    crc: zip.readUInt32LE(offset + 14),
    compressedSize: zip.readUInt32LE(offset + 18),
    rawSize: zip.readUInt32LE(offset + 22),
    name: zip.subarray(offset + 30, offset + 30 + nameLength).toString("utf8"),
    dataOffset: offset + 30 + nameLength + extraLength,
  };
}

test("entries carry their sizes and CRC in the local header, without data descriptors", async () => {
  const text = "hello hello hello hello\n".repeat(200);
  const zip = await buildZip([{ name: "docs/report.md", abs: writeFile("report.md", text) }]);

  const header = localHeader(zip);
  expect(header.name).toBe("docs/report.md");
  expect(header.method).toBe(8);
  // Bit 3 = data descriptor. Windows Explorer rejects that form.
  expect(header.flags & 0x0008).toBe(0);
  expect(header.rawSize).toBe(Buffer.byteLength(text));
  expect(header.crc).toBe(zlib.crc32(Buffer.from(text)));
  expect(zip.subarray(header.dataOffset, header.dataOffset + header.compressedSize).length).toBe(
    header.compressedSize,
  );
  expect(zlib.inflateRawSync(zip.subarray(header.dataOffset, header.dataOffset + header.compressedSize)).toString()).toBe(text);
});

test("the archive reads back through JSZip, including an empty file and a UTF-8 name", async () => {
  const zip = await buildZip([
    { name: "a/first.txt", abs: writeFile("first.txt", "first") },
    { name: "a/empty.txt", abs: writeFile("empty.txt", "") },
    { name: "a/catatan kerja — mitra.txt", abs: writeFile("utf8.txt", "isi") },
  ]);

  const loaded = await JSZip.loadAsync(zip);
  expect(Object.keys(loaded.files).sort()).toEqual([
    "a/catatan kerja — mitra.txt",
    "a/empty.txt",
    "a/first.txt",
  ]);
  expect(await loaded.file("a/first.txt")!.async("string")).toBe("first");
  expect(await loaded.file("a/empty.txt")!.async("string")).toBe("");
});

test("the central directory points at the local headers it describes", async () => {
  const zip = await buildZip([
    { name: "one.txt", abs: writeFile("one.txt", "1") },
    { name: "two.txt", abs: writeFile("two.txt", "2") },
  ]);

  const eocdOffset = zip.length - 22;
  expect(zip.readUInt32LE(eocdOffset)).toBe(0x06054b50);
  expect(zip.readUInt16LE(eocdOffset + 10)).toBe(2); // jumlah entri
  const centralOffset = zip.readUInt32LE(eocdOffset + 16);

  expect(zip.readUInt32LE(centralOffset)).toBe(0x02014b50);
  const pointer = zip.readUInt32LE(centralOffset + 42);
  expect(localHeader(zip, pointer).name).toBe("one.txt");
  expect(localHeader(zip, pointer).flags & 0x0008).toBe(0);
});

test("a UTF-8 name sets the language flag and ASCII names do not", async () => {
  const zip = await buildZip([
    { name: "ascii.txt", abs: writeFile("ascii.txt", "a") },
    { name: "nama-berké.md", abs: writeFile("unicode.txt", "b") },
  ]);

  expect(localHeader(zip).flags & 0x0800).toBe(0);

  const first = localHeader(zip);
  const secondOffset = first.dataOffset + first.compressedSize;
  expect(localHeader(zip, secondOffset).flags & 0x0800).toBe(0x0800);
});
