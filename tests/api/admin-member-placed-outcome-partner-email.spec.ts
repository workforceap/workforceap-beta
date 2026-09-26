import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const h = vi.hoisted(() => ({
  callbacks: [] as Array<() => unknown>,
  findMember: vi.fn(),
  findPrior: vi.fn(),
  upsert: vi.fn(),
  sendPartnerMilestoneEmail: vi.fn(async () => undefined),
  awardPoints: vi.fn(async () => undefined),
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
      status: init?.status ?? 200,
      headers: { 'content-type': 'application/json' },
    }),
  },
  after: (callback: () => unknown) => { h.callbacks.push(callback); },
}));
vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (handler: unknown) => handler }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'admin-1' })) }));
vi.mock('@/lib/auth/roles', () => ({ isAdmin: vi.fn(async () => true) }));
vi.mock('@/lib/tenant/organization', () => ({ getActorOrganizationId: vi.fn(async () => 'org-1') }));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: (fn: (tx: Record<string, unknown>) => unknown) => fn({
      user: { findFirst: h.findMember },
      placementRecord: { findUnique: h.findPrior, upsert: h.upsert },
    }),
  },
}));
vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit/log', () => ({
  auditRequestMeta: vi.fn(() => ({})),
  logAuditEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/events/track', () => ({ trackEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/member/points', () => ({ awardPoints: h.awardPoints }));
vi.mock('@/lib/notifications/partner-notify', () => ({
  sendPartnerMilestoneEmail: h.sendPartnerMilestoneEmail,
}));

import { POST } from '@/app/api/admin/members/[id]/placed-outcome/route';

const placedAt = new Date('2026-09-25T12:00:00.000Z');

function placement(startDateVerified: boolean) {
  return {
    id: 'placement-1', userId: 'member-1', employerName: 'Example Co', jobTitle: 'Analyst',
    salaryOffered: null, placedAt, programSlug: null, notes: null, wageAtFollowUp: null,
    retentionStatus: null, startDateVerified, fundingSource: null,
    grantReportingNotes: null, retentionDecision: null, onboardingWindowEnd: null,
  };
}

async function savePlacement(startDateVerified: boolean | undefined, persistedVerified = startDateVerified ?? false) {
  h.upsert.mockResolvedValueOnce(placement(persistedVerified));
  const request = new Request('http://localhost/api/admin/members/member-1/placed-outcome', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      employerName: 'Example Co', jobTitle: 'Analyst', startDateVerified,
      placedAt: placedAt.toISOString(),
    }),
  });
  const response = await POST(request as NextRequest, { params: Promise.resolve({ id: 'member-1' }) });
  expect(response.status).toBe(200);
  expect((await response.json()).placedOutcome.startDateVerified).toBe(persistedVerified);
  await Promise.all(h.callbacks.map((callback) => callback()));
}

describe('admin placed outcome partner email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.callbacks.length = 0;
    h.findMember.mockResolvedValue({ id: 'member-1', enrolledProgram: null });
    h.findPrior.mockResolvedValue(null);
  });

  it('does not announce an unverified record to a partner', async () => {
    await savePlacement(false);
    expect(h.sendPartnerMilestoneEmail).not.toHaveBeenCalled();
    expect(h.awardPoints).toHaveBeenCalledTimes(1);
  });

  it('announces a verified placement created by staff once', async () => {
    await savePlacement(true);
    expect(h.sendPartnerMilestoneEmail).toHaveBeenCalledExactlyOnceWith(
      'member-1', 'Job placement', { Employer: 'Example Co', Role: 'Analyst' },
    );
  });

  it('announces the first verification of an existing record without re-awarding points', async () => {
    h.findPrior.mockResolvedValue(placement(false));
    await savePlacement(true);
    expect(h.sendPartnerMilestoneEmail).toHaveBeenCalledTimes(1);
    expect(h.awardPoints).not.toHaveBeenCalled();
  });

  it('does not repeat the announcement when an already verified record is edited', async () => {
    h.findPrior.mockResolvedValue(placement(true));
    await savePlacement(true);
    expect(h.sendPartnerMilestoneEmail).not.toHaveBeenCalled();
    expect(h.awardPoints).not.toHaveBeenCalled();
  });

  it('preserves verification when an unrelated edit omits the flag', async () => {
    h.findPrior.mockResolvedValue(placement(true));
    await savePlacement(undefined, true);
    expect(h.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ startDateVerified: true }),
    }));
    expect(h.sendPartnerMilestoneEmail).not.toHaveBeenCalled();
  });
});
