import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * WAP-214: the /partner/milestones feed lists milestone events only, the
 * same list the rail badge counts, and never a referred member's logins or
 * page views.
 */
const db = vi.hoisted(() => ({
  events: [] as Array<{ id: string; userId: string; eventName: string; createdAt: Date; metadata: null }>,
}));

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => ({ id: 'partner-user' })) }));
vi.mock('@/lib/auth/roles', () => ({
  getPartnerForUser: vi.fn(async () => ({ partnerId: 'partner-1', partner: { organizationId: 'org-1' } })),
}));
vi.mock('@/lib/partner/referralBundle', () => ({
  loadPartnerReferralBundle: vi.fn(async () => ({
    members: [{ id: 'member-1', fullName: 'Riley Park', userCertifications: [], placementRecord: null }],
  })),
}));
vi.mock('@/lib/db/prisma', () => {
  const memberEvent = {
    findMany: vi.fn(async ({ where }: { where: { userId: { in: string[] }; eventName?: { in: string[] } } }) =>
      db.events
        .filter((e) => where.userId.in.includes(e.userId) && (!where.eventName || where.eventName.in.includes(e.eventName)))
        .map((e) => ({ ...e, user: { fullName: 'Riley Park' } })),
    ),
  };
  return { prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ memberEvent }) } };
});

import { GET } from '@/app/api/partner/milestones/route';

beforeEach(() => {
  db.events = [
    { id: 'e1', userId: 'member-1', eventName: 'member_logged_in', createdAt: new Date(), metadata: null },
    { id: 'e2', userId: 'member-1', eventName: 'resource_viewed', createdAt: new Date(), metadata: null },
    { id: 'e3', userId: 'member-1', eventName: 'course_completed', createdAt: new Date(), metadata: null },
  ];
});

describe('partner milestones feed (WAP-214)', () => {
  it('lists milestone events and drops engagement events', async () => {
    const res = await GET(new NextRequest('http://localhost/api/partner/milestones'));
    const body = (await res.json()) as { milestones: Array<{ id: string; label: string }> };
    expect(body.milestones.map((m) => m.id)).toEqual(['e3']);
  });
});
