import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(body), {
        ...init,
        headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
      }),
  },
}));

vi.mock('@/lib/db/withRequestGuc', () => ({
  withApiGuc: (handler: (request: Request, context: unknown) => Promise<Response>) => handler,
}));

vi.mock('@/lib/auth/server', () => ({
  resolveAuthGucContext: vi.fn(async () => ({ userId: null, orgId: null, role: 'anonymous' })),
  getUser: vi.fn(),
}));

vi.mock('@/lib/auth/roles', () => ({
  isSuperAdmin: vi.fn(() => Promise.resolve(false)),
  requireAdmin: vi.fn(),
}));

vi.mock('@/lib/tenant/organization', () => ({
  getActorOrganizationId: vi.fn(),
  getSubjectOrganizationId: vi.fn(),
}));

vi.mock('@/lib/tenant/adminSubjectAccess', () => ({
  canAdminActInSubjectOrganization: vi.fn(() => true),
}));

vi.mock('@/lib/content/programs', () => ({
  getProgramBySlug: vi.fn(),
  CURRICULUM_MIGRATION_PENDING_CODE: 'CURRICULUM_MIGRATION_PENDING',
  CURRICULUM_MIGRATION_PENDING_MESSAGE: 'Training assignment paused.',
}));

vi.mock('@/lib/notifications/partner-notify', () => ({
  sendPartnerMilestoneEmail: vi.fn(),
}));

vi.mock('@/lib/member/referrals', () => ({
  rewardReferralOnEnrollment: vi.fn(async () => false),
}));

vi.mock('@/lib/member/getMemberState', () => ({
  invalidateMemberState: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => {
  const tx = {
    courseProgress: { deleteMany: vi.fn() },
    memberProgramProgress: { deleteMany: vi.fn() },
    user: { updateMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn() },
    courseEnrollment: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const prisma = {
    user: tx.user,
    organizationProgramCatalog: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (txClient: typeof tx) => Promise<unknown>) => fn(tx)),
    __tx: tx,
  };
  return { prisma };
});

import { PATCH } from '@/app/api/admin/members/[id]/program/route';
import { getUser } from '@/lib/auth/server';
import { requireAdmin } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { getActorOrganizationId, getSubjectOrganizationId } from '@/lib/tenant/organization';
import { getProgramBySlug } from '@/lib/content/programs';
import { sendPartnerMilestoneEmail } from '@/lib/notifications/partner-notify';
import { invalidateMemberState } from '@/lib/member/getMemberState';
import { rewardReferralOnEnrollment } from '@/lib/member/referrals';

const ADMIN_ID = '550e8400-e29b-41d4-a716-446655440001';
const MEMBER_ID = '550e8400-e29b-41d4-a716-446655440002';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440003';

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost:3000/api/admin/members/member/program', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/admin/members/[id]/program', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getUser).mockResolvedValue({ id: ADMIN_ID } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    vi.mocked(getActorOrganizationId).mockResolvedValue(ORG_ID);
    vi.mocked(getSubjectOrganizationId).mockResolvedValue(ORG_ID);
    vi.mocked(getProgramBySlug).mockReturnValue({ slug: 'data-analytics', title: 'Data Analytics' } as any);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: MEMBER_ID } as any);
    vi.mocked(prisma.organizationProgramCatalog.count).mockResolvedValue(0);
    vi.mocked(prisma.organizationProgramCatalog.findFirst).mockResolvedValue(null);
    (prisma as any).__tx.user.updateMany.mockResolvedValue({ count: 1 });
    (prisma as any).__tx.courseEnrollment.findMany.mockResolvedValue([]);
    (prisma as any).__tx.courseEnrollment.upsert.mockResolvedValue({ id: 'enrollment-1' });
  });

  it('changes the primary program without deleting historical progress', async () => {
    const res = await PATCH(makeRequest({ programSlug: 'data-analytics' }), {
      params: Promise.resolve({ id: MEMBER_ID }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((prisma as any).__tx.courseProgress.deleteMany).not.toHaveBeenCalled();
    expect((prisma as any).__tx.memberProgramProgress.deleteMany).not.toHaveBeenCalled();
    expect((prisma as any).__tx.courseEnrollment.updateMany).toHaveBeenCalledWith({
      where: {
        organizationId: ORG_ID,
        userId: MEMBER_ID,
        isPrimary: true,
        programSlug: { not: 'data-analytics' },
      },
      data: { isPrimary: false },
    });
    expect(sendPartnerMilestoneEmail).toHaveBeenCalledWith(MEMBER_ID, 'Program enrollment', {
      Program: 'Data Analytics',
    });
    expect(invalidateMemberState).toHaveBeenCalledWith(MEMBER_ID);
  });

  it('settles a captured member referral once the staff-led enrollment has committed (WAP-32)', async () => {
    const res = await PATCH(makeRequest({ programSlug: 'data-analytics' }), {
      params: Promise.resolve({ id: MEMBER_ID }),
    });

    expect(res.status).toBe(200);
    expect(rewardReferralOnEnrollment).toHaveBeenCalledTimes(1);
    expect(rewardReferralOnEnrollment).toHaveBeenCalledWith(MEMBER_ID);
  });

  it('does not turn a referral settlement failure into a failed program change', async () => {
    vi.mocked(rewardReferralOnEnrollment).mockRejectedValueOnce(new Error('points ledger unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const res = await PATCH(makeRequest({ programSlug: 'data-analytics' }), {
      params: Promise.resolve({ id: MEMBER_ID }),
    });

    expect(res.status).toBe(200);
    expect(errorSpy).toHaveBeenCalledWith('[admin/member-program] post-commit side effect failed', expect.any(Error));
    errorSpy.mockRestore();
  });

  it('rejects an inactive program from an explicit tenant catalog', async () => {
    vi.mocked(prisma.organizationProgramCatalog.count).mockResolvedValue(1);
    vi.mocked(prisma.organizationProgramCatalog.findFirst).mockResolvedValue(null);

    const res = await PATCH(makeRequest({ programSlug: 'data-analytics' }), {
      params: Promise.resolve({ id: MEMBER_ID }),
    });

    expect(res.status).toBe(400);
    expect(prisma.organizationProgramCatalog.findFirst).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID, programSlug: 'data-analytics', status: 'active' },
      select: { programSlug: true },
    });
    expect((prisma as any).__tx.user.updateMany).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/admin/members/[id]/program: picker parity (WAP-286)', () => {
  type Row = { programSlug: string; status: string };
  let catalog: Row[] = [];

  beforeEach(async () => {
    vi.clearAllMocks();
    // The real static catalog and alias resolution, as the picker uses them.
    const actual = await vi.importActual<typeof import('@/lib/content/programs')>('@/lib/content/programs');
    vi.mocked(getProgramBySlug).mockImplementation(actual.getProgramBySlug);
    vi.mocked(getUser).mockResolvedValue({ id: ADMIN_ID } as any);
    vi.mocked(requireAdmin).mockResolvedValue(undefined as any);
    vi.mocked(getActorOrganizationId).mockResolvedValue(ORG_ID);
    vi.mocked(getSubjectOrganizationId).mockResolvedValue(ORG_ID);
    vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: MEMBER_ID } as any);
    // An in-memory tenant catalog answering the route's exact queries.
    vi.mocked(prisma.organizationProgramCatalog.count).mockImplementation((async () => catalog.length) as any);
    vi.mocked(prisma.organizationProgramCatalog.findFirst).mockImplementation((async (args: any) => {
      const { organizationId, programSlug, status } = args.where;
      if (organizationId !== ORG_ID) return null;
      const row = catalog.find((r) => r.programSlug === programSlug && r.status === status);
      return row ? { programSlug: row.programSlug } : null;
    }) as any);
    (prisma as any).__tx.user.updateMany.mockResolvedValue({ count: 1 });
    (prisma as any).__tx.courseEnrollment.findMany.mockResolvedValue([]);
    (prisma as any).__tx.courseEnrollment.upsert.mockResolvedValue({ id: 'enrollment-1' });
  });

  const patch = (programSlug: string) =>
    PATCH(makeRequest({ programSlug }), { params: Promise.resolve({ id: MEMBER_ID }) });

  it('still rejects an alias-only tenant row: PATCH is not broadened', async () => {
    catalog = [{ programSlug: 'ai-professional-developer-certificate-ibm', status: 'active' }];
    for (const requested of ['ai-practitioner-professional-certificate-aws', 'ai-professional-developer-certificate-ibm']) {
      const res = await patch(requested);
      expect(res.status, requested).toBe(400);
      expect(await res.json()).toEqual({ error: "Program is not available for this member's organization." });
    }
    expect((prisma as any).__tx.user.updateMany).not.toHaveBeenCalled();
  });

  it('accepts exactly the programs the single-member picker marks assignable', async () => {
    const { PROGRAMS } = await vi.importActual<typeof import('@/lib/content/programs')>('@/lib/content/programs');
    const { buildMemberProgramOptions } = await import('@/lib/admin/assignableProgramOptions');
    const assignable = PROGRAMS.filter((p) => !p.curriculumMigrationPending);
    const [a, b] = assignable.filter((p) => p.slug !== 'ai-practitioner-professional-certificate-aws');
    const catalogs: Row[][] = [
      [{ programSlug: 'ai-professional-developer-certificate-ibm', status: 'active' }],
      [
        { programSlug: 'ai-professional-developer-certificate-ibm', status: 'active' },
        { programSlug: 'ai-practitioner-professional-certificate-aws', status: 'active' },
      ],
      [{ programSlug: a.slug, status: 'active' }, { programSlug: b.slug, status: 'inactive' }],
      [],
    ];
    for (const rows of catalogs) {
      catalog = rows;
      const options = buildMemberProgramOptions(rows.map((r) => ({ slug: r.programSlug, name: 'tenant', status: r.status })), null);
      for (const program of assignable) {
        const option = options.find((o) => o.slug === program.slug);
        // An empty catalog uses the component's static fallback: every unpaused program.
        const pickerAssignable = rows.length === 0
          ? true
          : Boolean(option && !option.curriculumMigrationPending && (!option.status || option.status === 'active'));
        const res = await patch(program.slug);
        expect(res.status === 200, `${JSON.stringify(rows)} ${program.slug} -> ${res.status}`).toBe(pickerAssignable);
      }
    }
  });
});
