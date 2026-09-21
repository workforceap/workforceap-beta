// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  rateLimit: vi.fn(),
}));
vi.mock('@/lib/observability/logger', () => ({ logger: { info: mocks.info, warn: mocks.warn, error: mocks.error, debug: vi.fn() } }));
vi.mock('@/lib/security/cspReportRateLimit', () => ({ checkCspReportRateLimit: mocks.rateLimit }));
vi.mock('@/lib/http/clientIp', () => ({ getClientIpFromRequest: () => '203.0.113.7' }));

import { GET, POST } from '@/app/api/csp-report/route';

const URL = 'https://www.workforceap.org/api/csp-report';

function post(body: string, contentType = 'application/csp-report', extraHeaders: Record<string, string> = {}) {
  return new Request(URL, { method: 'POST', headers: { 'content-type': contentType, ...extraHeaders }, body });
}

const legacyReport = JSON.stringify({
  'csp-report': {
    'document-uri': 'https://www.workforceap.org/en/login?redirectTo=%2Fdashboard&email=member%40example.invalid',
    referrer: 'https://www.google.com/?q=private-search',
    'violated-directive': "script-src 'self' 'nonce-abc' 'strict-dynamic'",
    'effective-directive': 'script-src-elem',
    'original-policy': "default-src 'self'; script-src 'self'",
    disposition: 'report',
    'blocked-uri': 'https://www.googletagmanager.com/gtm.js?id=GTM-53JCT6WN',
    'status-code': 200,
    'script-sample': 'window.__leak = "member@example.invalid"',
    'source-file': 'https://www.workforceap.org/_next/static/chunks/main-app.js',
    'line-number': 12,
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue({ success: true });
});

describe('POST /api/csp-report (WAP-36 phase 1 sink)', () => {
  it('answers 204 to a legacy report-uri body and logs a counted, PII-free event', async () => {
    const response = await POST(post(legacyReport));
    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    expect(mocks.rateLimit).toHaveBeenCalledWith('203.0.113.7');
    expect(mocks.info).toHaveBeenCalledTimes(1);
    expect(mocks.info).toHaveBeenCalledWith('csp.violation', {
      directive: 'script-src-elem',
      blockedHost: 'www.googletagmanager.com',
      documentPath: '/en/login',
      disposition: 'report',
      count: 1,
      format: 'application/csp-report',
    });
    const logged = JSON.stringify([...mocks.info.mock.calls, ...mocks.warn.mock.calls, ...mocks.error.mock.calls]);
    expect(logged).not.toContain('member');
    expect(logged).not.toContain('example.invalid');
    expect(logged).not.toContain('redirectTo');
    expect(logged).not.toContain('GTM-53JCT6WN');
    expect(logged).not.toContain('private-search');
    expect(logged).not.toContain('__leak');
    expect(logged).not.toContain('main-app.js');
    expect(logged).not.toContain('https://');
  });

  it('answers 204 to a Reporting API batch and aggregates identical violations into one count', async () => {
    const violation = {
      age: 10,
      type: 'csp-violation',
      url: 'https://www.workforceap.org/dashboard?tab=jobs',
      user_agent: 'Mozilla/5.0 synthetic',
      body: { documentURL: 'https://www.workforceap.org/dashboard?tab=jobs', blockedURL: 'inline', effectiveDirective: 'script-src-elem', disposition: 'report', sample: 'document.documentElement.setAttribute("data-portal-role","member")' },
    };
    const response = await POST(post(JSON.stringify([violation, violation, violation]), 'application/reports+json; charset=utf-8'));
    expect(response.status).toBe(204);
    expect(mocks.info).toHaveBeenCalledTimes(1);
    expect(mocks.info.mock.calls[0][1]).toMatchObject({ blockedHost: 'inline', documentPath: '/dashboard', count: 3, format: 'application/reports+json' });
    expect(JSON.stringify(mocks.info.mock.calls)).not.toContain('tab=jobs');
    expect(JSON.stringify(mocks.info.mock.calls)).not.toContain('data-portal-role');
  });

  it('refuses bodies over 16 KB with 413, before reading when a length is declared', async () => {
    const declared = await POST(post(legacyReport, 'application/csp-report', { 'content-length': String(16 * 1024 + 1) }));
    expect(declared.status).toBe(413);
    expect(mocks.rateLimit).not.toHaveBeenCalled();

    const padded = JSON.stringify({ 'csp-report': { 'blocked-uri': 'inline', 'script-sample': 'x'.repeat(17 * 1024) } });
    const oversized = await POST(post(padded));
    expect(oversized.status).toBe(413);
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it('answers 405 with Allow: POST on GET', async () => {
    const response = await GET();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('POST');
  });

  it('answers 415 to any other media type and 400 to malformed JSON', async () => {
    expect((await POST(post(legacyReport, 'application/json'))).status).toBe(415);
    expect((await POST(post(legacyReport, 'text/plain'))).status).toBe(415);
    expect((await POST(post('{not json', 'application/csp-report'))).status).toBe(400);
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it('answers 429 when the per-IP limiter rejects and logs nothing', async () => {
    mocks.rateLimit.mockResolvedValue({ success: false });
    const response = await POST(post(legacyReport));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('60');
    expect(mocks.info).not.toHaveBeenCalled();
  });

  it('answers 204 without logging for a well-formed body of unknown shape', async () => {
    const response = await POST(post(JSON.stringify({ hello: 'world' })));
    expect(response.status).toBe(204);
    expect(mocks.info).not.toHaveBeenCalled();
  });
});
