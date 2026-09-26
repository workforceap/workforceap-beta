import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { normalizeDrawnSignaturePng } from './signaturePng';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length, 0);
  header.write(type, 4, 'ascii');
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([header.subarray(4), data])), 0);
  return Buffer.concat([header, data, checksum]);
}

function png(raw: Buffer, width = 1, height = 1, idat = deflateSync(raw)): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

function dataUrl(bytes: Buffer): string {
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

describe('drawn signature PNG safety', () => {
  const ink = Buffer.from([0, 27, 42, 107, 255]);

  it('normalizes a visible canvas pixel into a complete embeddable PNG', () => {
    const result = normalizeDrawnSignaturePng(dataUrl(png(ink)));
    assert.deepEqual(normalizeDrawnSignaturePng(dataUrl(result)), result);
  });

  it('rejects a valid-CRC IDAT with non-zlib data', () => {
    assert.throws(() => normalizeDrawnSignaturePng(dataUrl(png(ink, 1, 1, Buffer.from('not a zlib stream')))));
  });

  it('rejects a valid-CRC IDAT truncated by 30 bytes', () => {
    const width = 64;
    const height = 16;
    const raw = Buffer.alloc(height * (width * 4 + 1));
    let seed = 1;
    for (let y = 0; y < height; y++) {
      for (let x = 1; x < width * 4 + 1; x++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        raw[y * (width * 4 + 1) + x] = seed >>> 24;
      }
    }
    const complete = deflateSync(raw);
    assert.ok(complete.length > 30);
    assert.throws(() => normalizeDrawnSignaturePng(dataUrl(png(raw, width, height, complete.subarray(0, -30)))));
  });

  it('rejects output larger than the declared image without unbounded inflate', () => {
    assert.throws(() => normalizeDrawnSignaturePng(dataUrl(png(ink, 1, 1, deflateSync(Buffer.alloc(100_000))))));
  });

  it('rejects bad row filters and transparent blank signatures', () => {
    assert.throws(() => normalizeDrawnSignaturePng(dataUrl(png(Buffer.from([5, 27, 42, 107, 255])))));
    assert.throws(() => normalizeDrawnSignaturePng(dataUrl(png(Buffer.alloc(5)))));
  });

  it('rejects invalid chunk CRC and trailing bytes after IEND', () => {
    const valid = png(ink);
    const badCrc = Buffer.from(valid);
    badCrc[badCrc.length - 5] ^= 1;
    assert.throws(() => normalizeDrawnSignaturePng(dataUrl(badCrc)));
    assert.throws(() => normalizeDrawnSignaturePng(dataUrl(Buffer.concat([valid, Buffer.from('trailing')]))));
  });
});
