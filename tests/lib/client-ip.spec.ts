import { describe, expect, it } from 'vitest';

import { getClientIpFromRequest } from '@/lib/http/clientIp';

function request(headers: Record<string, string>): Request {
  return new Request('https://workforceap.org/api/auth/login', { headers });
}

describe('getClientIpFromRequest', () => {
  it('prefers the first x-vercel-forwarded-for segment over every other header', () => {
    expect(
      getClientIpFromRequest(
        request({
          'x-vercel-forwarded-for': '198.51.100.10, 10.0.0.1',
          'x-real-ip': '203.0.113.1',
          'cf-connecting-ip': '203.0.113.2',
          'x-forwarded-for': '192.0.2.1, 198.51.100.10',
        }),
      ),
    ).toBe('198.51.100.10');
  });

  it('uses x-real-ip when Vercel has not set a forwarded-for value', () => {
    expect(getClientIpFromRequest(request({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('uses cf-connecting-ip after x-real-ip is absent', () => {
    expect(getClientIpFromRequest(request({ 'cf-connecting-ip': '198.51.100.44' }))).toBe('198.51.100.44');
  });

  it('ignores a client-controlled x-forwarded-for first segment with no proxy signal', () => {
    expect(getClientIpFromRequest(request({ 'x-forwarded-for': '8.8.8.8, 1.1.1.1' }))).toBe('unknown');
  });

  it('uses the last x-forwarded-for segment when a known proxy signal is present', () => {
    expect(
      getClientIpFromRequest(
        request({
          'x-vercel-id': 'sfo1::abc',
          'x-forwarded-for': '8.8.8.8, 203.0.113.77',
        }),
      ),
    ).toBe('203.0.113.77');
  });

  it('rejects an x-forwarded-for chain that ends in a private or loopback address', () => {
    expect(
      getClientIpFromRequest(
        request({
          'x-caddy-client-ip': '1',
          'x-forwarded-for': '8.8.8.8, 10.1.2.3',
        }),
      ),
    ).toBe('unknown');
    expect(
      getClientIpFromRequest(
        request({
          'x-caddy-client-ip': '1',
          'x-forwarded-for': '8.8.8.8, 192.168.1.4',
        }),
      ),
    ).toBe('unknown');
    expect(
      getClientIpFromRequest(
        request({
          'x-caddy-client-ip': '1',
          'x-forwarded-for': '8.8.8.8, 172.16.0.9',
        }),
      ),
    ).toBe('unknown');
    expect(
      getClientIpFromRequest(
        request({
          'x-caddy-client-ip': '1',
          'x-forwarded-for': '8.8.8.8, 127.0.0.1',
        }),
      ),
    ).toBe('unknown');
  });

  it('rejects an overlong x-forwarded-for chain even with a proxy signal', () => {
    const segments = Array.from({ length: 11 }, (_, i) => `203.0.113.${i + 1}`);
    expect(
      getClientIpFromRequest(
        request({
          'x-vercel-id': 'sfo1::abc',
          'x-forwarded-for': segments.join(', '),
        }),
      ),
    ).toBe('unknown');
  });

  it('returns unknown when no trusted client IP header is present', () => {
    expect(getClientIpFromRequest(request({}))).toBe('unknown');
  });
});
