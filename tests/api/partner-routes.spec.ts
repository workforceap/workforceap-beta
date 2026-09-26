import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MEMBER_ONLY_WHERE } from '@/lib/admin/memberOnlyWhere';

// ─── Mocks ───
vi.mock('next/server', () => {
  class MockNextRequest extends Request {
    get nextUrl() {
      return new URL(this.url);
    }
  }
  return {
    NextRequest: MockNextRequest,
    NextResponse: {
      json: (body: unknown, init?: ResponseInit) =>
        new Response(JSON.stringify(body), {
          ...init,
          headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
        }),
    },
  };
});

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({ get: vi.fn(), getAll: vi.fn(() => []), set: vi.fn() })),
}));

vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(),
  resolveAuthGucContext: vi.fn(() => Promise.resolve({ role: 'authenticated', userId: 'test-user' })),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  getPartnerForUser: vi.fn(),
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const partnerReferral = { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() };
  const user = { findUnique: vi.fn() };
  const partner = { findUnique: vi.fn() };
  const placementRecord = { findFirst: vi.fn() };
  const memberEvent = { create: vi.fn() };
  const mockPrisma: any = {
    partnerReferral,
    user,
    partner,
    placementRecord,
    memberEvent,
    $transaction: vi.fn(async (fn: any) => {
      if (typeof fn === 'function') return fn(mockPrisma);
      return Promise.all(fn);
    }),
  };
  return { prisma: mockPrisma };
});

vi.mock('@/lib/partner/referralBundle', () => ({
  loadPartnerReferralBundle: vi.fn(),
  toPartnerMembersListRows: vi.fn(),
}));

vi.mock('@/lib/partner/partnerPayout', () => ({
  getPartnerPlacementPayoutUsd: vi.fn(() => 500),
  buildPartnerPayoutIdempotencyKey: vi.fn((partnerId: string, placementId: string) =>
    `partner-payout:${partnerId}:${placementId}`
  ),
}));

vi.mock('@/lib/stripe/connect', () => ({
  createPayoutTransfer: vi.fn(),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
}));

vi.mock('@/lib/tenant/withTenantScope', () => ({
  withTenantScope: vi.fn(async (_orgId: string, fn: (db: unknown) => Promise<unknown>) => {
    const { prisma } = await import('@/lib/db/prisma');
    return fn(prisma);
  }),
}));

vi.mock('@/lib/partner/attentionQueue', () => ({
  loadPartnerAttentionPage: vi.fn(),
}));

vi.mock('@/lib/portal/workflowEvents', () => ({
  recordPartnerWorkflowEvent: vi.fn(),
}));

// ─── Imports after mocks ───
import { GET as dashboardGet } from '@/app/api/partner/dashboard/route';
import { GET as referralsGet, POST as referralsPost } from '@/app/api/partner/referrals/route';
import { GET as earningsGet } from '@/app/api/partner/earnings/route';
import { GET as membersGet } from '@/app/api/partner/members/route';
import { POST as payoutPost } from '@/app/api/partner/payout/route';
import { getUser } from '@/lib/auth/server';
import { getPartnerForUser, requireAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { loadPartnerReferralBundle } from '@/lib/partner/referralBundle';
import { getPartnerPlacementPayoutUsd } from '@/lib/partner/partnerPayout';
import { createPayoutTransfer } from '@/lib/stripe/connect';
import { getActorOrganizationId } from '@/lib/tenant/organization';
import { NextRequest } from 'next/server';

const UUIDS = {
  partner: '550e8400-e29b-41d4-a716-446655440001',
  user: '550e8400-e29b-41d4-a716-446655440002',
  member: '550e8400-e29b-41d4-a716-446655440003',
  member2: '550e8400-e29b-41d4-a716-446655440004',
  org: '550e8400-e29b-41d4-a716-446655440005',
  placement: '550e8400-e29b-41d4-a716-446655440006',
};

const partnerCtx = {
  partnerId: UUIDS.partner,
  partner: {
    id: UUIDS.partner,
    organizationId: UUIDS.org,
    name: 'Test Partner',
    slug: 'test-partner',
    logoUrl: null,
    brandColor: null,
    partnerType: 'referral',
  },
  hasDirectPartnerLink: true,
};

function makeMember(overrides: Partial<{
  id: string;
  fullName: string;
  enrolledProgram: string | null;
  enrolledAt: Date | null;
  placementRecord: unknown;
  courseEnrollments: unknown[];
  userCertifications: unknown[];
  applications: unknown[];
  memberProgramProgress: unknown[];
  profile: unknown;
}> = {}) {
  return {
    id: UUIDS.member,
    fullName: 'Alice Member',
    enrolledProgram: null,
    enrolledAt: null,
    updatedAt: new Date(),
    deletedAt: null,
    assessmentCompleted: false,
    courseEnrollments: [],
    placementRecord: null,
    profile: null,
    userCertifications: [],
    applications: [],
    memberProgramProgress: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// GET /api/partner/dashboard
// ─────────────────────────────────────────────
describe('GET /api/partner/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await dashboardGet(new Request('http://localhost:3000/api/partner/dashboard'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user is not a partner', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(null);

    const res = await dashboardGet(new Request('http://localhost:3000/api/partner/dashboard'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns dashboard stats for a partner with no members', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);
    vi.mocked(loadPartnerReferralBundle).mockResolvedValue({
      referrals: [],
      members: [],
      pipelineMembers: [],
      pendingPlacements: [],
    } as any);

    const res = await dashboardGet(new Request('http://localhost:3000/api/partner/dashboard'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      partnerId: UUIDS.partner,
      partnerName: 'Test Partner',
      totalMembers: 0,
      enrolledCount: 0,
      placedCount: 0,
      estimatedPayout: 0,
      payoutPerPlacement: 500,
      stageCounts: {
        applied: 0,
        enrolled: 0,
        in_training: 0,
        certified: 0,
        placed: 0,
      },
    });
  });

  it('returns dashboard stats with pipeline data', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);
    vi.mocked(getPartnerPlacementPayoutUsd).mockReturnValue(500);

    const member1 = makeMember({
      id: UUIDS.member,
      fullName: 'Alice',
      enrolledAt: new Date(),
      placementRecord: { employerName: 'Acme', jobTitle: 'Dev', placedAt: new Date(), startDateVerified: true, salaryOffered: null, onboardingWindowEnd: null, retentionDecision: null },
    });
    const member2 = makeMember({ id: UUIDS.member2, fullName: 'Bob', enrolledAt: new Date() });

    vi.mocked(loadPartnerReferralBundle).mockResolvedValue({
      referrals: [
        { member: member1, referredAt: new Date() },
        { member: member2, referredAt: new Date() },
      ],
      members: [member1, member2],
      pipelineMembers: [
        { member: member1, stage: 'placed', progress: 100, programTitle: 'IT Support', allProgramTitles: ['IT Support'], referredAt: new Date() },
        { member: member2, stage: 'enrolled', progress: 0, programTitle: '—', allProgramTitles: [], referredAt: new Date() },
      ],
      pendingPlacements: [],
    } as any);

    const res = await dashboardGet(new Request('http://localhost:3000/api/partner/dashboard'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalMembers).toBe(2);
    expect(body.enrolledCount).toBe(2);
    expect(body.placedCount).toBe(1);
    expect(body.estimatedPayout).toBe(500);
    expect(body.stageCounts.placed).toBe(1);
    expect(body.stageCounts.enrolled).toBe(1);
  });

  it('does not count a self-reported placement in dashboard payout or placed total', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);
    const member = makeMember({
      placementRecord: {
        placedAt: new Date('2026-04-01'),
        employerName: 'Private Employer',
        startDateVerified: false,
      },
    });
    vi.mocked(loadPartnerReferralBundle).mockResolvedValue({
      members: [member],
      pipelineMembers: [{ member, stage: 'enrolled' }],
    } as any);

    const res = await dashboardGet(new Request('http://localhost:3000/api/partner/dashboard'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      totalMembers: 1,
      placedCount: 0,
      estimatedPayout: 0,
      stageCounts: { enrolled: 1, placed: 0 },
    });
  });
});

// ─────────────────────────────────────────────
// GET /api/partner/referrals
// ─────────────────────────────────────────────
describe('GET /api/partner/referrals', () => {
  const makeRequest = (search = '') =>
    new NextRequest(`http://localhost:3000/api/partner/referrals${search}`, {
      method: 'GET',
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await referralsGet(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user is not a partner', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(null);

    const res = await referralsGet(makeRequest());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns all referrals for a partner', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);

    const member1 = makeMember({ id: UUIDS.member, fullName: 'Alice' });
    const member2 = makeMember({ id: UUIDS.member2, fullName: 'Bob' });

    vi.mocked(loadPartnerReferralBundle).mockResolvedValue({
      referrals: [],
      members: [member1, member2],
      pipelineMembers: [
        { member: member1, stage: 'placed', progress: 100, programTitle: 'IT Support', allProgramTitles: ['IT Support'], referredAt: new Date('2026-01-15') },
        { member: member2, stage: 'enrolled', progress: 10, programTitle: 'Data Analytics', allProgramTitles: ['Data Analytics'], referredAt: new Date('2026-02-20') },
      ],
      pendingPlacements: [],
    } as any);

    const res = await referralsGet(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.referrals).toHaveLength(2);
    expect(body.referrals[0].fullName).toBe('Alice');
    expect(body.referrals[0].stage).toBe('placed');
    expect(body.referrals[1].fullName).toBe('Bob');
    expect(body.referrals[1].stage).toBe('enrolled');
  });

  it('filters referrals by status', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);

    const member1 = makeMember({ id: UUIDS.member, fullName: 'Alice' });
    const member2 = makeMember({ id: UUIDS.member2, fullName: 'Bob' });

    vi.mocked(loadPartnerReferralBundle).mockResolvedValue({
      referrals: [],
      members: [member1, member2],
      pipelineMembers: [
        { member: member1, stage: 'placed', progress: 100, programTitle: 'IT Support', allProgramTitles: ['IT Support'], referredAt: new Date() },
        { member: member2, stage: 'enrolled', progress: 10, programTitle: 'Data Analytics', allProgramTitles: ['Data Analytics'], referredAt: new Date() },
      ],
      pendingPlacements: [],
    } as any);

    const res = await referralsGet(makeRequest('?status=enrolled'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.referrals).toHaveLength(1);
    expect(body.referrals[0].stage).toBe('enrolled');
  });
});

// ─────────────────────────────────────────────
// POST /api/partner/referrals
// ─────────────────────────────────────────────
describe('POST /api/partner/referrals', () => {
  const makeRequest = (body: Record<string, unknown>) =>
    new NextRequest('http://localhost:3000/api/partner/referrals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await referralsPost(makeRequest({ memberId: UUIDS.member }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user is not a partner', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(null);

    const res = await referralsPost(makeRequest({ memberId: UUIDS.member }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns 400 for invalid body (missing memberId)', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);

    const res = await referralsPost(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/memberId|Required|Invalid body/i);
  });

  it('returns 400 for invalid memberId format', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);

    const res = await referralsPost(makeRequest({ memberId: 'not-a-uuid' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/memberId|Required|Invalid|UUID/i);
  });

  it('returns 404 when member does not exist', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);
    vi.mocked(prisma.partnerReferral.findFirst).mockResolvedValue(null);

    const res = await referralsPost(makeRequest({ memberId: UUIDS.member }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
  });

  it('acknowledges an existing authorized referral idempotently without creating or changing attribution', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);
    vi.mocked(prisma.partnerReferral.findFirst).mockResolvedValue({
      id: 'ref-123',
      partnerId: UUIDS.partner,
      memberId: UUIDS.member,
      referredAt: new Date('2026-05-01'),
    } as any);

    const res = await referralsPost(makeRequest({ memberId: UUIDS.member }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.partnerId).toBe(UUIDS.partner);
    expect(body.memberId).toBe(UUIDS.member);
    expect(body.referredAt).toBe('2026-05-01T00:00:00.000Z');

    expect(prisma.partnerReferral.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          partnerId: UUIDS.partner,
          memberId: UUIDS.member,
          partner: { organizationId: UUIDS.org, active: true },
          // One definition of "a member" (WAP-182 item 3).
          member: expect.objectContaining({
            organizationId: UUIDS.org,
            deletedAt: null,
            ...MEMBER_ONLY_WHERE,
          }),
        }),
      })
    );
    expect(prisma.partnerReferral.create).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();

    const retry = await referralsPost(makeRequest({ memberId: UUIDS.member }));
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(body);
    expect(prisma.partnerReferral.create).not.toHaveBeenCalled();
  });

  /**
   * Would the route's member predicate admit a synthetic account whose
   * `profiles.role` is `profileRole` and which holds no `user_roles` rows?
   *
   * The predicate is `MEMBER_ONLY_WHERE`'s role half (WAP-182 item 3), which
   * rides in the single `NOT` list: "no member row AND the profile does not
   * say member" excludes, and a staff/partner profile role excludes outright.
   * A `where` carrying no role predicate at all admits everything, so
   * dropping the filter fails these cases rather than passing them.
   */
  function memberPredicateAdmits(filter: Record<string, any>, profileRole: string): boolean {
    const clauses = (filter.NOT ?? []) as Array<Record<string, any>>;
    if (!clauses.some((clause) => clause.profile || clause.userRoles)) return true;
    return !clauses.some((clause) => {
      if (clause.email) return false;
      if (clause.profile?.role?.in) return clause.profile.role.in.includes(profileRole);
      if (clause.userRoles?.none) {
        // No rows, so `none` matches; the nested OR decides on the profile role.
        return (clause.OR as Array<Record<string, any>>).some(
          (branch) => branch.profile?.role?.notIn && !branch.profile.role.notIn.includes(profileRole),
        );
      }
      return false;
    });
  }

  it.each([
    { label: 'an unrelated same-org member', memberOrg: UUIDS.org, deletedAt: null, role: 'member', linked: false },
    { label: 'a cross-org member with a stale referral', memberOrg: UUIDS.member2, deletedAt: null, role: 'member', linked: true },
    { label: 'a deleted referred member', memberOrg: UUIDS.org, deletedAt: new Date('2026-09-01'), role: 'member', linked: true },
    { label: 'a staff account with a stale referral', memberOrg: UUIDS.org, deletedAt: null, role: 'admin', linked: true },
  ])('denies $label without granting partner access', async ({ memberOrg, deletedAt, role, linked }) => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);
    // This member exists, but existence alone is not authorization. Evaluate
    // the relevant query predicates against the synthetic relationship.
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: UUIDS.member, organizationId: memberOrg } as any);
    vi.mocked(prisma.partnerReferral.findFirst).mockImplementation(((args: any) => {
      const filter = args.where.member;
      const authorized = linked
        && filter.organizationId === memberOrg
        && filter.deletedAt === deletedAt
        && memberPredicateAdmits(filter, role);
      return Promise.resolve(authorized ? { id: 'unexpected-access' } : null);
    }) as typeof prisma.partnerReferral.findFirst);

    const res = await referralsPost(makeRequest({ memberId: UUIDS.member }));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Member not found' });
    expect(prisma.partnerReferral.create).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
// POST /api/partner/payout
// ─────────────────────────────────────────────
describe('POST /api/partner/payout', () => {
  const makeRequest = (body: Record<string, unknown>) =>
    new NextRequest('http://localhost:3000/api/partner/payout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined);
    vi.mocked(getActorOrganizationId).mockResolvedValue(UUIDS.org);
    vi.mocked(prisma.partner.findUnique).mockResolvedValue({
      stripeConnectId: 'acct_test',
      stripeConnectStatus: 'active',
      name: 'Test Partner',
      partnerType: 'referral',
    } as any);
    vi.mocked(getPartnerPlacementPayoutUsd).mockReturnValue(500);
  });

  it('rejects unknown or non-referred placements before creating a Stripe transfer', async () => {
    vi.mocked(prisma.placementRecord.findFirst).mockResolvedValue(null);

    const res = await payoutPost(makeRequest({ partnerId: UUIDS.partner, placementId: UUIDS.placement }));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Placement not found for this partner' });
    expect(prisma.placementRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: UUIDS.placement,
          user: {
            organizationId: UUIDS.org,
            partnerReferrals: { some: { partnerId: UUIDS.partner } },
          },
        },
      })
    );
    expect(createPayoutTransfer).not.toHaveBeenCalled();
    expect(prisma.memberEvent.create).not.toHaveBeenCalled();
  });

  it('rejects placements that already have a payout event', async () => {
    vi.mocked(prisma.placementRecord.findFirst).mockResolvedValue({
      id: UUIDS.placement,
      userId: UUIDS.member,
      placedAt: new Date('2026-05-01'),
      startDateVerified: true,
      user: {
        memberEvents: [{ id: 'paid-event-1' }],
      },
    } as any);

    const res = await payoutPost(makeRequest({ partnerId: UUIDS.partner, placementId: UUIDS.placement }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Placement has already been paid out' });
    expect(createPayoutTransfer).not.toHaveBeenCalled();
    expect(prisma.memberEvent.create).not.toHaveBeenCalled();
  });

  it('creates a payout only for an eligible placement tied to the partner', async () => {
    vi.mocked(prisma.placementRecord.findFirst).mockResolvedValue({
      id: UUIDS.placement,
      userId: UUIDS.member,
      placedAt: new Date('2026-05-01'),
      startDateVerified: true,
      user: {
        memberEvents: [],
      },
    } as any);
    vi.mocked(createPayoutTransfer).mockResolvedValue({ id: 'tr_test' } as any);
    vi.mocked(prisma.memberEvent.create).mockResolvedValue({ id: 'paid-event-1' } as any);

    const res = await payoutPost(makeRequest({ partnerId: UUIDS.partner, placementId: UUIDS.placement }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ transferId: 'tr_test', amount: 500 });
    expect(createPayoutTransfer).toHaveBeenCalledWith(
      50000,
      'acct_test',
      { partnerId: UUIDS.partner, placementId: UUIDS.placement, triggeredBy: UUIDS.user },
      `partner-payout:${UUIDS.partner}:${UUIDS.placement}`
    );
    expect(prisma.memberEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: UUIDS.member,
          eventName: 'partner_payout_sent',
          entityType: 'PlacementRecord',
          entityId: UUIDS.placement,
        }),
      })
    );
  });
});

// ─────────────────────────────────────────────
// GET /api/partner/earnings
// ─────────────────────────────────────────────
describe('GET /api/partner/earnings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await earningsGet(new Request('http://localhost'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user is not a partner', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(null);

    const res = await earningsGet(new Request('http://localhost'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns earnings data with no placements', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);
    vi.mocked(getPartnerPlacementPayoutUsd).mockReturnValue(500);
    vi.mocked(prisma.partnerReferral.findMany).mockResolvedValue([]);

    const res = await earningsGet(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      partnerId: UUIDS.partner,
      payoutPerPlacement: 500,
      totalReferrals: 0,
      placedCount: 0,
      estimatedTotal: 0,
      placements: [],
    });
  });

  it('returns earnings data with placements', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);
    vi.mocked(getPartnerPlacementPayoutUsd).mockReturnValue(750);
    vi.mocked(prisma.partnerReferral.findMany).mockResolvedValue([
      {
        member: {
          id: UUIDS.member,
          fullName: 'Alice',
          placementRecord: { placedAt: new Date('2026-03-01'), employerName: 'Acme', jobTitle: 'Dev', startDateVerified: true },
        },
      },
      {
        member: {
          id: UUIDS.member2,
          fullName: 'Bob',
          placementRecord: null,
        },
      },
    ] as any);

    const res = await earningsGet(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalReferrals).toBe(2);
    expect(body.placedCount).toBe(1);
    expect(body.estimatedTotal).toBe(750);
    expect(body.placements).toHaveLength(1);
    expect(body.placements[0].memberName).toBe('Alice');
    expect(body.placements[0].employerName).toBe('Acme');
  });

  it('omits unverified placement details and payout while enforcing the referral tenant', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);
    vi.mocked(prisma.partnerReferral.findMany).mockResolvedValue([{
      member: {
        id: UUIDS.member,
        fullName: 'Alice',
        placementRecord: {
          placedAt: new Date('2026-03-01'),
          employerName: 'Private Employer',
          jobTitle: 'Private Role',
          startDateVerified: false,
        },
      },
    }] as any);

    const res = await earningsGet(new Request('http://localhost'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      totalReferrals: 1,
      placedCount: 0,
      estimatedTotal: 0,
      placements: [],
    });
    expect(JSON.stringify(body)).not.toContain('Private Employer');
    expect(JSON.stringify(body)).not.toContain('Private Role');
    expect(prisma.partnerReferral.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          partnerId: UUIDS.partner,
          partner: { organizationId: UUIDS.org },
          member: expect.objectContaining({
            organizationId: UUIDS.org,
            deletedAt: null,
            ...MEMBER_ONLY_WHERE,
          }),
        }),
        include: {
          member: {
            select: expect.objectContaining({
              placementRecord: { select: expect.objectContaining({ startDateVerified: true }) },
            }),
          },
        },
      }),
    );
  });
});

// ─────────────────────────────────────────────
// GET /api/partner/members
// ─────────────────────────────────────────────
describe('GET /api/partner/members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getUser).mockResolvedValue(null as any);

    const res = await membersGet(new Request('http://localhost:3000/api/partner/members'));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when user is not a partner', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(null);

    const res = await membersGet(new Request('http://localhost:3000/api/partner/members'));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
  });

  it('returns members referred by partner', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);

    const member1 = makeMember({
      id: UUIDS.member,
      fullName: 'Alice',
      enrolledAt: new Date('2026-01-01'),
      placementRecord: { employerName: 'Acme', jobTitle: 'Dev', placedAt: new Date('2026-04-01'), startDateVerified: true, salaryOffered: null, onboardingWindowEnd: null, retentionDecision: null },
    });
    const member2 = makeMember({ id: UUIDS.member2, fullName: 'Bob', enrolledAt: new Date('2026-02-01') });

    vi.mocked(loadPartnerReferralBundle).mockResolvedValue({
      referrals: [],
      members: [member1, member2],
      pipelineMembers: [
        { member: member1, stage: 'placed', progress: 100, programTitle: 'IT Support', allProgramTitles: ['IT Support'], referredAt: new Date('2026-01-15') },
        { member: member2, stage: 'in_training', progress: 45, programTitle: 'Data Analytics', allProgramTitles: ['Data Analytics'], referredAt: new Date('2026-02-20') },
      ],
      pendingPlacements: [],
    } as any);

    const res = await membersGet(new Request('http://localhost:3000/api/partner/members'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toHaveLength(2);
    expect(body.members[0].fullName).toBe('Alice');
    expect(body.members[0].stage).toBe('placed');
    expect(body.members[0].progress).toBe(100);
    expect(body.members[0].placedAt).toBeTruthy();
    expect(body.members[1].fullName).toBe('Bob');
    expect(body.members[1].stage).toBe('in_training');
    expect(body.members[1].progress).toBe(45);
    expect(body.members[1].placedAt).toBeNull();
  });

  it('redacts employer, role, and date from an unverified member placement', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);
    const member = makeMember({
      placementRecord: {
        employerName: 'Private Employer',
        jobTitle: 'Private Role',
        placedAt: new Date('2026-04-01'),
        startDateVerified: false,
      },
    });
    vi.mocked(loadPartnerReferralBundle).mockResolvedValue({
      pipelineMembers: [{
        member,
        stage: 'enrolled',
        progress: 0,
        programTitle: 'IT Support',
        allProgramTitles: ['IT Support'],
        referredAt: new Date('2026-01-15'),
      }],
    } as any);

    const res = await membersGet(new Request('http://localhost:3000/api/partner/members'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members[0]).toMatchObject({
      stage: 'enrolled',
      placedAt: null,
      employerName: null,
      jobTitle: null,
    });
    expect(JSON.stringify(body)).not.toContain('Private Employer');
    expect(JSON.stringify(body)).not.toContain('Private Role');
  });

  it('returns empty members array when partner has no referrals', async () => {
    vi.mocked(getUser).mockResolvedValue({ id: UUIDS.user } as any);
    vi.mocked(getPartnerForUser).mockResolvedValue(partnerCtx as any);
    vi.mocked(loadPartnerReferralBundle).mockResolvedValue({
      referrals: [],
      members: [],
      pipelineMembers: [],
      pendingPlacements: [],
    } as any);

    const res = await membersGet(new Request('http://localhost:3000/api/partner/members'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toEqual([]);
  });
});
