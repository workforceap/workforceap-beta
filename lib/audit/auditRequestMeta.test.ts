import test from 'node:test';
import assert from 'node:assert/strict';

import { auditRequestMeta } from './log';

test('audit rows never record a spoofed x-forwarded-for as the client ip', () => {
  const meta = auditRequestMeta(
    new Request('https://example.test/api/x', {
      headers: { 'x-forwarded-for': '203.0.113.9', 'user-agent': 'unit-test' },
    }),
  );
  assert.equal(meta.ip, null);
  assert.equal(meta.ua, 'unit-test');
});

test('audit rows record the trusted proxy ip when one is present', () => {
  const meta = auditRequestMeta(
    new Request('https://example.test/api/x', {
      headers: { 'x-vercel-forwarded-for': '198.51.100.20', 'x-forwarded-for': '203.0.113.9' },
    }),
  );
  assert.equal(meta.ip, '198.51.100.20');
});

test('no request means no metadata', () => {
  assert.deepEqual(auditRequestMeta(undefined), {});
});
