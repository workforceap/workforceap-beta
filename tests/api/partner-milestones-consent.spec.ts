import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Vision C3: the /api/partner/milestones feed shows a referred member's
 * progress in plain language. It never echoes a raw event name or anything a
 * writer put in event metadata, and it stays scoped to the caller's own
 * referral bundle.
 */
const h = vi.hoisted(() => ({
  user: { id: 'partner-user' } as { id: string } | null,
  partnerCtx: { partnerId: 'partner-1', partner: { organizationId: 'org-1' } } as unknown,
  events: [] as Array<{
    id: string;
    userId: string;
    eventName: string;
    createdAt: Date;
    metadata: unknown;
    user: { fullName: string };
  }>,
  findMany: vi.fn(),
}));

vi.mock('@/lib/db/withRequestGuc', () => ({ withApiGuc: (fn: unknown) => fn }));
vi.mock('@/lib/observability/captureApiError', () => ({ captureApiError: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: vi.fn(async () => h.user) }));
vi.mock('@/lib/auth/roles', () => ({ getPartnerForUser: vi.fn(async () => h.partnerCtx) }));
vi.mock('@/lib/partner/referralBundle', () => ({
  loadPartnerReferralBundle: vi.fn(async () => ({
    members: [
      {
        id: 'member-1',
        fullName: 'Riley Park',
        userCertifications: [{ certName: 'Google IT Support', earnedAt: new Date('2026-09-01T15:00:00Z') }],
        placementRecord: {
          placedAt: new Date('2026-09-10T15:00:00Z'),
          employerName: 'Acme Co',
          jobTitle: 'Help Desk Technician',
        },
      },
    ],
  })),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: { $transaction: (fn: (tx: unknown) => unknown) => fn({ memberEvent: { findMany: h.findMany } }) },
}));

import { GET } from '@/app/api/partner/milestones/route';
import { loadPartnerReferralBundle } from '@/lib/partner/referralBundle';

type Body = { milestones: Array<{ id: string; kind: string; label: string; memberId: string; memberName: string; at: string }> };

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: 'partner-user' };
  h.partnerCtx = { partnerId: 'partner-1', partner: { organizationId: 'org-1' } };
  h.events = [
    {
      id: 'ev-1',
      userId: 'member-1',
      eventName: 'program_enrolled',
      createdAt: new Date('2026-09-05T15:00:00Z'),
      metadata: { label: 'SECRET_NOTE', note: 'counselor private note' },
      user: { fullName: 'Riley Park' },
    },
  ];
  h.findMany.mockImplementation(async () => h.events);
});

describe('partner milestones consent (Vision C3)', () => {
  it('filters the event query to the partner-visible allowlist', async () => {
    await GET(new NextRequest('http://localhost/api/partner/milestones'));
    expect(h.findMany).toHaveBeenCalledTimes(1);
    const args = h.findMany.mock.calls[0][0] as { where: { eventName: { in: string[] } }; select?: Record<string, unknown> };
    expect(args.where.eventName.in).toContain('program_enrolled');
    expect(args.where.eventName.in).not.toContain('member_logged_in');
    expect(args.where.eventName.in).not.toContain('counselor_followup_needed');
    // Metadata is never loaded, so it can never be rendered.
    expect(args.select).toBeDefined();
    expect(args.select).not.toHaveProperty('metadata');
  });

  it('renders a plain-language label and never the raw name or metadata', async () => {
    const res = await GET(new NextRequest('http://localhost/api/partner/milestones'));
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('Enrolled in a program');
    expect(text).not.toContain('SECRET_NOTE');
    expect(text).not.toContain('counselor private note');
    expect(text).not.toContain('program_enrolled');
  });

  it('drops a row whose event is not partner-visible even if the query returns it', async () => {
    h.events.push({
      id: 'ev-2',
      userId: 'member-1',
      eventName: 'counselor_followup_needed',
      createdAt: new Date('2026-09-06T15:00:00Z'),
      metadata: null,
      user: { fullName: 'Riley Park' },
    });
    const res = await GET(new NextRequest('http://localhost/api/partner/milestones'));
    const body = (await res.json()) as Body;
    expect(body.milestones.map((m) => m.id)).not.toContain('ev-2');
    expect(JSON.stringify(body)).not.toContain('counselor_followup_needed');
  });

  it('keeps the certification and placement rows and the response shape unchanged', async () => {
    const res = await GET(new NextRequest('http://localhost/api/partner/milestones'));
    const body = (await res.json()) as Body;
    const labels = body.milestones.map((m) => m.label);
    expect(labels).toContain('Earned Google IT Support');
    expect(labels).toContain('Placed at Acme Co — Help Desk Technician');
    for (const row of body.milestones) {
      expect(Object.keys(row).sort()).toEqual(['at', 'id', 'kind', 'label', 'memberId', 'memberName']);
    }
  });

  it('returns 401 without a session', async () => {
    h.user = null;
    const res = await GET(new NextRequest('http://localhost/api/partner/milestones'));
    expect(res.status).toBe(401);
    expect(h.findMany).not.toHaveBeenCalled();
    expect(loadPartnerReferralBundle).not.toHaveBeenCalled();
  });

  it('returns 403 for a signed-in user who is not a partner', async () => {
    h.partnerCtx = null;
    const res = await GET(new NextRequest('http://localhost/api/partner/milestones'));
    expect(res.status).toBe(403);
    expect(h.findMany).not.toHaveBeenCalled();
    expect(loadPartnerReferralBundle).not.toHaveBeenCalled();
  });

  it('never queries events for a member outside this partner bundle', async () => {
    const res = await GET(new NextRequest('http://localhost/api/partner/milestones?memberId=other-org-member'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Body;
    expect(body.milestones).toEqual([]);
    for (const call of h.findMany.mock.calls) {
      expect(JSON.stringify(call[0])).not.toContain('other-org-member');
    }
  });
});
