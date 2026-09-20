/**
 * Route-local hardening batch 4 (report-only findings from the public API audits):
 *  - /api/health/ready does not echo the Prisma/driver error text on 503
 *  - /api/invite/validate?token= is rate limited per IP (the ?code path already was)
 *  - /api/org/[slug]/outcomes is rate limited per IP (still unauthenticated by design)
 *  - /api/apply/confirmation-email answers the same 200 whether or not an application exists
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  healthRateLimit: vi.fn(),
  inviteAcceptRateLimit: vi.fn(),
  inviteValidateRateLimit: vi.fn(),
  orgOutcomesRateLimit: vi.fn(),
  confirmationIpRateLimit: vi.fn(),
  confirmationEmailRateLimit: vi.fn(),
  organizationFindUnique: vi.fn(),
  invitationFindUnique: vi.fn(),
  invitationFindFirst: vi.fn(),
  invitationUpdate: vi.fn(),
  partnerFindUnique: vi.fn(),
  applicationFindFirst: vi.fn(),
  generateOutcomes: vi.fn(),
  sendConfirmationEmail: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: class extends Response {
    constructor(body?: BodyInit | null, init?: ResponseInit) {
      super(body ?? null, init);
    }
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  },
}));
vi.mock('@/lib/http/clientIp', () => ({ getClientIpFromRequest: () => '203.0.113.7' }));
vi.mock('@/lib/http/publicApiCors', () => ({
  publicApiCorsHeaders: () => ({ 'Access-Control-Allow-Origin': '*' }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkPublicHealthRateLimit: mocks.healthRateLimit,
  // Readiness reports the limiter posture (WAP-13); this suite is about the failure body.
  getRateLimiterMode: () => 'redis',
  checkInviteAcceptRateLimit: mocks.inviteAcceptRateLimit,
  checkPublicInviteValidateRateLimit: mocks.inviteValidateRateLimit,
  checkPublicOrgOutcomesRateLimit: mocks.orgOutcomesRateLimit,
  checkConfirmationEmailRateLimit: mocks.confirmationIpRateLimit,
  checkConfirmationEmailEmailRateLimit: mocks.confirmationEmailRateLimit,
}));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: never[]) => Promise<Response>) => handler,
}));
vi.mock('@/lib/db/prisma', () => {
  const prisma = {
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => Promise<unknown>)(prisma) : Promise.all(arg as never),
    ),
    organization: { findUnique: mocks.organizationFindUnique },
    invitation: {
      findUnique: mocks.invitationFindUnique,
      findFirst: mocks.invitationFindFirst,
      update: mocks.invitationUpdate,
    },
    partner: { findUnique: mocks.partnerFindUnique },
    application: { findFirst: mocks.applicationFindFirst },
  };
  return { prisma };
});
vi.mock('@/lib/content/programs', () => ({ getProgramBySlug: () => null }));
vi.mock('@/lib/public/publicDataFilters', () => ({
  sanitizePublicPartnerLabel: (v: string) => v,
  sanitizePublicSubgroupLabel: (v: string) => v,
}));
vi.mock('@/lib/analytics/partnerQuarterlyOutcomes', () => ({
  generatePartnerQuarterlyOutcomes: mocks.generateOutcomes,
  getDefaultQuarter: () => ({ quarter: 'Q1', year: 2026 }),
}));
vi.mock('@/lib/email', () => ({ sendApplicationConfirmationEmail: mocks.sendConfirmationEmail }));

import { GET as readyGet } from '@/app/api/health/ready/route';
import { __resetReadyCache } from '@/app/api/health/ready/_readyCache';
import { GET as inviteValidateGet } from '@/app/api/invite/validate/route';
import { GET as orgOutcomesGet } from '@/app/api/org/[slug]/outcomes/route';
import { POST as confirmationEmailPost } from '@/app/api/apply/confirmation-email/route';

type NextRequestLike = import('next/server').NextRequest;
function asNextRequest(request: Request) {
  // The handlers only use `.url`, `.headers` and `.json()`, which the WHATWG Request provides.
  return request as unknown as NextRequestLike;
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

describe('GET /api/health/ready failure body', () => {
  const DRIVER_MESSAGE = "Can't reach database server at `db-primary.internal:5432` (pool timeout, statement organization_find)";

  beforeEach(() => {
    __resetReadyCache();
    mocks.healthRateLimit.mockResolvedValue({ success: true });
  });

  it('returns a generic 503 reason and never the Prisma error text', async () => {
    mocks.organizationFindUnique.mockRejectedValue(new Error(DRIVER_MESSAGE));

    const res = await readyGet(new Request('http://localhost/api/health/ready'));

    expect(res.status).toBe(503);
    const body = await res.json();
    // Shape monitoring depends on is unchanged.
    expect(body).toMatchObject({
      status: 'fail',
      probe: 'ready',
      checks: {
        database: { status: 'fail' },
        organization: { status: 'fail', slug: 'workforceap', reason: 'Database unavailable' },
      },
    });
    const raw = JSON.stringify(body);
    expect(raw).not.toContain('db-primary.internal');
    expect(raw).not.toContain('5432');
    expect(raw).not.toContain('pool timeout');
  });

  it('keeps the real error server-side', async () => {
    mocks.organizationFindUnique.mockRejectedValue(new Error(DRIVER_MESSAGE));

    await readyGet(new Request('http://localhost/api/health/ready'));

    const logged = errorSpy.mock.calls.map((call: unknown[]) => String(call.map((c) => (c instanceof Error ? c.message : String(c))).join(' '))).join('\n');
    expect(logged).toContain('/health/ready database check failed');
    expect(logged).toContain('db-primary.internal:5432');
  });

  it('still reports the missing-default-org reason (not an error string)', async () => {
    mocks.organizationFindUnique.mockResolvedValue(null);

    const res = await readyGet(new Request('http://localhost/api/health/ready'));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.organization.reason).toMatch(/Default organization missing/);
  });
});

describe('GET /api/invite/validate?token= rate limiting', () => {
  const TOKEN = 'a'.repeat(48);

  beforeEach(() => {
    mocks.inviteValidateRateLimit.mockResolvedValue({ success: true });
    mocks.inviteAcceptRateLimit.mockResolvedValue({ success: true });
  });

  it('returns 429 before touching the database when the per-IP cap is hit', async () => {
    mocks.inviteValidateRateLimit.mockResolvedValue({ success: false });

    const res = await inviteValidateGet(asNextRequest(new Request(`http://localhost/api/invite/validate?token=${TOKEN}`)));

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ valid: false, error: 'Too many attempts. Please try again in an hour.' });
    expect(mocks.inviteValidateRateLimit).toHaveBeenCalledWith('203.0.113.7');
    expect(mocks.invitationFindUnique).not.toHaveBeenCalled();
  });

  it('charges the limiter for malformed tokens too', async () => {
    const res = await inviteValidateGet(asNextRequest(new Request('http://localhost/api/invite/validate?token=short')));

    expect(res.status).toBe(400);
    expect(mocks.inviteValidateRateLimit).toHaveBeenCalledTimes(1);
  });

  it('still resolves a valid token when within the limit', async () => {
    mocks.invitationFindUnique.mockResolvedValue({
      id: 'inv-1',
      token: TOKEN,
      email: 'invitee@example.com',
      role: 'student',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
      programSlug: null,
      counselorAffiliation: null,
      invitedBy: { fullName: 'Staff Member' },
      subgroup: null,
      partner: null,
    });

    const res = await inviteValidateGet(asNextRequest(new Request(`http://localhost/api/invite/validate?token=${TOKEN}`)));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.valid).toBe(true);
    expect(body.token).toBeUndefined();
    expect(mocks.inviteValidateRateLimit).toHaveBeenCalledTimes(1);
  });

  it('does not double-charge the ?code path (its own limiter still applies)', async () => {
    mocks.invitationFindFirst.mockResolvedValue({ token: TOKEN });
    mocks.invitationFindUnique.mockResolvedValue({
      id: 'inv-1',
      token: TOKEN,
      email: 'invitee@example.com',
      role: 'student',
      status: 'pending',
      expiresAt: new Date(Date.now() + 60_000),
      programSlug: null,
      counselorAffiliation: null,
      invitedBy: { fullName: 'Staff Member' },
      subgroup: null,
      partner: null,
    });

    const res = await inviteValidateGet(asNextRequest(new Request(
      'http://localhost/api/invite/validate?code=ABCD-1234&email=invitee%40example.com',
    )));

    expect(res.status).toBe(200);
    expect(mocks.inviteAcceptRateLimit).toHaveBeenCalledTimes(1);
    expect(mocks.inviteValidateRateLimit).not.toHaveBeenCalled();
  });
});

describe('GET /api/org/[slug]/outcomes rate limiting', () => {
  const ctx = { params: Promise.resolve({ slug: 'partner-one' }) };

  beforeEach(() => {
    mocks.orgOutcomesRateLimit.mockResolvedValue({ success: true });
    mocks.partnerFindUnique.mockResolvedValue({ id: 'partner-1', organizationId: 'org-1' });
    mocks.generateOutcomes.mockResolvedValue({ quarter: 'Q1', year: 2026, totals: { members: 3 }, membersList: [{ id: 'm-1' }] });
  });

  it('returns 429 before the partner lookup when the per-IP cap is hit', async () => {
    mocks.orgOutcomesRateLimit.mockResolvedValue({ success: false });

    const res = await orgOutcomesGet(asNextRequest(new Request('http://localhost/api/org/partner-one/outcomes')), ctx);

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'Too many requests' });
    expect(mocks.orgOutcomesRateLimit).toHaveBeenCalledWith('203.0.113.7');
    expect(mocks.partnerFindUnique).not.toHaveBeenCalled();
    expect(mocks.generateOutcomes).not.toHaveBeenCalled();
  });

  it('remains unauthenticated and strips membersList when within the limit', async () => {
    const res = await orgOutcomesGet(asNextRequest(new Request('http://localhost/api/org/partner-one/outcomes?quarter=q2&year=2026')), ctx);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ quarter: 'Q1', year: 2026, totals: { members: 3 } });
    expect(body.membersList).toBeUndefined();
    expect(mocks.generateOutcomes).toHaveBeenCalledWith('org-1', 'partner-1', { quarter: 'Q2', year: 2026 });
  });
});

describe('POST /api/apply/confirmation-email existence oracle', () => {
  function confirmationRequest(body: unknown) {
    return asNextRequest(new Request('http://localhost/api/apply/confirmation-email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
  }

  beforeEach(() => {
    mocks.confirmationIpRateLimit.mockResolvedValue({ success: true });
    mocks.confirmationEmailRateLimit.mockResolvedValue({ success: true });
    mocks.sendConfirmationEmail.mockResolvedValue({ ok: true });
  });

  it('answers 200 { ok: true } and sends nothing when no recent application exists', async () => {
    mocks.applicationFindFirst.mockResolvedValue(null);

    const res = await confirmationEmailPost(confirmationRequest({ email: 'nobody@example.com', fullName: 'Nobody' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.sendConfirmationEmail).not.toHaveBeenCalled();
  });

  it('answers the identical body when an application exists and the email is sent', async () => {
    mocks.applicationFindFirst.mockResolvedValue({ id: 'app-1' });

    const res = await confirmationEmailPost(confirmationRequest({ email: 'applicant@example.com', fullName: 'Applicant' }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mocks.sendConfirmationEmail).toHaveBeenCalledWith({
      to: 'applicant@example.com',
      fullName: 'Applicant',
      applicationId: 'app-1',
    });
  });

  it('still rejects malformed input with 400 before any lookup', async () => {
    const res = await confirmationEmailPost(confirmationRequest({ email: 'not-an-email', fullName: 'X' }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid data' });
    expect(mocks.applicationFindFirst).not.toHaveBeenCalled();
  });
});
