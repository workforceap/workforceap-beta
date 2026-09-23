/**
 * O01: the unauthenticated /api/org/[slug]/outcomes follows the public rules in
 * docs/OUTCOMES-METHODOLOGY.md.
 *  - Section 7: public surfaces show no salary values (and no per-member
 *    days-to-place, which a single placement turns into one person's record).
 *  - Rule 1: a rate whose denominator is below SMALL_SAMPLE_THRESHOLD is
 *    suppressed (null plus a suppressed marker); the counts are still shown.
 * The route returns an allowlist projection of the partner quarterly report, so
 * a field added to the admin report later does not leak onto the public page.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  orgOutcomesRateLimit: vi.fn(),
  partnerFindUnique: vi.fn(),
  generateOutcomes: vi.fn(),
}));

vi.mock('next/server', () => ({
  NextResponse: class extends Response {
    static json(body: unknown, init?: ResponseInit) {
      return new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      });
    }
  },
}));
vi.mock('@/lib/http/clientIp', () => ({ getClientIpFromRequest: () => '203.0.113.7' }));
vi.mock('@/lib/rate-limit', () => ({ checkPublicOrgOutcomesRateLimit: mocks.orgOutcomesRateLimit }));
vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (...args: never[]) => Promise<Response>) => handler,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: { partner: { findUnique: mocks.partnerFindUnique } } }));
vi.mock('@/lib/analytics/partnerQuarterlyOutcomes', () => ({
  generatePartnerQuarterlyOutcomes: mocks.generateOutcomes,
  getDefaultQuarter: () => ({ quarter: 'Q1', year: 2026 }),
}));

import { GET } from '@/app/api/org/[slug]/outcomes/route';

type RouteContext = { params: Promise<{ slug: string }> };
const get = GET as unknown as (req: Request, ctx: RouteContext) => Promise<Response>;
const ctx: RouteContext = { params: Promise.resolve({ slug: 'partner-one' }) };

function retention(total: number) {
  return { retained: total, notRetainedOrSeparated: 0, pendingDecision: 0, total };
}

function report(overrides: { totalReferred: number; dropOffs: number; dropOffRate: number; placements?: number }) {
  return {
    quarter: 'Q2',
    year: 2026,
    periodStart: 'Apr 1, 2026',
    periodEnd: 'Jun 30, 2026',
    generatedAt: '2026-07-01T00:00:00.000Z',
    partnerName: 'Partner One',
    partnerSlug: 'partner-one',
    metrics: {
      totalReferred: overrides.totalReferred,
      totalEnrolled: 2,
      completions: 1,
      placements: overrides.placements ?? 1,
      activeMembers: 1,
      dropOffs: overrides.dropOffs,
      dropOffRate: overrides.dropOffRate,
      avgDaysToPlacement: 41,
      salaryAvg: 52000,
      salaryMedian: 52000,
      salaryMin: 52000,
      salaryMax: 52000,
    },
    retention: { ninetyDay: retention(1), hundredEightyDay: retention(0) },
    programBreakdown: [{ programSlug: 'it-support', enrolled: 2, completions: 1, placements: 1 }],
    membersList: [
      {
        id: 'm-1',
        fullName: 'Pat Member',
        email: 'pat@example.com',
        employerName: 'Acme',
        jobTitle: 'Help Desk',
        salaryOffered: 52000,
        daysToPlacement: 41,
      },
    ],
  };
}

function keysAtAnyDepth(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) keysAtAnyDepth(item, out);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysAtAnyDepth(v, out);
    }
  }
  return out;
}

async function fetchBody(): Promise<Record<string, unknown>> {
  const res = await get(new Request('http://localhost/api/org/partner-one/outcomes?quarter=Q2&year=2026'), ctx);
  expect(res.status).toBe(200);
  return res.json();
}

describe('GET /api/org/[slug]/outcomes public projection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orgOutcomesRateLimit.mockResolvedValue({ success: true });
    mocks.partnerFindUnique.mockResolvedValue({ id: 'partner-1', organizationId: 'org-1' });
  });

  it('exposes no salary, days-to-place or member fields at any depth, and no salary value', async () => {
    mocks.generateOutcomes.mockResolvedValue(report({ totalReferred: 3, dropOffs: 1, dropOffRate: 33 }));

    const body = await fetchBody();
    const keys = keysAtAnyDepth(body);

    expect(keys.filter((k) => /salary/i.test(k))).toEqual([]);
    expect(keys.filter((k) => /days/i.test(k))).toEqual([]);
    expect(keys).not.toContain('membersList');
    expect(keys).not.toContain('email');
    expect(keys).not.toContain('fullName');
    expect(JSON.stringify(body)).not.toContain('52000');
  });

  it('suppresses the drop-off rate below N=10 referrals but keeps the counts', async () => {
    mocks.generateOutcomes.mockResolvedValue(report({ totalReferred: 3, dropOffs: 1, dropOffRate: 33 }));

    const body = await fetchBody();
    const metrics = body.metrics as Record<string, unknown>;

    expect(metrics.dropOffRate).toBeNull();
    expect(metrics.dropOffRateSuppressed).toBe(true);
    expect(body.smallSampleThreshold).toBe(10);
    expect(metrics).toMatchObject({
      totalReferred: 3,
      totalEnrolled: 2,
      completions: 1,
      placements: 1,
      activeMembers: 1,
      dropOffs: 1,
    });
    expect(body.programBreakdown).toEqual([{ programSlug: 'it-support', enrolled: 2, completions: 1, placements: 1 }]);
    expect(body.retention).toEqual({ ninetyDay: retention(1), hundredEightyDay: retention(0) });
    expect(body).toMatchObject({ quarter: 'Q2', year: 2026, partnerName: 'Partner One', partnerSlug: 'partner-one' });
  });

  it('shows the drop-off rate once referrals reach the threshold', async () => {
    mocks.generateOutcomes.mockResolvedValue(report({ totalReferred: 10, dropOffs: 2, dropOffRate: 20 }));

    const metrics = (await fetchBody()).metrics as Record<string, unknown>;

    expect(metrics.dropOffRate).toBe(20);
    expect(metrics.dropOffRateSuppressed).toBe(false);
  });
});
