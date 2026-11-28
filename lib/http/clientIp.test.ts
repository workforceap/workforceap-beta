import test from 'node:test';
import assert from 'node:assert/strict';

import { getClientIpFromRequest } from './clientIp';

function req(headers: Record<string, string>): Request {
  return new Request('https://example.test/api/x', { headers });
}

test('a spoofed x-forwarded-for with no trusted proxy signal is ignored', () => {
  assert.equal(getClientIpFromRequest(req({ 'x-forwarded-for': '203.0.113.9' })), 'unknown');
});

test('the attacker-controlled first x-forwarded-for segment is never used', () => {
  // Edge proxy appended the real peer last; the client forged the first segment.
  const ip = getClientIpFromRequest(
    req({ 'x-forwarded-for': '1.2.3.4, 198.51.100.7', 'x-vercel-id': 'iad1::abc' }),
  );
  assert.equal(ip, '198.51.100.7');
});

test('trusted single-value headers win over x-forwarded-for', () => {
  assert.equal(
    getClientIpFromRequest(req({ 'x-vercel-forwarded-for': '198.51.100.20', 'x-forwarded-for': '1.2.3.4' })),
    '198.51.100.20',
  );
  assert.equal(getClientIpFromRequest(req({ 'x-real-ip': '198.51.100.21', 'x-forwarded-for': '1.2.3.4' })), '198.51.100.21');
  assert.equal(getClientIpFromRequest(req({ 'cf-connecting-ip': '198.51.100.22', 'x-forwarded-for': '1.2.3.4' })), '198.51.100.22');
});

test('a forged chain ending in private space is rejected', () => {
  assert.equal(
    getClientIpFromRequest(req({ 'x-forwarded-for': '1.2.3.4, 10.0.0.5', 'x-vercel-id': 'iad1::abc' })),
    'unknown',
  );
});
