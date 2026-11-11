import fs from "node:fs";
import zlib from "node:zlib";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Penulis ZIP yang mengalir, tanpa data descriptor.
 *
 * Kenapa tidak memakai `generateNodeStream` milik JSZip: opsi `streamFiles` menulis
 * data descriptor (ukuran dan CRC diletakkan SESUDAH isi berkas, dengan flag bit 3),
 * dan **Windows Explorer menolak arsip seperti itu** — "The Compressed (zipped)
 * Folder is invalid" — walaupun `unzip -t`, bsdtar, dan JSZip sendiri membacanya.
 * Dokumen JSZip pun memperingatkan opsi itu "may not be supported by all unzippers".
 *
 * Karena itu tiap berkas dikompres lebih dulu (keluarannya ditampung, satu berkas
 * sekaligus — bukan seluruh arsip), lalu local header ditulis dengan ukuran dan CRC
 * yang sudah diketahui: ZIP biasa, flag 0. Memori tetap datar seperti versi streaming,
 * tapi hasilnya bisa dibuka pengekstrak bawaan Windows.
 *
 * Batas yang disengaja: tanpa ZIP64. Batas bundel project 500 MB dan jumlah berkas
 * di bawah 65 535, jadi arsipnya selalu muat di bentuk klasik; kalau tidak, kelas ini
 * melempar pesan yang jelas daripada menulis arsip yang rusak.
 */

const MAX_UINT16 = 0xffff;
const MAX_UINT32 = 0xffffffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32Update(crc: number, chunk: Uint8Array): number {
  let value = crc;
  for (let i = 0; i < chunk.length; i++) value = CRC_TABLE[(value ^ chunk[i]) & 0xff] ^ (value >>> 8);
  return value >>> 0;
}

function u16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value & MAX_UINT16, 0);
  return buffer;
}

function u32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

/** Tanggal/waktu format MS-DOS yang dipakai ZIP. */
function dosDateTime(ms: number): { time: number; date: number } {
  const when = new Date(Number.isFinite(ms) ? ms : Date.now());
  const year = Math.max(1980, when.getFullYear());
  return {
    time: (when.getHours() << 11) | (when.getMinutes() << 5) | Math.floor(when.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate(),
  };
}

interface CompressedFile {
  chunks: Buffer[];
  crc: number;
  rawSize: number;
  mtimeMs: number;
}

/** Mengompres satu berkas di disk sambil menghitung CRC dan ukuran aslinya. */
async function compressFile(abs: string, onChunk?: (bytes: number) => void): Promise<CompressedFile> {
  const chunks: Buffer[] = [];
  let crc = 0xffffffff;
  let rawSize = 0;

  const counter = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      crc = crc32Update(crc, chunk);
      rawSize += chunk.length;
      onChunk?.(chunk.length);
      done(null, chunk);
    },
  });

  const [stat] = await Promise.all([
    fs.promises.stat(abs),
    // An async generator as the last stage: with a bare `data` listener on the
    // deflate stream, `pipeline()` lost the output when a Transform sat in the
    // middle (measured: 0 chunks collected for a 5 KB file).
    pipeline(
      fs.createReadStream(abs),
      counter,
      zlib.createDeflateRaw({ level: 6 }),
      async function* (source) {
        for await (const chunk of source) chunks.push(chunk as Buffer);
      },
    ),
  ]);

  return { chunks, crc: (crc ^ 0xffffffff) >>> 0, rawSize, mtimeMs: stat.mtimeMs };
}

/** Entri yang isinya sudah di memori (manifest dan JSON lain di dalam bundel). */
function compressData(data: string | Buffer, onChunk?: (bytes: number) => void): CompressedFile {
  const raw = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  const crc = (crc32Update(0xffffffff, raw) ^ 0xffffffff) >>> 0;
  onChunk?.(raw.length);
  return { chunks: [zlib.deflateRawSync(raw, { level: 6 })], crc, rawSize: raw.length, mtimeMs: Date.now() };
}

export interface ZipEntry {
  /** Jalur di dalam ZIP, selalu dengan "/" sebagai pemisah. */
  name: string;
  /** Berkas nyata di disk. */
  abs?: string;
  /** Isi yang sudah di memori (dipakai untuk manifest dan JSON lain). */
  data?: string | Buffer;
  /** Dipanggil per potongan yang dibaca, untuk progress. */
  onChunk?: (bytes: number) => void;
  /** Dipanggil setelah entri ini selesai ditulis. */
  onFileDone?: () => void;
}

interface CentralEntry {
  nameBytes: Buffer;
  crc: number;
  compressedSize: number;
  rawSize: number;
  offset: number;
  flags: number;
  time: number;
  date: number;
}

/**
 * Menghasilkan potongan-potongan ZIP satu per satu.
 *
 * Berkasnya dibaca berurutan: satu berkas ditampung, ditulis, lalu dilepas — jadi
 * memori mengikuti berkas terbesar, bukan ukuran seluruh arsip.
 */
export async function* zipChunks(entries: ZipEntry[]): AsyncGenerator<Buffer> {
  if (entries.length > MAX_UINT16) {
    throw new Error(`Jumlah berkas melebihi batas ZIP klasik (${MAX_UINT16}); butuh ZIP64.`);
  }

  const central: CentralEntry[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, "utf8");
    // Flag 0x0800 menandai nama ber-UTF-8; hanya dipasang bila memang ada
    // karakter di luar ASCII, seperti yang dilakukan penulis ZIP lain.
    const flags = /[^\x00-\x7f]/.test(entry.name) ? 0x0800 : 0;

    const file = entry.abs
      ? await compressFile(entry.abs, entry.onChunk)
      : compressData(entry.data ?? "", entry.onChunk);
    const { time, date } = dosDateTime(file.mtimeMs);
    const compressedSize = file.chunks.reduce((sum, chunk) => sum + chunk.length, 0);

    if (offset + compressedSize > MAX_UINT32) {
      throw new Error("Ukuran arsip melebihi batas ZIP klasik (4 GB); butuh ZIP64.");
    }

    const localOffset = offset;
    const header = Buffer.concat([
      u32(0x04034b50),
      u16(20), // versi minimum
      u16(flags),
      u16(8), // metode: deflate
      u16(time),
      u16(date),
      u32(file.crc),
      u32(compressedSize),
      u32(file.rawSize),
      u16(nameBytes.length),
      u16(0), // extra
      nameBytes,
    ]);
    yield header;
    offset += header.length;

    for (const chunk of file.chunks) {
      yield chunk;
      offset += chunk.length;
    }

    entry.onFileDone?.();

    central.push({
      nameBytes,
      crc: file.crc,
      compressedSize,
      rawSize: file.rawSize,
      offset: localOffset,
      flags,
      time,
      date,
    });
  }

  const centralOffset = offset;
  let centralSize = 0;

  for (const entry of central) {
    const header = Buffer.concat([
      u32(0x02014b50),
      u16(20), // versi pembuat
      u16(20), // versi minimum
      u16(entry.flags),
      u16(8),
      u16(entry.time),
      u16(entry.date),
      u32(entry.crc),
      u32(entry.compressedSize),
      u32(entry.rawSize),
      u16(entry.nameBytes.length),
      u16(0), // extra
      u16(0), // komentar
      u16(0), // nomor disk
      u16(0), // atribut internal
      u32(0), // atribut eksternal
      u32(entry.offset),
      entry.nameBytes,
    ]);
    centralSize += header.length;
    yield header;
  }

  yield Buffer.concat([
    u32(0x06054b50),
    u16(0), // nomor disk
    u16(0), // disk central directory
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(centralOffset),
    u16(0), // komentar
  ]);
}

/** Aliran ZIP untuk dipakai sebagai body respons HTTP. */
export function zipStream(entries: ZipEntry[]): Readable {
  return Readable.from(zipChunks(entries));
}
