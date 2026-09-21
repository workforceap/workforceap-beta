// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  rateLimit: vi.fn(),
  upsert: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('@/lib/observability/logger', () => ({ logger: { info: mocks.info, warn: mocks.warn, error: mocks.error, debug: vi.fn() } }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    cspViolationBucket: { upsert: mocks.upsert, count: mocks.count, findMany: mocks.findMany },
  },
}));
vi.mock('@/lib/security/cspReportRateLimit', () => ({ checkCspReportRateLimit: mocks.rateLimit }));
vi.mock('@/lib/http/clientIp', () => ({ getClientIpFromRequest: () => '203.0.113.7' }));

import { GET, POST } from '@/app/api/csp-report/route';
import { resetCspBucketCountEstimateForTests } from '@/lib/security/cspViolationStore';

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
  // The store caches the per-hour distinct-row count in module memory; each test starts like a fresh process.
  resetCspBucketCountEstimateForTests();
  mocks.rateLimit.mockResolvedValue({ success: true });
  // The store hands `$transaction` an array of upsert "promises"; resolve them like the pooler would.
  mocks.upsert.mockImplementation((args: unknown) => Promise.resolve({ id: 'bucket', args }));
  mocks.transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
  // Normal case: the hour bucket is far below the per-hour ceiling.
  mocks.count.mockResolvedValue(0);
  mocks.findMany.mockResolvedValue([]);
});

/** Every argument the route handed to the persistence layer, as one string, for negative privacy assertions. */
function persistedText(): string {
  return JSON.stringify(mocks.upsert.mock.calls);
}

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
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe('POST /api/csp-report persistence (WAP-36 phase 2 prep)', () => {
  const reportingApi = (documentURL: string, blockedURL: string, effectiveDirective = 'script-src-elem') => ({
    age: 10,
    type: 'csp-violation',
    url: documentURL,
    user_agent: 'Mozilla/5.0 synthetic-agent',
    body: { documentURL, blockedURL, effectiveDirective, disposition: 'report', sample: 'secret-sample' },
  });

  it('dedupes the batch and issues exactly one upsert per distinct key, in one transaction', async () => {
    const same = reportingApi('https://www.workforceap.org/dashboard?tab=jobs', 'inline');
    const other = reportingApi('https://www.workforceap.org/admin/members/8a4b0c7e-1d2f-4e3a-9b8c-7d6e5f4a3b2c?x=1', 'https://cdn.evil.example/x.js', 'connect-src');
    const response = await POST(post(JSON.stringify([same, same, same, other]), 'application/reports+json'));
    expect(response.status).toBe(204);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);

    const [first, second] = mocks.upsert.mock.calls.map((call) => call[0]);
    expect(first.where.bucketKey).toMatchObject({ directive: 'script-src-elem', blockedHost: 'inline', documentPath: '/dashboard', disposition: 'report' });
    expect(first.create).toMatchObject({ count: 3, blockedHost: 'inline', documentPath: '/dashboard' });
    expect(first.update).toMatchObject({ count: { increment: 3 } });
    expect(second.where.bucketKey).toMatchObject({ directive: 'connect-src', blockedHost: 'cdn.evil.example', documentPath: '/admin/members/:id' });
    expect(second.create.count).toBe(1);

    // Hour bucket: the same truncated hour for every write in the batch, and equal to the create row's.
    const bucket: Date = first.where.bucketKey.hourBucket;
    expect(bucket).toBeInstanceOf(Date);
    expect(bucket.getUTCMinutes()).toBe(0);
    expect(bucket.getUTCSeconds()).toBe(0);
    expect(bucket.getUTCMilliseconds()).toBe(0);
    expect(second.where.bucketKey.hourBucket.getTime()).toBe(bucket.getTime());
    expect(first.create.hourBucket.getTime()).toBe(bucket.getTime());
    expect(first.create.lastSeenAt.getTime()).toBeGreaterThanOrEqual(bucket.getTime());
  });

  it('persists only the redacted summary: no raw URL, query string, sample, user agent or IP', async () => {
    await POST(post(legacyReport));
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    const persisted = persistedText();
    expect(persisted).toContain('"documentPath":"/en/login"');
    expect(persisted).toContain('"blockedHost":"www.googletagmanager.com"');
    for (const forbidden of ['https://', 'http://', 'redirectTo', 'example.invalid', 'member@', 'GTM-53JCT6WN', '__leak', 'main-app.js', 'private-search', 'Mozilla', '203.0.113.7']) {
      expect(persisted, forbidden).not.toContain(forbidden);
    }
    // Only the five key fields plus counters/timestamps are written.
    const { create } = mocks.upsert.mock.calls[0][0];
    expect(Object.keys(create).sort()).toEqual(['blockedHost', 'count', 'directive', 'disposition', 'documentPath', 'firstSeenAt', 'hourBucket', 'lastSeenAt']);
  });

  it('still answers 204 and keeps the csp.violation log line when the database write fails', async () => {
    mocks.transaction.mockRejectedValue(new Error('P1001: cannot reach database'));
    const response = await POST(post(legacyReport));
    expect(response.status).toBe(204);
    expect(mocks.info).toHaveBeenCalledTimes(1);
    expect(mocks.info.mock.calls[0][0]).toBe('csp.violation');
    expect(mocks.error).toHaveBeenCalledWith('csp.violation.persist_failed', expect.objectContaining({ buckets: 1, error: expect.stringContaining('P1001') }));
  });

  it('stores attacker-controlled directive / host garbage only as the allowlist fallbacks', async () => {
    const garbage = {
      type: 'csp-violation',
      url: 'https://www.workforceap.org/members/jane@example.com/profile',
      body: {
        documentURL: 'https://www.workforceap.org/members/jane@example.com/profile',
        blockedURL: 'foo://<img src=x onerror=alert(1)>',
        effectiveDirective: '<b>x</b>',
        disposition: 'report',
      },
    };
    const longDirective = { ...garbage, body: { ...garbage.body, effectiveDirective: 'z'.repeat(300), blockedURL: `https://${'a'.repeat(260)}.example/x.js` } };
    await POST(post(JSON.stringify([garbage, longDirective]), 'application/reports+json'));
    // Both rows normalise to the same fallback key, so they collapse into ONE upsert with count 2:
    // garbage cannot mint distinct rows.
    expect(mocks.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.upsert.mock.calls[0][0].where.bucketKey).toMatchObject({ directive: 'other', blockedHost: 'invalid', documentPath: '/members/:id/profile' });
    expect(mocks.upsert.mock.calls[0][0].create.count).toBe(2);
    const persisted = persistedText();
    expect(persisted).not.toContain('<');
    expect(persisted).not.toContain('jane');
    expect(persisted).not.toContain('zzzz');
  });

  it('stops creating new rows above the per-hour ceiling but still increments existing ones', async () => {
    const existing = reportingApi('https://www.workforceap.org/dashboard', 'inline');
    const fresh = reportingApi('https://www.workforceap.org/en/login', 'inline');
    // 1,999 distinct rows already this hour: room for exactly one more new key.
    mocks.count.mockResolvedValue(1999);
    mocks.findMany.mockImplementation(async () => [
      { hourBucket: mocks.count.mock.calls[0][0].where.hourBucket, directive: 'script-src-elem', blockedHost: 'inline', documentPath: '/dashboard', disposition: 'report' },
    ]);
    const third = reportingApi('https://www.workforceap.org/jobs', 'inline');
    const response = await POST(post(JSON.stringify([existing, existing, fresh, third]), 'application/reports+json'));
    expect(response.status).toBe(204);

    expect(mocks.count).toHaveBeenCalledTimes(1);
    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    // existing key increments; the first new key fits; the second new key is dropped.
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ where: { bucketKey: { documentPath: '/dashboard' } }, update: { count: { increment: 2 } } });
    expect(mocks.upsert.mock.calls[1][0].where.bucketKey.documentPath).toBe('/en/login');
    expect(mocks.warn).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledWith('csp.violation.bucket_ceiling', expect.objectContaining({ ceiling: 2000, skipped: 1, kept: 2 }));
    // The log line for every row is unaffected.
    expect(mocks.info).toHaveBeenCalledTimes(3);
  });

  it('counts distinct rows once per hour bucket, not once per batch, while far below the ceiling', async () => {
    const first = reportingApi('https://www.workforceap.org/dashboard', 'inline');
    const second = reportingApi('https://www.workforceap.org/en/login', 'https://cdn.example/x.js');
    mocks.count.mockResolvedValue(12);
    expect((await POST(post(JSON.stringify([first]), 'application/reports+json'))).status).toBe(204);
    expect((await POST(post(JSON.stringify([second]), 'application/reports+json'))).status).toBe(204);
    expect((await POST(post(JSON.stringify([first, second]), 'application/reports+json'))).status).toBe(204);

    expect(mocks.count).toHaveBeenCalledTimes(1);
    expect(mocks.findMany).not.toHaveBeenCalled();
    // Every batch still reaches the store: one upsert per distinct key per batch.
    expect(mocks.upsert).toHaveBeenCalledTimes(4);
    expect(mocks.warn).not.toHaveBeenCalled();
  });

  it('recounts when the cached estimate reaches the recount margin below the ceiling', async () => {
    const fresh = reportingApi('https://www.workforceap.org/dashboard', 'inline');
    // 1,880 rows already: 1,880 + 1 ≤ 1,900 rides the first count; the estimate then sits at 1,881...
    mocks.count.mockResolvedValue(1880);
    for (let i = 0; i < 20; i += 1) {
      expect((await POST(post(JSON.stringify([fresh]), 'application/reports+json'))).status).toBe(204);
    }
    // ...and the 21st batch (estimate 1,900 + 1 > 1,900) triggers the second real count.
    expect(mocks.count).toHaveBeenCalledTimes(1);
    expect((await POST(post(JSON.stringify([fresh]), 'application/reports+json'))).status).toBe(204);
    expect(mocks.count).toHaveBeenCalledTimes(2);
    // Still below the ceiling on the fresh count, so no existing-key read and nothing skipped.
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.warn).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledTimes(21);
  });

  it('does not touch the database for rejected requests (415, 413, 400, 429)', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false });
    await POST(post(legacyReport));
    await POST(post(legacyReport, 'text/plain'));
    await POST(post('{not json'));
    await POST(post(legacyReport, 'application/csp-report', { 'content-length': String(16 * 1024 + 1) }));
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
