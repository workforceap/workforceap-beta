import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Product call 28a (Mike Brown "Do it", 2026-09-22 15:57 UTC): the public
 * status lookup emails a signed 30-minute link when an application exists.
 * The visitor-facing response must be identical either way, and all work
 * that depends on the answer runs after the response via `after()`.
 */
const afterQueue = vi.hoisted(() => [] as Array<() => unknown>);

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
  // Real `after()` runs once the response has been sent; the test flushes it.
  after: (fn: () => unknown) => {
    afterQueue.push(fn);
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  checkApplyStatusLookupRateLimit: vi.fn(),
  checkApplyStatusLookupEmailRateLimit: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request) => Promise<Response>) => handler,
  withSystemGuc: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock('@/lib/apply/statusLookup', () => ({
  findApplicationForStatusLookup: vi.fn(),
}));

vi.mock('@/lib/apply/statusLinkEmail', () => ({
  sendApplicationStatusLinkEmail: vi.fn(),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));

vi.mock('@/lib/tenant/organizationBranding', () => ({
  getOrganizationBranding: vi.fn(async () => ({
    orgId: 'org-1',
    name: 'Workforce Advancement Project',
    logoUrl: 'https://www.workforceap.org/images/wap_logo.png',
    primaryColor: '#4a9b4f',
    supportEmail: 'info@workforceap.org',
    domain: 'https://www.workforceap.org',
    domainLabel: 'www.workforceap.org',
  })),
}));

vi.mock('@/lib/observability/captureApiError', () => ({
  captureApiResponseError: vi.fn(),
  captureApiError: vi.fn(),
}));

import { POST as statusLookup } from '@/app/api/apply/status-lookup/route';
import { checkApplyStatusLookupEmailRateLimit, checkApplyStatusLookupRateLimit } from '@/lib/rate-limit';
import { findApplicationForStatusLookup } from '@/lib/apply/statusLookup';
import { sendApplicationStatusLinkEmail } from '@/lib/apply/statusLinkEmail';
import { auditLog } from '@/lib/audit';
import { captureApiError } from '@/lib/observability/captureApiError';
import { verifyApplicationStatusLinkToken } from '@/lib/apply/statusLinkToken';

const makeRequest = (body: unknown): any =>
  new Request('http://localhost:3000/api/apply/status-lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

async function flushAfter() {
  const pending = afterQueue.splice(0);
  await Promise.all(pending.map((fn) => fn()));
}

const knownMatch = {
  applicationId: 'app-1',
  userId: 'user-1',
  organizationId: 'org-1',
  email: 'Applied@Example.com',
  fullName: 'Ada Applicant',
};

const expectedBody = {
  ok: true,
  message: "If we have an application under that address, we've emailed you a link. It expires in 30 minutes.",
  expiresInMinutes: 30,
};

beforeEach(() => {
  vi.clearAllMocks();
  afterQueue.length = 0;
  vi.stubEnv('AUTH_TRUST_COOKIE_SECRET', 'route-test-secret');
  vi.mocked(checkApplyStatusLookupRateLimit).mockResolvedValue({ success: true });
  vi.mocked(checkApplyStatusLookupEmailRateLimit).mockResolvedValue({ success: true });
  vi.mocked(findApplicationForStatusLookup).mockResolvedValue(null);
  vi.mocked(sendApplicationStatusLinkEmail).mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /api/apply/status-lookup', () => {
  it('answers every valid email with the same body before any lookup runs', async () => {
    const cases = [
      { email: 'applied@example.com', match: knownMatch },
      { email: 'Unknown@Example.com', match: null },
      { email: 'another@example.com', match: { ...knownMatch, applicationId: 'app-2', email: 'another@example.com' } },
    ];
    const bodies: unknown[] = [];
    for (const c of cases) {
      vi.mocked(findApplicationForStatusLookup).mockResolvedValueOnce(c.match);
      const res = await statusLookup(makeRequest({ email: c.email }));
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      // Nothing that depends on the answer has run when the response exists.
      expect(findApplicationForStatusLookup).not.toHaveBeenCalled();
      expect(sendApplicationStatusLinkEmail).not.toHaveBeenCalled();
      const text = await res.text();
      expect(text).not.toMatch(/example\.com/i);
      bodies.push(JSON.parse(text));
      await flushAfter();
      vi.mocked(findApplicationForStatusLookup).mockClear();
      vi.mocked(sendApplicationStatusLinkEmail).mockClear();
    }
    expect(bodies).toEqual(cases.map(() => expectedBody));
    for (const body of bodies as Array<{ message: string }>) {
      expect(body.message).not.toMatch(/SMS|text message/i);
      expect(body.message).not.toMatch(/business day|hours|reply/i);
    }
  });

  it('emails exactly one signed link to the row address for a known email, and audits it without the address', async () => {
    vi.mocked(findApplicationForStatusLookup).mockResolvedValueOnce(knownMatch);

    const res = await statusLookup(makeRequest({ email: '  APPLIED@example.com ' }));
    expect(res.status).toBe(200);
    await flushAfter();

    expect(findApplicationForStatusLookup).toHaveBeenCalledWith('applied@example.com');
    expect(sendApplicationStatusLinkEmail).toHaveBeenCalledTimes(1);
    const sent = vi.mocked(sendApplicationStatusLinkEmail).mock.calls[0][0];
    expect(sent.to).toBe('Applied@Example.com');
    expect(sent.fullName).toBe('Ada Applicant');
    expect(sent.expiresInMinutes).toBe(30);
    expect(sent.userId).toBe('user-1');
    expect(sent.applicationId).toBe('app-1');

    const url = new URL(sent.url);
    expect(url.origin).toBe('https://www.workforceap.org');
    expect(url.pathname).toBe('/apply/status/view');
    expect(sent.url).not.toMatch(/example\.com/i);
    const token = url.searchParams.get('t');
    expect(token).toBeTruthy();
    const verified = verifyApplicationStatusLinkToken(token);
    expect(verified).toMatchObject({ ok: true, applicationId: 'app-1', organizationId: 'org-1' });

    expect(auditLog).toHaveBeenCalledTimes(1);
    const audit = vi.mocked(auditLog).mock.calls[0][0];
    expect(audit).toMatchObject({
      actorUserId: null,
      action: 'application_status_link_requested',
      targetType: 'Application',
      targetId: 'app-1',
      metadata: { matched: true, orgId: 'org-1', emailSent: true, expiresInMinutes: 30 },
    });
    expect(JSON.stringify(audit)).not.toMatch(/example\.com/i);
  });

  it('sends nothing for an unknown email but still records the request', async () => {
    vi.mocked(findApplicationForStatusLookup).mockResolvedValueOnce(null);
    const res = await statusLookup(makeRequest({ email: 'unknown@example.com' }));
    expect(res.status).toBe(200);
    await flushAfter();

    expect(sendApplicationStatusLinkEmail).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledTimes(1);
    const audit = vi.mocked(auditLog).mock.calls[0][0];
    expect(audit).toMatchObject({
      actorUserId: null,
      action: 'application_status_link_requested',
      targetType: 'ApplicationStatusLookup',
      targetId: null,
      metadata: { matched: false },
    });
    expect(JSON.stringify(audit)).not.toMatch(/example\.com/i);
  });

  it('keeps the response unchanged when the send fails after the response', async () => {
    vi.mocked(findApplicationForStatusLookup).mockResolvedValueOnce(knownMatch);
    vi.mocked(sendApplicationStatusLinkEmail).mockRejectedValueOnce(new Error('provider down'));

    const res = await statusLookup(makeRequest({ email: 'applied@example.com' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expectedBody);
    await flushAfter();
    expect(captureApiError).toHaveBeenCalledWith(expect.any(Error), { route: 'apply/status-lookup/after' });
  });

  it('returns 429 with Retry-After when the IP limit is hit, before reading the body', async () => {
    vi.mocked(checkApplyStatusLookupRateLimit).mockResolvedValue({ success: false });
    const res = await statusLookup(makeRequest({ email: 'applied@example.com' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('3600');
    expect((await res.json()).error).toContain('Too many requests');
    expect(checkApplyStatusLookupEmailRateLimit).not.toHaveBeenCalled();
    await flushAfter();
    expect(findApplicationForStatusLookup).not.toHaveBeenCalled();
    expect(sendApplicationStatusLinkEmail).not.toHaveBeenCalled();
  });

  it('returns 429 when the per-email limit is hit, keyed on the normalized address', async () => {
    vi.mocked(checkApplyStatusLookupEmailRateLimit).mockResolvedValue({ success: false });
    const res = await statusLookup(makeRequest({ email: 'Applied@Example.com' }));
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('3600');
    expect(checkApplyStatusLookupEmailRateLimit).toHaveBeenCalledWith('applied@example.com');
    await flushAfter();
    expect(findApplicationForStatusLookup).not.toHaveBeenCalled();
    expect(sendApplicationStatusLinkEmail).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid JSON', async () => {
    const res = await statusLookup(makeRequest('not-json'));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid JSON' });
    expect(afterQueue).toHaveLength(0);
  });

  it('returns 400 for an invalid email and schedules no work', async () => {
    const res = await statusLookup(makeRequest({ email: 'not-an-email' }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('valid email');
    expect(checkApplyStatusLookupEmailRateLimit).not.toHaveBeenCalled();
    expect(afterQueue).toHaveLength(0);
  });
});
