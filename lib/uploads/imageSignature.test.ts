import test from 'node:test';
import assert from 'node:assert/strict';

import { detectImageSignature } from './imageSignature';

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
