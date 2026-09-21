import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/**
 * The Analytics overview's Active / At-risk / Inactive tiles run the same
 * `calculateHealthStatus` as the /admin/members roster, so they must feed it
 * the same inputs: member-driven events only (no system-sent mail), plus
 * `users.last_login_at` and the newest `course_progress.last_activity_at`
 * (Mike, 2026-09-20). Otherwise the two pages disagree about who is active.
 */
const mocks = vi.hoisted(() => ({
  userCount: vi.fn(),
  userFindMany: vi.fn(),
  memberEventGroupBy: vi.fn(),
  courseProgressGroupBy: vi.fn(),
  calculateHealthStatus: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: {
  user: { count: mocks.userCount, findMany: mocks.userFindMany },
  memberEvent: { groupBy: mocks.memberEventGroupBy },
  courseProgress: { groupBy: mocks.courseProgressGroupBy },
  placementRecord: { count: async () => 0 },
  courseEnrollment: { groupBy: async () => [] },
  applyEligibilityScreening: { count: async () => 0 },
  application: { count: async () => 0 },
} }));
vi.mock('@/lib/admin/trainingDashboard', () => ({
  loadTrainingDashboardData: async () => ({
    metrics: { enrolledMembers: 0, activeInTraining: 0, notStarted: 0, completed: 0, stale: 0, averagePercent: 0 },
    rows: [],
  }),
}));
vi.mock('@/lib/admin/healthScore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/admin/healthScore')>()),
  calculateHealthStatus: mocks.calculateHealthStatus,
}));

import { loadAnalyticsOverview } from '@/lib/admin/analyticsOverview';
import { MEMBER_ACTIVITY_EVENT_WHERE } from '@/lib/admin/healthScore';

const MEMBER_ID = '00000000-0000-0000-0000-00000000cccc';
const LOGIN_AT = new Date('2026-09-18T10:00:00.000Z');
const COURSE_AT = new Date('2026-09-19T10:00:00.000Z');
const EVENT_AT = new Date('2026-09-17T10:00:00.000Z');
const scope = { orgId: 'org-1', superAdmin: false } as Parameters<typeof loadAnalyticsOverview>[0];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userCount.mockResolvedValue(1);
  mocks.userFindMany.mockResolvedValue([
    { id: MEMBER_ID, enrolledAt: new Date('2026-01-05'), lastLoginAt: LOGIN_AT },
  ]);
  mocks.memberEventGroupBy.mockImplementation(async (args: { _max?: unknown }) =>
    args._max
      ? [{ userId: MEMBER_ID, _max: { createdAt: EVENT_AT } }]
      : [{ userId: MEMBER_ID, _count: { _all: 2 } }],
  );
  mocks.courseProgressGroupBy.mockResolvedValue([
    { userId: MEMBER_ID, _max: { lastActivityAt: COURSE_AT } },
  ]);
  mocks.calculateHealthStatus.mockReturnValue('green');
});

describe('analytics overview health inputs', () => {
  it('excludes system-sent mail from both event aggregates, as the roster does', async () => {
    await loadAnalyticsOverview(scope);
    const wheres = mocks.memberEventGroupBy.mock.calls.map((call) => call[0].where);
    expect(wheres).toHaveLength(2);
    for (const where of wheres) {
      expect(where.eventName).toEqual(MEMBER_ACTIVITY_EVENT_WHERE.eventName);
      expect(where.eventName.notIn).toContain('inactive_nudge_sent');
    }
  });

  it('passes login and course activity alongside the event signals', async () => {
    await loadAnalyticsOverview(scope);
    expect(mocks.userFindMany.mock.calls[0][0].select.lastLoginAt).toBe(true);
    expect(mocks.courseProgressGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['userId'], _max: { lastActivityAt: true } }),
    );
    expect(mocks.calculateHealthStatus).toHaveBeenCalledWith({
      lastEventAt: EVENT_AT,
      recentEventCount: 2,
      enrolledAt: new Date('2026-01-05'),
      lastLoginAt: LOGIN_AT,
      lastCourseActivityAt: COURSE_AT,
    });
  });

  it('leaves missing signals null rather than inventing activity', async () => {
    mocks.userFindMany.mockResolvedValue([{ id: MEMBER_ID, enrolledAt: null, lastLoginAt: null }]);
    mocks.memberEventGroupBy.mockResolvedValue([]);
    mocks.courseProgressGroupBy.mockResolvedValue([{ userId: MEMBER_ID, _max: { lastActivityAt: null } }]);
    await loadAnalyticsOverview(scope);
    expect(mocks.calculateHealthStatus).toHaveBeenCalledWith({
      lastEventAt: null,
      recentEventCount: 0,
      enrolledAt: null,
      lastLoginAt: null,
      lastCourseActivityAt: null,
    });
  });
});
