import { deflateSync, inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const MAX_PNG_BYTES = 300_000;
const MAX_NORMALIZED_IDAT_BYTES = 1_000_000;
// The signing canvas is at most 520 x 160 CSS pixels. This leaves ample room
// for high-density screens while bounding inflation and pdf-lib's work.
const MAX_PIXELS = 2_000_000;

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let crc = n;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 4, 'ascii');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])), 0);
  return Buffer.concat([header, data, checksum]);
}

/**
 * Accept only a bounded, complete RGBA canvas PNG and re-encode its pixels
 * with our own zlib stream. pdf-lib never sees untrusted compressed IDAT bytes.
 * Ancillary chunks are checked for length and CRC, then omitted from the PDF.
 */
export function normalizeDrawnSignaturePng(dataUrl: string): Buffer {
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix) || dataUrl.length > 400_000) throw new Error('Invalid PNG data URL');
  const encoded = dataUrl.slice(prefix.length);
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error('Invalid PNG base64');
  }
  const png = Buffer.from(encoded, 'base64');
  if (png.length < 8 + 25 + 12 || png.length > MAX_PNG_BYTES || !png.subarray(0, 8).equals(PNG_SIGNATURE) || png.toString('base64') !== encoded) {
    throw new Error('Invalid PNG bytes');
  }

  let offset = PNG_SIGNATURE.length;
  let ihdr: Buffer | null = null;
  let width = 0;
  let height = 0;
  let idatLength = 0;
  const idat: Buffer[] = [];
  let endedIdat = false;
  let seenIend = false;

  while (offset < png.length) {
    if (png.length - offset < 12) throw new Error('Truncated PNG chunk');
    const length = png.readUInt32BE(offset);
    if (length > png.length - offset - 12) throw new Error('Truncated PNG chunk data');
    const type = png.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) throw new Error('Invalid PNG chunk type');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (crc32(png.subarray(offset + 4, dataEnd)) !== png.readUInt32BE(dataEnd)) throw new Error('Invalid PNG chunk CRC');
    offset = dataEnd + 4;

    if (ihdr === null && type !== 'IHDR') throw new Error('Missing PNG header');
    if (type === 'IHDR') {
      if (ihdr !== null || length !== 13) throw new Error('Invalid PNG header');
      ihdr = png.subarray(dataStart, dataEnd);
      width = ihdr.readUInt32BE(0);
      height = ihdr.readUInt32BE(4);
      // A transparent browser canvas exports non-interlaced 8-bit RGBA.
      if (width < 1 || height < 1 || width > 4096 || height > 2048 || width * height > MAX_PIXELS ||
          ihdr[8] !== 8 || ihdr[9] !== 6 || ihdr[10] !== 0 || ihdr[11] !== 0 || ihdr[12] !== 0) {
        throw new Error('Unsupported PNG header');
      }
    } else if (type === 'IDAT') {
      if (endedIdat || seenIend) throw new Error('Invalid PNG image data order');
      idat.push(png.subarray(dataStart, dataEnd));
      idatLength += length;
      if (idatLength > MAX_PNG_BYTES) throw new Error('PNG image data is too large');
    } else if (type === 'IEND') {
      if (length !== 0 || idatLength === 0 || offset !== png.length) throw new Error('Invalid PNG end');
      seenIend = true;
      break;
    } else {
      if (type[0] === type[0].toUpperCase()) throw new Error('Unsupported critical PNG chunk');
      if (idat.length) endedIdat = true;
    }
  }
  if (!ihdr || !seenIend) throw new Error('Incomplete PNG');

  const compressed = Buffer.concat(idat, idatLength);
  const rowBytes = width * 4;
  const expectedLength = height * (rowBytes + 1);
  // Native zlib is bounded by both input bytes and exact expected image size.
  // Node returns { buffer, engine } for info:true; the project's Node type
  // version does not express that overload for inflateSync.
  const result = inflateSync(compressed, { info: true, maxOutputLength: expectedLength + 1 }) as unknown as {
    buffer: Buffer;
    engine: { bytesWritten: number };
  };
  const pixels = result.buffer;
  if (pixels.length !== expectedLength || result.engine.bytesWritten !== compressed.length) throw new Error('Invalid PNG image data');

  let hasInk = false;
  const stride = rowBytes + 1;
  for (let y = 0; y < height; y++) {
    const row = y * stride + 1;
    const filter = pixels[row - 1];
    if (filter > 4) throw new Error('Invalid PNG row filter');
    for (let x = 0; x < rowBytes; x++) {
      const index = row + x;
      const left = x >= 4 ? pixels[index - 4] : 0;
      const up = y > 0 ? pixels[index - stride] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[index - stride - 4] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upperLeft;
        const dl = Math.abs(p - left);
        const du = Math.abs(p - up);
        const dul = Math.abs(p - upperLeft);
        predictor = dl <= du && dl <= dul ? left : du <= dul ? up : upperLeft;
      }
      pixels[index] = (pixels[index] + predictor) & 0xff;
      if (x % 4 === 3 && pixels[index] > 0) hasInk = true;
    }
    pixels[row - 1] = 0;
  }
  if (!hasInk) throw new Error('The drawn signature is empty');

  // Recompression is bounded too: a hostile filter pattern cannot hand a
  // multi-megabyte normalized image to pdf-lib.
  const normalizedIdat = deflateSync(pixels, { maxOutputLength: MAX_NORMALIZED_IDAT_BYTES + 1 });
  if (normalizedIdat.length > MAX_NORMALIZED_IDAT_BYTES) throw new Error('Normalized PNG is too large');
  return Buffer.concat([PNG_SIGNATURE, pngChunk('IHDR', ihdr), pngChunk('IDAT', normalizedIdat), pngChunk('IEND', Buffer.alloc(0))]);
}
