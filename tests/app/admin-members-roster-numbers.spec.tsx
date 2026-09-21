import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

/**
 * Number-correctness regressions on the /admin/members roster
 * (admin number audit 2026-09-20): S1 (system-sent mail is not activity) and
 * S15 (the Training cell's "N active" count).
 *
 * `calculateHealthStatus` is deliberately NOT mocked here — the point of S1 is
 * which rows reach it.
 */
const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  userCount: vi.fn(),
  memberEventGroupBy: vi.fn(),
  courseProgressGroupBy: vi.fn(),
  memberProgramProgressFindMany: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('@/app/seo', () => ({ buildPageMetadataAsync: vi.fn() }));
vi.mock('@/lib/auth/server', () => ({ getUser: mocks.getUser }));
vi.mock('@/lib/tenant/adminPageScope', async () => {
  const { prisma } = await import('@/lib/db/prisma');
  return {
    resolveAdminPageTenant: async () => ({ ok: true, orgId: 'org-a', superAdmin: false }),
    withAdminPageScope: async (_scope: unknown, load: (db: unknown) => unknown) => load(prisma),
    inheritUserOrg: () => ({}),
    inheritMemberOrg: () => ({}),
    inheritLeaderOrg: () => ({}),
    inheritInvitedByOrg: () => ({}),
  };
});
vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { findMany: mocks.userFindMany, count: mocks.userCount },
  partner: { findMany: async () => [] },
  memberEvent: { groupBy: mocks.memberEventGroupBy },
  courseProgress: { groupBy: mocks.courseProgressGroupBy },
  memberProgramProgress: { findMany: mocks.memberProgramProgressFindMany },
} }));
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@/lib/platform/programCatalog', () => ({ getActivePrograms: async () => [] }));
vi.mock('@/lib/admin/fitScore', () => ({ calculateFitScore: () => 0 }));
vi.mock('@/lib/admin/applicantTriageLoad', () => ({
  loadApplicantTriageByUserIds: async () => ({}),
  localizeApplicantTriageMap: () => ({}),
}));
vi.mock('@/components/admin/MembersTable', () => ({ default: () => null }));
vi.mock('@/components/admin/MembersListNav', () => ({ default: () => null }));
vi.mock('@/components/portal/PageHeader', () => ({ default: () => null }));
vi.mock('@/components/portal/PortalPageFrame', () => ({ default: () => null }));

import AdminMembersPage from '@/app/admin/members/page';
import MembersTable from '@/components/admin/MembersTable';

type RecordValue = Record<string, unknown>;

function propsFor(tree: ReactNode, component: unknown): RecordValue | undefined {
  if (!isValidElement(tree)) return undefined;
  const element = tree as ReactElement<RecordValue>;
  if (element.type === component) return element.props;
  const children = element.props.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = propsFor(child as ReactNode, component);
    if (found) return found;
  }
  return undefined;
}

const MEMBER_ID = '00000000-0000-0000-0000-00000000aaaa';
const PROGRAM = 'software-developer-professional-certificate-ibm';

function member(overrides: RecordValue = {}): RecordValue {
  return {
    id: MEMBER_ID,
    fullName: 'Pat Jones',
    email: 'pat@example.test',
    phone: null,
    enrolledProgram: PROGRAM,
    enrolledAt: new Date('2026-01-05'),
    staleTrainingDetectedAt: null,
    assessmentScorePct: null,
    assessmentCompleted: false,
    programInterest: null,
    updatedAt: new Date('2026-09-01'),
    createdAt: new Date('2026-01-01'),
    memberStatus: 'active',
    courseEnrollments: [{ programSlug: PROGRAM, curriculumVersion: 'legacy-v1', isPrimary: true }],
    profile: {},
    partnerReferrals: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ id: 'admin-a' });
  mocks.userFindMany.mockResolvedValue([member()]);
  mocks.userCount.mockResolvedValue(1);
  mocks.memberEventGroupBy.mockResolvedValue([]);
  mocks.courseProgressGroupBy.mockResolvedValue([]);
  mocks.memberProgramProgressFindMany.mockResolvedValue([]);
});

describe('/admin/members roster population (audit S3; Mike: "remove staff in count")', () => {
  it('counts members only by default, so the roster agrees with /admin/students', async () => {
    await AdminMembersPage({ searchParams: Promise.resolve({}) });

    const where = mocks.userFindMany.mock.calls[0][0].where;
    // Staff and dogfood admins used to sit in the roster and its count line:
    // /admin/members printed 131 where /admin/students printed 126.
    expect(where.profile).toEqual({ role: 'member' });
    expect(mocks.userCount.mock.calls[0][0].where).toEqual(where);
  });

  it('keeps the dogfood view available behind ?staff=1', async () => {
    const tree = await AdminMembersPage({ searchParams: Promise.resolve({ staff: '1' }) });

    const where = mocks.userFindMany.mock.calls[0][0].where;
    expect(where.profile).toEqual({ role: { in: ['member', 'admin', 'super_admin'] } });
    // The table says so on the count line rather than quietly inflating it.
    expect(propsFor(tree, MembersTable)?.includeStaff).toBe(true);
  });

  it('does not claim to include staff when it does not', async () => {
    const tree = await AdminMembersPage({ searchParams: Promise.resolve({}) });
    expect(propsFor(tree, MembersTable)?.includeStaff).toBe(false);
  });

  it('excludes the fixture / demo accounts either way', async () => {
    for (const params of [{}, { staff: '1' }]) {
      mocks.userFindMany.mockClear();
      await AdminMembersPage({ searchParams: Promise.resolve(params) });
      const where = mocks.userFindMany.mock.calls[0][0].where;
      expect(where.email.notIn).toContain('member.success@workforceap.org');
    }
  });
});

describe('/admin/members Health inputs (audit S1)', () => {
  it('keeps nudge emails and recap digests out of both activity aggregates', async () => {
    await AdminMembersPage({ searchParams: Promise.resolve({}) });

    const eventWheres = mocks.memberEventGroupBy.mock.calls.map((call) => call[0].where);
    // Logins and course work are read too (Mike: activity is "login, any
    // Coursera action, any tools skills etc.").
    expect(mocks.userFindMany.mock.calls[0][0].select.lastLoginAt).toBe(true);
    expect(
      mocks.courseProgressGroupBy.mock.calls.some((call) => call[0]._max?.lastActivityAt === true),
    ).toBe(true);
    expect(eventWheres).toHaveLength(2);
    for (const where of eventWheres) {
      expect(where.eventName.notIn).toContain('inactive_nudge_sent');
      expect(where.eventName.notIn).toContain('weekly_recap_generated');
      expect(where.eventName.notIn).toContain('course_accountability_sent');
      expect(where.eventName.notIn).not.toContain('member_logged_in');
    }
  });

  it('marks a member whose only recent rows were nudges Inactive, not Active', async () => {
    // Emulate the table: the member's only 30-day rows are nudge emails, so
    // the aggregate is non-empty only for a query that fails to exclude them.
    mocks.memberEventGroupBy.mockImplementation(async (args: RecordValue) => {
      const where = args.where as { eventName?: { notIn: string[] } };
      const excluded = new Set(where.eventName?.notIn ?? []);
      if (excluded.has('inactive_nudge_sent')) return [];
      return 'by' in args && (args._count as unknown)
        ? [{ userId: MEMBER_ID, _count: { _all: 4 } }]
        : [{ userId: MEMBER_ID, _max: { createdAt: new Date() } }];
    });

    const tree = await AdminMembersPage({ searchParams: Promise.resolve({}) });
    const props = propsFor(tree, MembersTable);
    const rows = props?.members as Array<{ healthStatus?: string }>;
    expect(rows[0].healthStatus).toBe('red');
  });

  it('a Coursera-only learner is not marked Inactive (Mike, 2026-09-20)', async () => {
    mocks.courseProgressGroupBy.mockImplementation(async (args: RecordValue) =>
      (args._max as RecordValue | undefined)?.lastActivityAt
        ? [{ userId: MEMBER_ID, _max: { lastActivityAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) } }]
        : [],
    );

    const tree = await AdminMembersPage({ searchParams: Promise.resolve({}) });
    const rows = propsFor(tree, MembersTable)?.members as Array<{ healthStatus?: string }>;
    expect(rows[0].healthStatus).not.toBe('red');
  });
});

describe('/admin/members Training "N active" (audit S15)', () => {
  it('counts in-progress courses with real progress, grouped per program', async () => {
    await AdminMembersPage({ searchParams: Promise.resolve({}) });

    const activeCall = mocks.courseProgressGroupBy.mock.calls
      .map((call) => call[0])
      .find((args) => args.where.status === 'IN_PROGRESS');
    expect(activeCall).toBeDefined();
    // Grouping by userId alone, and counting COMPLETED rows, is what printed
    // "11 active" for a learner with 3 courses in progress.
    expect(activeCall.by).toEqual(['userId', 'programSlug']);
    expect(activeCall.where.status).toBe('IN_PROGRESS');
    expect(activeCall.where.percentComplete).toEqual({ gt: 0 });
  });

  it('ignores active courses that belong to another program', async () => {
    mocks.memberProgramProgressFindMany.mockResolvedValue([
      { userId: MEMBER_ID, programSlug: PROGRAM, averagePercent: 24, coursesCompleted: 3, lastUpdatedAt: new Date('2026-09-01') },
    ]);
    mocks.courseProgressGroupBy.mockImplementation(async (args: RecordValue) => {
      const where = args.where as RecordValue;
      if ((args._max as RecordValue | undefined)?.lastActivityAt) return [];
      if (where.status === 'IN_PROGRESS') {
        return [
          { userId: MEMBER_ID, programSlug: PROGRAM, _count: { _all: 3 } },
          { userId: MEMBER_ID, programSlug: 'comptia-a-plus', _count: { _all: 8 } },
        ];
      }
      // Anything that also counts COMPLETED rows, or does not group by
      // program, sees all 11 rows — the "11 active" the audit caught.
      return [{ userId: MEMBER_ID, programSlug: PROGRAM, _count: { _all: 11 } }];
    });

    const tree = await AdminMembersPage({ searchParams: Promise.resolve({}) });
    const props = propsFor(tree, MembersTable);
    const rows = props?.members as Array<{ liveTraining: { coursesActive: number } | null }>;
    expect(rows[0].liveTraining?.coursesActive).toBe(3);
  });

  it('folds alias program slugs onto the assigned program', async () => {
    const aliasMember = member({
      enrolledProgram: 'comptia-a-plus',
      courseEnrollments: [{ programSlug: 'comptia-a-plus', curriculumVersion: 'legacy-v1', isPrimary: true }],
    });
    mocks.userFindMany.mockResolvedValue([aliasMember]);
    mocks.memberProgramProgressFindMany.mockResolvedValue([
      { userId: MEMBER_ID, programSlug: 'comptia-a-professional-certificate', averagePercent: 40, coursesCompleted: 1, lastUpdatedAt: new Date('2026-09-01') },
    ]);
    mocks.courseProgressGroupBy.mockImplementation(async (args: RecordValue) => {
      const where = args.where as RecordValue;
      if ((args._max as RecordValue | undefined)?.lastActivityAt) return [];
      if (where.status === 'IN_PROGRESS') {
        return [{ userId: MEMBER_ID, programSlug: 'comptia-a-professional-certificate', _count: { _all: 2 } }];
      }
      return [];
    });

    const tree = await AdminMembersPage({ searchParams: Promise.resolve({}) });
    const props = propsFor(tree, MembersTable);
    const rows = props?.members as Array<{ liveTraining: { coursesActive: number } | null }>;
    expect(rows[0].liveTraining?.coursesActive).toBe(2);
  });
});
