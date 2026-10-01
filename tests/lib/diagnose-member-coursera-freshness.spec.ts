import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  scopedFindFirst: vi.fn(),
  courseEnrollmentFindMany: vi.fn(),
  identityFindMany: vi.fn(),
  rawQuery: vi.fn(),
  courseProgressCount: vi.fn(),
  courseProgressFindMany: vi.fn(),
  courseProgressAggregate: vi.fn(),
  rawCourseCount: vi.fn(),
  rawCourseFindMany: vi.fn(),
  rawCourseFindFirst: vi.fn(),
  rawCourseAggregate: vi.fn(),
  rawBadgeCount: vi.fn(),
  canonicalMappingCount: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/server', () => ({
  getUser: vi.fn(async () => ({ id: 'admin-1' })),
}));
vi.mock('@/lib/tenant/adminPageScope', () => ({
  resolveAdminPageTenant: vi.fn(async () => ({ ok: true, orgId: 'org-1', superAdmin: false })),
  withAdminPageScope: vi.fn(async (
    _scope: unknown,
    callback: (db: { user: { findFirst: typeof mocks.scopedFindFirst } }) => Promise<unknown>,
  ) => callback({ user: { findFirst: mocks.scopedFindFirst } })),
}));
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    courseEnrollment: { findMany: mocks.courseEnrollmentFindMany },
    courseraIdentityMapping: { findMany: mocks.identityFindMany },
    $queryRaw: mocks.rawQuery,
    courseProgress: {
      count: mocks.courseProgressCount,
      findMany: mocks.courseProgressFindMany,
      aggregate: mocks.courseProgressAggregate,
    },
    courseraCourseProgress: {
      count: mocks.rawCourseCount,
      findMany: mocks.rawCourseFindMany,
      findFirst: mocks.rawCourseFindFirst,
      aggregate: mocks.rawCourseAggregate,
    },
    courseraBadgeProgress: { count: mocks.rawBadgeCount },
    courseraCanonicalCourseMapping: { count: mocks.canonicalMappingCount },
  },
}));
vi.mock('@/lib/coursera/programCourseList', () => ({
  loadValidatedProgramCourses: vi.fn(async () => ({ courses: [] })),
}));

import { diagnoseMemberCoursera } from '@/lib/admin/diagnoseMemberCoursera';

const NOW = new Date('2026-09-23T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

// Primary CourseEnrollment row, legacy User.enrolledProgram pointer NULL.
const NULL_POINTER_MEMBER = {
  id: 'member-1',
  email: 'member@example.com',
  fullName: 'Member One',
  organizationId: 'org-1',
  enrolledProgram: null,
  courseraEnrollmentApproved: false,
};

type AggregateArgs = { where: Record<string, unknown>; _max: Record<string, boolean> };

function setFreshness(opts: {
  orgLastSync: Date | null;
  memberLastSync: { lastSyncedAt: Date; source: string } | null;
  memberActivity: Date | null;
  localActivity: Date | null;
  xapiLatest: Date | null;
}) {
  mocks.rawCourseAggregate.mockImplementation(async (args: AggregateArgs) =>
    args._max.lastSyncedAt
      ? { _max: { lastSyncedAt: opts.orgLastSync } }
      : { _max: { lastActivityTime: opts.memberActivity } },
  );
  mocks.rawCourseFindFirst.mockResolvedValue(opts.memberLastSync);
  mocks.courseProgressAggregate.mockResolvedValue({ _max: { lastActivityAt: opts.localActivity } });
  mocks.rawQuery.mockImplementation(async (strings: TemplateStringsArray) =>
    strings.join('?').includes('COUNT(*)')
      ? [{ total: 3, ignored: 3, processed: 0, errored: 0, latest_received: opts.xapiLatest }]
      : [],
  );
}

describe('diagnoseMemberCoursera freshness and canonical enrollment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mocks.scopedFindFirst.mockResolvedValue(NULL_POINTER_MEMBER);
    mocks.courseEnrollmentFindMany.mockResolvedValue([
      { id: 'enr-1', programSlug: 'it-support-professional-certificate-google', isPrimary: true, enrolledAt: hoursAgo(24 * 20) },
    ]);
    mocks.identityFindMany.mockResolvedValue([]);
    mocks.courseProgressCount.mockResolvedValue(0);
    mocks.courseProgressFindMany.mockResolvedValue([]);
    mocks.rawCourseCount.mockResolvedValue(0);
    mocks.rawCourseFindMany.mockResolvedValue([]);
    mocks.rawBadgeCount.mockResolvedValue(0);
    mocks.canonicalMappingCount.mockResolvedValue(5);
    setFreshness({
      orgLastSync: hoursAgo(2),
      memberLastSync: { lastSyncedAt: hoursAgo(3), source: 'b4b_sync' },
      memberActivity: hoursAgo(50),
      localActivity: hoursAgo(26),
      xapiLatest: hoursAgo(26),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('warns about a missing Coursera approval for a primary-row member with a NULL pointer', async () => {
    const result = await diagnoseMemberCoursera('member-1');
    if (!result.ok) throw new Error(result.error);
    expect(result.user.canonicalProgram).toBe('it-support-professional-certificate-google');
    expect(result.verdict.map((v) => v.title)).toContain('Coursera enrollment not yet approved');
  });

  it('returns per-learner freshness facts with provenance, scoped to the member organization', async () => {
    const result = await diagnoseMemberCoursera('member-1');
    if (!result.ok) throw new Error(result.error);
    expect(result.freshness).toEqual({
      orgLastB4BSyncAt: hoursAgo(2),
      memberLastSyncAt: hoursAgo(3),
      memberLastSyncSource: 'b4b_sync',
      lastXapiReceivedAt: hoursAgo(26),
      lastLearnerActivityAt: hoursAgo(26),
    });
    for (const call of mocks.rawCourseAggregate.mock.calls) {
      expect(call[0].where).toMatchObject({ organizationId: 'org-1' });
    }
    expect(mocks.rawCourseAggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-1', source: 'b4b_sync' } }),
    );
    expect(mocks.rawCourseFindFirst.mock.calls[0][0].where).toMatchObject({ organizationId: 'org-1' });
    expect(mocks.courseProgressAggregate.mock.calls[0][0].where).toEqual({ userId: 'member-1' });
    const titles = result.verdict.map((v) => v.title);
    expect(titles.some((t) => /sync is current/i.test(t))).toBe(true);
    expect(titles).not.toContain('No Coursera B4B course rows');
  });

  it('says the sync is stale, not that the learner is inactive, when the org B4B sync is old', async () => {
    setFreshness({
      orgLastSync: hoursAgo(72),
      memberLastSync: null,
      memberActivity: null,
      localActivity: null,
      xapiLatest: null,
    });

    const result = await diagnoseMemberCoursera('member-1');
    if (!result.ok) throw new Error(result.error);
    const stale = result.verdict.find((v) => /B4B sync is stale/i.test(v.title));
    expect(stale?.status).toBe('warn');
    expect(stale?.detail).toMatch(/not evidence that the learner is inactive/);
  });

  it('reports freshness as unavailable when the freshness reads fail, instead of claiming a stale sync', async () => {
    mocks.rawCourseAggregate.mockRejectedValue(new Error('db down'));

    const result = await diagnoseMemberCoursera('member-1');
    if (!result.ok) throw new Error(result.error);
    expect(result.freshness).toBeNull();
    expect(result.verdict.map((v) => v.title)).toContain('Sync freshness unavailable');
    expect(result.verdict.some((v) => /stale/i.test(v.title))).toBe(false);
  });
});
