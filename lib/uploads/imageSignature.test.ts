import test from 'node:test';
import assert from 'node:assert/strict';

import { detectImageSignature, detectUploadSignature, fileMatchesContentType } from './imageSignature';

const bytes = (...parts: Array<number[] | string>) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? Array.from(p, (c) => c.charCodeAt(0)) : p)));

test('detectImageSignature recognises JPEG, PNG and WebP headers', () => {
  assert.equal(detectImageSignature(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'JFIF')), 'image/jpeg');
  assert.equal(detectImageSignature(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d])), 'image/png');
  assert.equal(detectImageSignature(bytes('RIFF', [0x24, 0, 0, 0], 'WEBP')), 'image/webp');
});

test('detectImageSignature refuses anything else', () => {
  assert.equal(detectImageSignature(bytes('<html><body>')), null);
  assert.equal(detectImageSignature(bytes('RIFF', [0x24, 0, 0, 0], 'WAVE')), null);
  assert.equal(detectImageSignature(bytes('GIF89a')), null);
  assert.equal(detectImageSignature(bytes([0xff, 0xd8])), null);
  assert.equal(detectImageSignature(bytes([0x89, 0x50, 0x4e, 0x47])), null);
  assert.equal(detectImageSignature(new Uint8Array(0)), null);
});

test('detectUploadSignature adds PDF and GIF to the three image types', () => {
  assert.equal(detectUploadSignature(bytes('%PDF-1.7\n%')), 'application/pdf');
  assert.equal(detectUploadSignature(bytes('%PDF-')), 'application/pdf');
  assert.equal(detectUploadSignature(bytes('GIF87a', [1, 0])), 'image/gif');
  assert.equal(detectUploadSignature(bytes('GIF89a', [1, 0])), 'image/gif');
  assert.equal(detectUploadSignature(bytes([0xff, 0xd8, 0xff, 0xe1])), 'image/jpeg');
  assert.equal(detectUploadSignature(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(detectUploadSignature(bytes('RIFF', [0x24, 0, 0, 0], 'WEBP')), 'image/webp');
});

test('detectUploadSignature refuses near misses and non-document bytes', () => {
  assert.equal(detectUploadSignature(bytes('<html><body>')), null);
  assert.equal(detectUploadSignature(bytes(' %PDF-1.7')), null);
  assert.equal(detectUploadSignature(bytes('%PDF')), null);
  assert.equal(detectUploadSignature(bytes('GIF88a')), null);
  assert.equal(detectUploadSignature(bytes([0x50, 0x4b, 0x03, 0x04])), null);
  assert.equal(detectUploadSignature(new Uint8Array(0)), null);
});

test('fileMatchesContentType compares the sniffed header with the claimed type', async () => {
  assert.equal(await fileMatchesContentType(new Blob([bytes('%PDF-1.4 x')]), 'application/pdf'), true);
  assert.equal(await fileMatchesContentType(new Blob([bytes('<html>')]), 'application/pdf'), false);
  assert.equal(await fileMatchesContentType(new Blob([bytes([0xff, 0xd8, 0xff, 0xe0])]), 'image/png'), false);
  assert.equal(await fileMatchesContentType(new Blob([bytes('GIF89a')]), 'image/gif'), true);
});
